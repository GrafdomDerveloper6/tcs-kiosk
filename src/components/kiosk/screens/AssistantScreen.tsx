"use client";

import { useEffect, useRef, useState } from "react";
import type { AssistantState, BookingDraft } from "@/lib/kiosk-types";
import { isDropoffComplete, isPickupComplete } from "@/lib/kiosk-utils";
import { t, type Lang } from "@/lib/i18n";
import { Icon } from "../icons";

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
        <video ref={(el) => setAvatarVideoEl(el)} autoPlay playsInline />
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
