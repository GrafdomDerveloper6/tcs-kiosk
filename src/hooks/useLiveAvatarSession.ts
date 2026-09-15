"use client";

import { useCallback, useRef, useState } from "react";
import type { LiveAvatarSession } from "@heygen/liveavatar-web-sdk";
import type { Lang } from "@/lib/i18n";

// livekit-client (a dependency of the SDK) touches browser-only globals at
// import time, so this is loaded lazily/client-side only, not at module top
// level (repeated calls resolve from the module cache, not a fresh fetch).
const loadSdk = () => import("@heygen/liveavatar-web-sdk");

export type TranscriptTurn = { role: "user" | "avatar"; text: string };

/**
 * Browsers can silently refuse unmuted autoplay once the click that started
 * the session is a few seconds behind us (WebRTC negotiation isn't instant).
 * When that happens the video just sits there paused — no error surfaces
 * anywhere. Retry muted so the avatar is at least visible; a muted video
 * autoplaying is allowed almost everywhere.
 */
function tryPlay(el: HTMLVideoElement, onMutedFallback: () => void) {
  el.play().catch(() => {
    el.muted = true;
    onMutedFallback();
    el.play().catch(() => {
      /* still refused — nothing more we can do without a user gesture */
    });
  });
}

/**
 * Drives the LiveAvatar video: mints a session token from our own backend
 * (never the raw API key), starts a FULL-mode session — the avatar's own
 * LLM (configured server-side, see /api/liveavatar-token) holds the actual
 * conversation and listens via its own mic pipeline (voiceChat: true); this
 * hook just surfaces the live transcript so the kiosk can watch for when
 * enough booking/tracking info has been collected.
 */
export function useLiveAvatarSession() {
  const sessionRef = useRef<LiveAvatarSession | null>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const readyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [needsUnmute, setNeedsUnmute] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptTurn[]>([]);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const startingRef = useRef<Promise<void> | null>(null);
  const readyResolversRef = useRef<Array<() => void>>([]);
  // Not exposed as state on purpose — nothing renders off these, they only
  // feed waitForAvatarQuiet's polling loop, and a plain ref avoids a
  // re-render on every one of her (frequent, chunked) speak events.
  const avatarSpeakingRef = useRef(false);
  const avatarActivityAtRef = useRef(0);

  const setVideoEl = useCallback((el: HTMLVideoElement | null) => {
    videoElRef.current = el;
    // Only attach once the stream is actually ready — attaching earlier just
    // logs an SDK warning and does nothing, since there's no track yet.
    if (el && sessionRef.current && readyRef.current) {
      sessionRef.current.attach(el);
      tryPlay(el, () => setNeedsUnmute(true));
    }
  }, []);

  /** Recovery for the muted-autoplay fallback: call from a real user tap. */
  const unmute = useCallback(() => {
    if (videoElRef.current) {
      videoElRef.current.muted = false;
      setNeedsUnmute(false);
    }
  }, []);

  const start = useCallback((lang: Lang): Promise<void> => {
    if (startingRef.current) return startingRef.current;
    if (sessionRef.current) return Promise.resolve();

    const promise = (async () => {
      try {
        const [{ LiveAvatarSession: Session, SessionEvent, AgentEventsEnum }, res] =
          await Promise.all([
            loadSdk(),
            fetch("/api/liveavatar-token", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ lang }),
            }),
          ]);
        if (!res.ok) throw new Error("token request failed");
        const { sessionToken } = await res.json();
        if (!sessionToken) throw new Error("no session token returned");

        const session = new Session(sessionToken, { voiceChat: true });
        // Tracks arrive asynchronously after start() resolves — attach only
        // once the stream is actually ready, or the SDK has nothing to bind
        // the <video> element to yet.
        session.on(SessionEvent.SESSION_STREAM_READY, () => {
          readyRef.current = true;
          setReady(true);
          if (videoElRef.current) {
            session.attach(videoElRef.current);
            tryPlay(videoElRef.current, () => setNeedsUnmute(true));
          }
          readyResolversRef.current.forEach((resolve) => resolve());
          readyResolversRef.current = [];
        });
        session.on(SessionEvent.SESSION_DISCONNECTED, () => {
          readyRef.current = false;
          setReady(false);
        });

        // The avatar's own conversation — these are final utterances (not the
        // _CHUNK streaming variants), one entry per completed turn.
        // If these ever fire without usable text the whole voice-fill chain
        // goes quiet with nothing to show for it, so say so loudly rather
        // than dropping the turn — the payload is the thing worth seeing.
        session.on(AgentEventsEnum.USER_TRANSCRIPTION, (e) => {
          if (e.text?.trim()) setTranscript((prev) => [...prev, { role: "user", text: e.text }]);
          else console.warn("[avatar] USER_TRANSCRIPTION carried no .text — payload:", e);
        });
        session.on(AgentEventsEnum.AVATAR_TRANSCRIPTION, (e) => {
          if (e.text?.trim()) setTranscript((prev) => [...prev, { role: "avatar", text: e.text }]);
          else console.warn("[avatar] AVATAR_TRANSCRIPTION carried no .text — payload:", e);
        });
        session.on(AgentEventsEnum.USER_SPEAK_STARTED, () => setUserSpeaking(true));
        session.on(AgentEventsEnum.USER_SPEAK_ENDED, () => setUserSpeaking(false));
        /* Her replies stream as several short speak_started/ended chunks in
         * quick succession (observed live: "Got" ends, "it, Sarah" starts
         * again under a second later) rather than one clean bracket around
         * the whole sentence — so avatarActivityRef below is read with a
         * debounce by waitForAvatarQuiet, never straight off the raw ended
         * event, or advancing the screen would land in the gap between two
         * chunks of the SAME reply and still feel like a mid-sentence cut. */
        session.on(AgentEventsEnum.AVATAR_SPEAK_STARTED, () => {
          avatarSpeakingRef.current = true;
          avatarActivityAtRef.current = Date.now();
        });
        session.on(AgentEventsEnum.AVATAR_SPEAK_ENDED, () => {
          avatarSpeakingRef.current = false;
          avatarActivityAtRef.current = Date.now();
        });

        /* Diagnostics only — these never feed the transcript, so they can't
         * double-count a turn. The failure we can't otherwise tell apart is
         * "the customer's speech was transcribed, but delivered on a channel
         * we aren't reading" from "nothing was transcribed at all": both look
         * like silence. Announcing each alternative channel the first time it
         * speaks turns that into a one-line answer. */
        const announced = new Set<string>();
        const announceOnce = (channel: string, payload: unknown) => {
          if (announced.has(channel)) return;
          announced.add(channel);
          console.info(
            `[avatar] transcript data also arriving on "${channel}" — if fields aren't filling, read from here instead:`,
            payload
          );
        };
        session.on(AgentEventsEnum.USER_TRANSCRIPTION_CHUNK, (e) =>
          announceOnce("user.transcription.chunk", e)
        );
        session.on(AgentEventsEnum.ELEVENLABS_AGENT_EVENT, (e) =>
          announceOnce("elevenlabs_agent_event", e)
        );

        sessionRef.current = session;
        await session.start();
      } catch {
        sessionRef.current = null;
        setFailed(true);
      }
    })();

    startingRef.current = promise;
    return promise;
  }, []);

  const stop = useCallback(async () => {
    const s = sessionRef.current;
    sessionRef.current = null;
    startingRef.current = null;
    readyRef.current = false;
    setReady(false);
    setFailed(false);
    setNeedsUnmute(false);
    setTranscript([]);
    setUserSpeaking(false);
    readyResolversRef.current = [];
    avatarSpeakingRef.current = false;
    avatarActivityAtRef.current = 0;
    if (s) {
      try {
        await s.stop();
      } catch {
        /* best-effort cleanup */
      }
    }
  }, []);

  /** Resolves once she's actually finished talking — not on the first
   *  speak_ended event (her replies arrive as several short chunks back to
   *  back, so that alone lands in the gap between two pieces of the same
   *  sentence), but once she's stayed quiet for a continuous debounceMs
   *  window. maxWaitMs is a hard ceiling regardless, so a customer is never
   *  stuck on the pickup/dropoff screen waiting on a reply that, for
   *  whatever reason, never actually finishes. */
  const waitForAvatarQuiet = useCallback((debounceMs: number, maxWaitMs: number): Promise<void> => {
    return new Promise((resolve) => {
      const startedAt = Date.now();
      let settled = false;
      const resolveOnce = () => {
        if (settled) return;
        settled = true;
        resolve();
      };
      const check = () => {
        const quiet = !avatarSpeakingRef.current && Date.now() - avatarActivityAtRef.current >= debounceMs;
        if (quiet || Date.now() - startedAt >= maxWaitMs) {
          resolveOnce();
          return;
        }
        setTimeout(check, 150);
      };
      check();
    });
  }, []);

  /** Resolves once the avatar's stream is ready, or after timeoutMs — whichever
   *  comes first. Lets a caller give the avatar a real chance to connect before
   *  giving up, without risking an indefinite hang. */
  const waitForReady = useCallback((timeoutMs: number): Promise<boolean> => {
    if (readyRef.current) return Promise.resolve(true);
    return new Promise((resolve) => {
      let settled = false;
      const resolveOnce = (value: boolean) => {
        if (settled) return;
        settled = true;
        resolve(value);
      };
      readyResolversRef.current.push(() => resolveOnce(true));
      setTimeout(() => resolveOnce(false), timeoutMs);
    });
  }, []);

  return {
    start,
    stop,
    setVideoEl,
    ready,
    failed,
    needsUnmute,
    unmute,
    waitForReady,
    waitForAvatarQuiet,
    transcript,
    userSpeaking,
  };
}
