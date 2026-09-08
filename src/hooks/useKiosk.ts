"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { t, type Lang } from "@/lib/i18n";
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
import { generateReceipt, mergeExtractionIntoDraft } from "@/lib/kiosk-utils";
import { useLiveAvatarSession, type TranscriptTurn } from "./useLiveAvatarSession";

const IDLE_MS = 90000;
const COUNTDOWN_S = 15;

export function useKiosk() {
  const [state, setState] = useState<KioskState>(freshState);
  const [assistant, setAssistant] = useState<AssistantState>(freshAssistantState);
  const [idleVisible, setIdleVisible] = useState(false);
  const [idleCountdown, setIdleCountdown] = useState(COUNTDOWN_S);

  const stateRef = useRef(state);
  const assistantRef = useRef(assistant);
  const lastActivity = useRef(0);
  const voicesCache = useRef<SpeechSynthesisVoice[]>([]);
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
  useEffect(() => {
    lastActivity.current = Date.now();
  }, []);

  /* ---------- Speech ---------- */
  useEffect(() => {
    if (!("speechSynthesis" in window)) return;
    const load = () => {
      voicesCache.current = window.speechSynthesis.getVoices();
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
  }, []);

  const speak = useCallback((text: string, lang: Lang, onEnd?: () => void) => {
    if (!("speechSynthesis" in window)) {
      onEnd?.();
      return;
    }
    try {
      window.speechSynthesis.cancel();
      const u = new SpeechSynthesisUtterance(text);
      const langCode = lang === "ur" ? "ur-PK" : "en-US";
      u.lang = langCode;
      const match = voicesCache.current.find((v) =>
        v.lang?.toLowerCase().startsWith(langCode.split("-")[0])
      );
      if (match) u.voice = match;
      if (onEnd) {
        u.onend = () => onEnd();
        u.onerror = () => onEnd();
      }
      window.speechSynthesis.speak(u);
    } catch {
      /* speech synthesis unsupported/blocked — non-fatal for the demo */
      onEnd?.();
    }
  }, []);

  /* ---------- Idle / reset ---------- */
  const markActivity = useCallback(() => {
    lastActivity.current = Date.now();
    setIdleVisible(false);
  }, []);

  useEffect(() => {
    const onPointerDown = () => markActivity();
    const onKeyDown = () => markActivity();
    const onContextMenu = (e: Event) => e.preventDefault();
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("contextmenu", onContextMenu);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("contextmenu", onContextMenu);
    };
  }, [markActivity]);

  const resetToAttract = useCallback(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    avatar.stop();
    setState(freshState());
    setAssistant(freshAssistantState());
    setIdleVisible(false);
  }, [avatar.stop]);

  useEffect(() => {
    const iv = setInterval(() => {
      if (stateRef.current.screen === "attract") return;
      if (idleVisible) return;
      if (Date.now() - lastActivity.current > IDLE_MS) {
        setIdleCountdown(COUNTDOWN_S);
        setIdleVisible(true);
      }
    }, 1000);
    return () => clearInterval(iv);
  }, [idleVisible]);

  useEffect(() => {
    if (!idleVisible) return;
    const iv = setInterval(() => {
      setIdleCountdown((s) => {
        if (s <= 1) {
          clearInterval(iv);
          resetToAttract();
          return COUNTDOWN_S;
        }
        return s - 1;
      });
    }, 1000);
    return () => clearInterval(iv);
  }, [idleVisible, resetToAttract]);

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
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    avatar.stop();
    setState((prev) => ({ ...freshState(), lang: prev.lang, screen: "language" }));
    setAssistant(freshAssistantState());
  }, [avatar.stop]);

  /* ---------- Flow transitions ---------- */
  const onTapStart = useCallback(() => {
    const lang = stateRef.current.lang;
    setState((prev) => ({ ...prev, screen: "language" }));
    setTimeout(() => speak(t(lang, "welcomeGreeting"), lang), 200);
  }, [speak]);

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
    avatar.start();
  }, [avatar.start]);

  const cancelAssistantVoice = useCallback(() => {
    avatar.stop();
    setAssistant((prev) => ({ ...prev, avatarStarted: false }));
  }, [avatar.stop]);


  const finalizeRef = useRef<() => void>(() => {});

  const applyExtraction = useCallback((extraction: BookingExtraction) => {
    setAssistant((prev) => ({
      ...prev,
      draft: mergeExtractionIntoDraft(prev.draft, extraction),
    }));
    if (extraction.complete) finalizeRef.current();
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
   *  only hangs up when leaving the form screens). */
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
    const lang = stateRef.current.lang;
    goTo("payment");
    setTimeout(() => speak(t(lang, "paymentHeadline"), lang), 200);
  }, [goTo, speak]);

  const onSimulatePayment = useCallback(
    (methodLabel: string) => {
      setTimeout(() => {
        const lang = stateRef.current.lang;
        const receipt = generateReceipt(stateRef.current.booking, methodLabel);
        setState((prev) => ({ ...prev, receipt }));
        speak(t(lang, "paymentSuccess"), lang);
      }, 900);
    },
    [speak]
  );

  const onGoBack = useCallback(() => {
    goBackScreen();
  }, [goBackScreen]);

  return {
    state,
    assistant,
    userSpeaking: avatar.userSpeaking,
    setAvatarVideoEl: avatar.setVideoEl,
    avatarFailed: avatar.failed,
    avatarNeedsUnmute: avatar.needsUnmute,
    unmuteAvatar: avatar.unmute,
    idleVisible,
    idleCountdown,
    markActivity,
    goBackScreen,
    resetToAttract,
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
