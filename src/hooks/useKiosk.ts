"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Lang } from "@/lib/i18n";
import {
  FORM_SCREENS,
  freshAssistantState,
  freshState,
  type AssistantState,
  type BookingDraft,
  type BookingExtraction,
  type DeliveryType,
  type KioskState,
  type Screen,
  type Speed,
} from "@/lib/kiosk-types";
import {
  generateReceipt,
  isDropoffComplete,
  isPickupComplete,
  mergeExtractionIntoDraft,
} from "@/lib/kiosk-utils";
import { useLiveAvatarSession, type TranscriptTurn } from "./useLiveAvatarSession";

export function useKiosk() {
  const [state, setState] = useState<KioskState>(freshState);
  const [assistant, setAssistant] = useState<AssistantState>(freshAssistantState);

  const stateRef = useRef(state);
  const assistantRef = useRef(assistant);
  const avatar = useLiveAvatarSession();

  // Keep "latest value" refs in sync after each commit rather than mutating
  // them mid-render, so the refs stay usable inside async callbacks (speech
  // synthesis handlers, session events) without becoming a render-time side effect.
  useEffect(() => {
    stateRef.current = state;
  }, [state]);
  useEffect(() => {
    assistantRef.current = assistant;
  }, [assistant]);

  // Kiosk hardening: no right-click context menu on a public-facing screen.
  useEffect(() => {
    const onContextMenu = (e: Event) => e.preventDefault();
    document.addEventListener("contextmenu", onContextMenu);
    return () => document.removeEventListener("contextmenu", onContextMenu);
  }, []);

  /* ---------- Navigation ---------- */
  /** The avatar keeps talking across both detail screens — hanging up
   *  between pickup and delivery would cut the customer off mid-sentence
   *  and cost another session to restart. */
  const goTo = useCallback(
    (screen: Screen) => {
      if (!FORM_SCREENS.includes(screen)) avatar.stop();
      setState((prev) => ({
        ...prev,
        backStack: [...prev.backStack, prev.screen],
        screen,
      }));
    },
    [avatar.stop]
  );

  /** Stepping back keeps the draft — the detail screens, item type and
   *  speed are all separate steps now, so going back must not wipe what's
   *  already been collected. The draft is cleared when the session restarts
   *  instead (attract / home / language). */
  const goBackScreen = useCallback(() => {
    const { backStack } = stateRef.current;
    if (backStack.length === 0) return;
    const target = backStack[backStack.length - 1];
    if (!FORM_SCREENS.includes(target)) avatar.stop();
    setState((prev) => {
      if (prev.backStack.length === 0) return prev;
      const stack = [...prev.backStack];
      const screen = stack.pop() as Screen;
      return { ...prev, backStack: stack, screen };
    });
  }, [avatar.stop]);

  const resetToLanguage = useCallback(() => {
    avatar.stop();
    setState((prev) => ({ ...freshState(), lang: prev.lang, screen: "language" }));
    setAssistant(freshAssistantState());
  }, [avatar.stop]);

  /* ---------- Flow transitions ---------- */
  const onTapStart = useCallback(() => {
    setState((prev) => ({ ...prev, screen: "language" }));
  }, []);

  const onLanguageSelected = useCallback(
    (lang: Lang) => {
      setState((prev) => ({
        ...prev,
        lang,
        backStack: [...prev.backStack, prev.screen],
        screen: "pickup",
      }));
      setAssistant(freshAssistantState());
    },
    []
  );

  /* ---------- The two detail screens: avatar (tap to talk) + live form ----------
   * The avatar's own LLM (FULL mode, configured server-side) drives a free
   * conversation — we don't script it. We watch the live transcript and ask
   * our own /api/extract-booking to pull structured fields out of it after
   * each thing the customer says, and write whatever it found straight into
   * the same draft the on-screen inputs are bound to. Touch edits write to
   * that draft too — voice and touch are just two ways to fill one form.
   * One draft and one avatar session span both screens, so anything the
   * customer volunteers early (a delivery city while still on pickup) is
   * already filled in when they get there. */
  const updateDraftField = useCallback(
    <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) => {
      setAssistant((prev) => ({ ...prev, draft: { ...prev.draft, [key]: value } }));
    },
    []
  );

  const startAssistantVoice = useCallback(() => {
    setAssistant((prev) => ({ ...prev, avatarStarted: true }));
    avatar.start(stateRef.current.lang);
  }, [avatar.start]);

  const cancelAssistantVoice = useCallback(() => {
    avatar.stop();
    setAssistant((prev) => ({ ...prev, avatarStarted: false }));
  }, [avatar.stop]);


  const finalizeRef = useRef<() => void>(() => {});
  const finalizePickupRef = useRef<() => void>(() => {});

  const applyExtraction = useCallback((extraction: BookingExtraction) => {
    const screen = stateRef.current.screen;

    /* /api/extract-booking re-derives EVERY field from the full transcript
     * on every call, not just what's new — so once the conversation has
     * moved past pickup, a later extraction call (now looking at a longer
     * transcript that also contains the dropoff Q&A) can occasionally
     * misattribute a dropoff answer back onto a pickup field. The merge
     * below only guards against an explicit null overwriting a value, not
     * a wrong-but-non-null re-guess replacing an already-correct one — so
     * without this, a solid pickup answer could silently get clobbered
     * minutes later while the customer is mid-way through dropoff. Once
     * we've moved on, pickup is done talking about; lock it. */
    const pickupLocked = screen !== "pickup";
    const safeExtraction = pickupLocked
      ? {
          ...extraction,
          pickupName: null,
          pickupPhone: null,
          pickupStreet: null,
          pickupCity: null,
        }
      : extraction;

    const draft = mergeExtractionIntoDraft(assistantRef.current.draft, safeExtraction);
    setAssistant((prev) => ({ ...prev, draft }));

    /* Voice-driven auto-advance, symmetric across both detail screens: the
     * moment the four fields for whichever screen is currently showing are
     * known, move straight on — no manual Continue tap, and (for dropoff)
     * no waiting on a spoken confirmation round-trip either. Once delivery
     * details are done, the customer takes it from there by touch (item
     * type, speed, review, payment are all tap-only screens anyway), so
     * there's nothing left for Sana's job to gate on. */
    if (screen === "pickup" && isPickupComplete(draft)) {
      finalizePickupRef.current();
    } else if (screen === "dropoff" && isDropoffComplete(draft)) {
      finalizeRef.current();
    }
  }, []);

  const extractingRef = useRef(false);
  const pendingTranscriptRef = useRef<TranscriptTurn[] | null>(null);
  const runExtractionRef = useRef<(t: TranscriptTurn[]) => void>(() => {});

  const runExtraction = useCallback(
    (transcript: TranscriptTurn[]) => {
      extractingRef.current = true;
      const finish = (extraction: BookingExtraction | null) => {
        extractingRef.current = false;
        if (extraction) applyExtraction(extraction);
        /* Anything said while that request was in flight has to be picked up
         * here: the effect below only fires on new transcript entries, so a
         * turn skipped for being mid-request would otherwise never be
         * extracted at all — worst case the customer's closing words. */
        const pending = pendingTranscriptRef.current;
        pendingTranscriptRef.current = null;
        if (pending) runExtractionRef.current(pending);
      };
      fetch("/api/extract-booking", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ transcript }),
      })
        .then((res) => (res.ok ? (res.json() as Promise<BookingExtraction>) : null))
        .then(finish)
        .catch(() => finish(null));
    },
    [applyExtraction]
  );

  useEffect(() => {
    runExtractionRef.current = runExtraction;
  }, [runExtraction]);

  // Re-run extraction whenever the customer finishes saying something new.
  useEffect(() => {
    const transcript = avatar.transcript;
    const last = transcript[transcript.length - 1];
    if (!last || last.role !== "user") return;
    if (!assistantRef.current.avatarStarted) return;
    if (extractingRef.current) {
      pendingTranscriptRef.current = transcript;
      return;
    }
    runExtraction(transcript);
  }, [avatar.transcript, runExtraction]);

  /** Pickup → delivery. The avatar stays connected across the hop (goTo
   *  only hangs up when leaving the form screens). Called by the Continue
   *  button, and — via applyExtraction above — automatically the moment
   *  voice fills in the last pickup field, no tap required. */
  const finalizePickup = useCallback(() => {
    goTo("dropoff");
  }, [goTo]);

  /** Delivery → item type. Both detail screens are done, so the avatar's
   *  work is finished and the session can close. Called by the Continue
   *  button, and by the AI's own "complete" signal via applyExtraction. */
  const finalizeAssistant = useCallback(() => {
    avatar.stop();
    goTo("deliveryType");
  }, [goTo, avatar.stop]);

  useEffect(() => {
    finalizePickupRef.current = finalizePickup;
  }, [finalizePickup]);

  useEffect(() => {
    finalizeRef.current = finalizeAssistant;
  }, [finalizeAssistant]);

  const selectDeliveryType = useCallback(
    (deliveryType: NonNullable<DeliveryType>) => {
      setAssistant((prev) => ({ ...prev, draft: { ...prev.draft, deliveryType } }));
      goTo("speed");
    },
    [goTo]
  );

  /** Last piece of the booking — commit the whole draft and move on. */
  const selectSpeed = useCallback(
    (speed: NonNullable<Speed>) => {
      const draft = assistantRef.current.draft;
      setState((prev) => ({
        ...prev,
        booking: {
          deliveryType: draft.deliveryType,
          pickup: {
            name: draft.pickupName || undefined,
            phone: draft.pickupPhone || undefined,
            street: draft.pickupStreet || undefined,
            city: draft.pickupCity || undefined,
          },
          dropoff: {
            name: draft.dropoffName || undefined,
            phone: draft.dropoffPhone || undefined,
            street: draft.dropoffStreet || undefined,
            city: draft.dropoffCity || undefined,
          },
          speed,
        },
      }));
      goTo("review");
    },
    [goTo]
  );

  const onConfirmPay = useCallback(() => {
    goTo("payment");
  }, [goTo]);

  const onSimulatePayment = useCallback((methodLabel: string) => {
    setTimeout(() => {
      const receipt = generateReceipt(stateRef.current.booking, methodLabel);
      setState((prev) => ({ ...prev, receipt }));
    }, 900);
  }, []);

  const onGoBack = useCallback(() => {
    goBackScreen();
  }, [goBackScreen]);

  return {
    state,
    assistant,
    userSpeaking: avatar.userSpeaking,
    setAvatarVideoEl: avatar.setVideoEl,
    avatarReady: avatar.ready,
    avatarFailed: avatar.failed,
    avatarNeedsUnmute: avatar.needsUnmute,
    unmuteAvatar: avatar.unmute,
    goBackScreen,
    resetToLanguage,
    onTapStart,
    onLanguageSelected,
    updateDraftField,
    startAssistantVoice,
    cancelAssistantVoice,
    finalizePickup,
    finalizeAssistant,
    selectDeliveryType,
    selectSpeed,
    onConfirmPay,
    onSimulatePayment,
    onNewRequest: resetToLanguage,
    onGoBack,
    onGoHome: resetToLanguage,
  };
}
