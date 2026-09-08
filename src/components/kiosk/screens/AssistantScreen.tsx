"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import type { AssistantState, BookingDraft } from "@/lib/kiosk-types";
import { isDropoffComplete, isPickupComplete } from "@/lib/kiosk-utils";
import { t, type Lang } from "@/lib/i18n";
import { Icon } from "../icons";
import { useChromaKeyCanvas } from "@/hooks/useChromaKeyCanvas";

// The avatar's own green-screen backdrop, sampled directly from a captured
// live frame (see tune-key.js) — this is a flat, evenly lit screen, so a
// single exact color plus a feathered distance band is enough for a clean
// key without per-avatar recalibration.
const GREEN_SCREEN_KEY = [0, 216, 2] as const;

/** A text input that briefly pulses when its value changes while the
 *  customer isn't actively typing in it — i.e. the avatar just filled it
 *  live from something they said. Manual edits (while focused) don't pulse. */
function LiveField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  const [justFilled, setJustFilled] = useState(false);
  const prevValue = useRef(value);
  const focusedRef = useRef(false);

  useEffect(() => {
    if (value !== prevValue.current && !focusedRef.current && value.trim()) {
      setJustFilled(true);
      const timer = setTimeout(() => setJustFilled(false), 700);
      prevValue.current = value;
      return () => clearTimeout(timer);
    }
    prevValue.current = value;
  }, [value]);

  return (
    <label className="field">
      <span className="field-label">{label}</span>
      <input
        className={`field-input ${justFilled ? "filled" : ""}`}
        type="text"
        value={value}
        placeholder={placeholder}
        onFocus={() => {
          focusedRef.current = true;
        }}
        onBlur={() => {
          focusedRef.current = false;
        }}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}

/** One screen, two uses: pickup details and delivery details. Same avatar,
 *  same live-filling draft — only which four fields are on screen differs. */
export function AssistantScreen({
  section,
  assistant,
  lang,
  userSpeaking,
  ready,
  failed,
  needsUnmute,
  setAvatarVideoEl,
  onStartVoice,
  onCancelVoice,
  onUnmute,
  onUpdateField,
  onContinue,
}: {
  section: "pickup" | "dropoff";
  assistant: AssistantState;
  lang: Lang;
  userSpeaking: boolean;
  ready: boolean;
  failed: boolean;
  needsUnmute: boolean;
  setAvatarVideoEl: (el: HTMLVideoElement | null) => void;
  onStartVoice: () => void;
  onCancelVoice: () => void;
  onUnmute: () => void;
  onUpdateField: <K extends keyof BookingDraft>(key: K, value: BookingDraft[K]) => void;
  onContinue: () => void;
}) {
  const { draft } = assistant;
  /* A session that failed to start (missing key, no credits, no network) is
   * not "live" however far the start attempt got — derived rather than
   * stored so Talk frees itself up for a retry the moment it fails. */
  const live = assistant.avatarStarted && !failed;

  // The <video> keeps playing (audio, LiveAvatar's own attach()/play() calls)
  // but stays invisible — the <canvas> beside it is what's actually shown,
  // redrawn every frame with the green screen keyed out. Two refs on one
  // element: setAvatarVideoEl hands it to the session hook for attach(),
  // videoRef is what the chroma-key loop reads frames from.
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  useChromaKeyCanvas(videoRef, canvasRef, live, { keyColor: GREEN_SCREEN_KEY });

  const isPickup = section === "pickup";
  const complete = isPickup ? isPickupComplete(draft) : isDropoffComplete(draft);

  const fields = isPickup
    ? ([
        ["fieldName", "pickupName"],
        ["fieldPhone", "pickupPhone"],
        ["fieldStreet", "pickupStreet"],
        ["fieldCity", "pickupCity"],
      ] as const)
    : ([
        ["fieldName", "dropoffName"],
        ["fieldPhone", "dropoffPhone"],
        ["fieldStreet", "dropoffStreet"],
        ["fieldCity", "dropoffCity"],
      ] as const);

  return (
    <div className="assistant-layout">
      <div className="assistant-form-col">
        <div className="headline">
          {t(lang, isPickup ? "pickupHeadline" : "dropoffHeadline")}
        </div>
        <div className="subhead">{t(lang, "assistantSub")}</div>
        <div className="rule" />

        <div className="field-form">
          {fields.map(([labelKey, key]) => (
            <LiveField
              key={key}
              label={t(lang, labelKey)}
              value={draft[key]}
              onChange={(v) => onUpdateField(key, v)}
            />
          ))}
        </div>

        <button className="primary-btn assistant-continue" disabled={!complete} onClick={onContinue}>
          {t(lang, "continueLabel")}
        </button>
      </div>

      <div className="assistant-avatar-col">
        <video
          ref={(el) => {
            videoRef.current = el;
            setAvatarVideoEl(el);
          }}
          className="avatar-source-video"
          autoPlay
          playsInline
        />
        {/* A static photo of Sana, always on screen — HeyGen's own preview
            image for this avatar, already a genuine cutout (real alpha
            channel, not baked-in white). Talk only replaces this with the
            live feed once the stream actually has frames to show; without
            it the avatar column would just be empty white space until the
            first live frame arrives, several seconds after tapping Talk. */}
        <Image
          src="/sana-poster.png"
          alt=""
          fill
          priority
          className="avatar-poster"
          hidden={ready}
        />
        <canvas ref={canvasRef} className="avatar-keyed-canvas" hidden={!ready} />
        {needsUnmute && (
          <button className="voice-unmute-btn" onClick={onUnmute} aria-label={t(lang, "voiceUnmute")}>
            <Icon name="volumeMuted" />
          </button>
        )}
        {/* Mic, notice and buttons share one bottom-anchored stack so they
            lay out in normal flow and can't overlap each other at any width
            — positioning each one absolutely meant hand-tuning clearances
            per breakpoint, and they collided on narrow screens anyway. */}
        <div className="voice-controls">
          {live && (
            <div className={`voice-mic-indicator ${userSpeaking ? "listening" : ""}`}>
              <Icon name="mic" />
            </div>
          )}
          {failed && <div className="voice-error">{t(lang, "voiceUnavailable")}</div>}
          <div className="voice-buttons">
            <button
              className="voice-btn voice-btn-talk"
              disabled={live}
              onClick={onStartVoice}
            >
              <Icon name="mic" />
              {t(lang, "talkLabel")}
            </button>
            <button
              className="voice-btn voice-btn-cancel"
              disabled={!live}
              onClick={onCancelVoice}
            >
              {t(lang, "cancelLabel")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
