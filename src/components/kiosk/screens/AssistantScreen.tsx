"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Image from "next/image";
import type { AssistantState, BookingDraft } from "@/lib/kiosk-types";
import { isDropoffComplete, isPickupComplete } from "@/lib/kiosk-utils";
import { t, type Lang } from "@/lib/i18n";
import { Icon, type IconName } from "../icons";
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
  icon,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  icon: IconName;
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
      <span className="field-input-wrap">
        {/* Label rides on the input's top border (an outlined-field notch),
            so it labels the box without taking a row of its own. */}
        <span className="field-label">{label}</span>
        <span className="field-input-icon">
          <Icon name={icon} />
        </span>
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
      </span>
    </label>
  );
}

/** One screen, two uses: pickup details and delivery details. Same avatar,
 *  same live-filling draft — only which four fields are on screen differs. */
export function AssistantScreen({
  section,
  stepper,
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
  /** Progress bar, mounted in this column so the avatar panel beside it can
   *  run the full height of the frame. */
  stepper: ReactNode;
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

  /* "Type instead" only shows once she isn't listening (see the live/cancel
   * swap below), so it just needs to raise the keyboard on the first field
   * still waiting on an answer — no session to drop here. */
  const formRef = useRef<HTMLDivElement | null>(null);
  const focusFirstEmptyField = () => {
    const inputs = Array.from(formRef.current?.querySelectorAll("input") ?? []);
    (inputs.find((input) => !input.value.trim()) ?? inputs[0])?.focus();
  };

  const fields = isPickup
    ? ([
        ["fieldName", "fieldNamePlaceholder", "pickupName", "person"],
        ["fieldPhone", "fieldPhonePlaceholder", "pickupPhone", "phone"],
        ["fieldStreet", "fieldStreetPlaceholder", "pickupStreet", "pin"],
        ["fieldCity", "fieldCityPlaceholder", "pickupCity", "building"],
      ] as const)
    : ([
        ["fieldName", "fieldNamePlaceholder", "dropoffName", "person"],
        ["fieldPhone", "fieldPhonePlaceholder", "dropoffPhone", "phone"],
        ["fieldStreet", "fieldStreetPlaceholder", "dropoffStreet", "pin"],
        ["fieldCity", "fieldCityPlaceholder", "dropoffCity", "building"],
      ] as const);

  return (
    <div className="assistant-layout">
      <div className="assistant-form-col">
        {stepper}
        <div className="headline">
          {t(lang, isPickup ? "pickupHeadline" : "dropoffHeadline")}{" "}
          <span className="headline-accent">
            {t(lang, isPickup ? "pickupHeadlineAccent" : "dropoffHeadlineAccent")}
          </span>
        </div>
        <div className="subhead">{t(lang, "assistantSub")}</div>

        <div className="field-form" ref={formRef}>
          {fields.map(([labelKey, placeholderKey, key, icon]) => (
            <LiveField
              key={key}
              label={t(lang, labelKey)}
              placeholder={t(lang, placeholderKey)}
              value={draft[key]}
              onChange={(v) => onUpdateField(key, v)}
              icon={icon}
            />
          ))}
        </div>

        <button className="primary-btn assistant-continue" disabled={!complete} onClick={onContinue}>
          {t(lang, "continueLabel")}
          <Icon name="send" />
        </button>
      </div>

      <div className="assistant-avatar-col">
        {/* Decorative backdrop she stands in front of — her cutout's real
            transparency shows it straight through. Never mirrored under
            RTL: it carries TCS branding that would read backwards. */}
        <div className="avatar-bg-fx" aria-hidden="true">
          <Image
            src="/avatar-backdrop.png"
            alt=""
            fill
            priority
            sizes="(max-width: 900px) 40vw, 44vw"
            className="avatar-bg-img"
          />
        </div>

        {/* Full-bleed portrait, not boxed into its own card — she's meant
            to read as one continuous scene with the backdrop above, with
            her real (chroma-keyed / cutout) transparency showing it
            straight through rather than sitting on a separate panel. */}
        <div className="avatar-frame">
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
              it the avatar column would just be empty backdrop until the
              first live frame arrives, several seconds after tapping Talk. */}
          <Image
            src="/sana-poster.png"
            alt=""
            fill
            priority
            sizes="(max-width: 900px) 40vw, 44vw"
            className="avatar-poster"
            hidden={ready}
          />
          <canvas ref={canvasRef} className="avatar-keyed-canvas" hidden={!ready} />
        </div>

        {needsUnmute && (
          <button className="voice-unmute-btn" onClick={onUnmute} aria-label={t(lang, "voiceUnmute")}>
            <Icon name="volumeMuted" />
          </button>
        )}

        <div className="voice-controls">
          {failed && <div className="voice-error">{t(lang, "voiceUnavailable")}</div>}
          <div className="voice-card">
            <div className="voice-cell voice-cell-mic">
              <div className="voice-mic-wrap">
                <span className={`voice-wave ${live ? "active" : ""} ${userSpeaking ? "loud" : ""}`} aria-hidden="true">
                  <i /><i /><i /><i /><i />
                </span>
                <button
                  className={`voice-mic-btn ${live ? "live" : ""} ${userSpeaking ? "listening" : ""}`}
                  disabled={live}
                  onClick={onStartVoice}
                  aria-label={t(lang, "talkLabel")}
                >
                  <Icon name="mic" />
                </button>
                <span className={`voice-wave ${live ? "active" : ""} ${userSpeaking ? "loud" : ""}`} aria-hidden="true">
                  <i /><i /><i /><i /><i />
                </span>
              </div>
              <span className="voice-cell-label">{t(lang, "talkLabel")}</span>
            </div>
            <span className="voice-card-divider" />
            {/* While she's listening, the second cell swaps to Cancel — the
                thing a customer actually wants right then is to stop her,
                not to jump into typing. It reverts to Type instead the
                moment the session ends (onCancelVoice or a normal finish). */}
            {live ? (
              <button
                className="voice-cell voice-cell-type voice-cell-cancel"
                onClick={onCancelVoice}
              >
                <span className="voice-type-icon voice-type-icon-cancel">
                  <Icon name="close" />
                </span>
                <span className="voice-cell-label">{t(lang, "cancelLabel")}</span>
              </button>
            ) : (
              <button className="voice-cell voice-cell-type" onClick={focusFirstEmptyField}>
                <span className="voice-type-icon">
                  <Icon name="keyboard" />
                </span>
                <span className="voice-cell-label">{t(lang, "typeInstead")}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
