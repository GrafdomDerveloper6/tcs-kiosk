"use client";

import Image from "next/image";
import { useKiosk } from "@/hooks/useKiosk";
import { t } from "@/lib/i18n";
import {
  BOOKING_STEP_GROUPS,
  currentStepIndex,
  FORM_SCREENS,
  WIDE_SCREENS,
} from "@/lib/kiosk-types";
import { Icon } from "./icons";
import { SelectionScreen } from "./screens/SelectionScreen";
import { LanguageScreen } from "./screens/LanguageScreen";
import { AssistantScreen } from "./screens/AssistantScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { PaymentScreen } from "./screens/PaymentScreen";

export function KioskApp() {
  const k = useKiosk();
  const { state } = k;
  const lang = state.lang;
  const dir = t(lang, "dir");

  const backDisabled = state.backStack.length === 0 || state.screen === "attract";
  const stepIdx = currentStepIndex(state.screen, state.receipt !== null);

  /* On the two detail screens the avatar panel runs the full height of the
   * frame, header to footer, so the progress bar belongs inside the form
   * column beside it rather than as a full-width band above both. Same
   * markup either way — only where it's mounted changes. */
  const isSplit = FORM_SCREENS.includes(state.screen);
  const stepper =
    stepIdx >= 0 ? (
      <div className="stepper">
        {BOOKING_STEP_GROUPS.map((group, i) => (
          <div
            key={group.labelKey}
            className={`step ${i < stepIdx ? "done" : ""} ${i === stepIdx ? "current" : ""}`}
          >
            <span className="step-dot">{i < stepIdx ? <Icon name="check" /> : i + 1}</span>
            <span className="step-label">{t(lang, group.labelKey)}</span>
            {i < BOOKING_STEP_GROUPS.length - 1 && <span className="step-line" />}
          </div>
        ))}
      </div>
    ) : null;

  return (
    <div className="viewport-bg">
      <div
        className={`kiosk ${WIDE_SCREENS.includes(state.screen) ? "kiosk-hero" : ""} ${
          isSplit ? "kiosk-split" : ""
        }`}
        id="kiosk"
        dir={dir}
      >
        <div className="app-header">
          <div className="app-header-left">
            <Image
              src="/tcs-logo.png"
              alt="TCS"
              width={375}
              height={170}
              priority
              className="app-header-logo"
            />
            <span className="app-header-divider" />
            <span className="app-header-tagline">{t(lang, "attractTagline")}</span>
          </div>
          <button type="button" className="app-header-help">
            <Icon name="headset" />
            <span>{t(lang, "needHelp")}</span>
          </button>
        </div>

        {!isSplit && stepper}

        <div className="content-wrap">
          <div className="bg-fx">
            <span />
            <span />
            <span />
          </div>
          <div className="content" dir={dir}>
            {/* Both detail screens share one pane key on purpose: the live
                avatar <video> lives in here, and remounting it between
                pickup and delivery would tear the stream off the element
                mid-conversation. */}
            <div
              className="screen-pane"
              key={FORM_SCREENS.includes(state.screen) ? "details" : state.screen}
            >
              {renderScreen()}
            </div>
          </div>
        </div>

        {state.screen !== "attract" && (
          <div className="bottom-bar">
            <button className="nav-btn back" disabled={backDisabled} onClick={k.onGoBack}>
              <Icon name="back" />
              <span>{t(lang, "back")}</span>
            </button>
            {WIDE_SCREENS.includes(state.screen) && (
              <div className="bottom-bar-tagline">
                <span className="bottom-bar-tagline-rule" />
                <Icon name="truck" />
                <span>{t(lang, "footerTagline")}</span>
                <span className="bottom-bar-tagline-rule" />
              </div>
            )}
            <button className="nav-btn" onClick={k.onGoHome}>
              <Icon name="home" />
              <span>{t(lang, "home")}</span>
            </button>
          </div>
        )}

        {state.screen === "attract" && (
          <div className="attract-overlay" onClick={k.onTapStart}>
            <svg
              className="attract-waves"
              viewBox="0 0 1600 420"
              preserveAspectRatio="none"
              aria-hidden="true"
            >
              <path
                className="attract-wave attract-wave-1"
                d="M0,250 C 200,180 350,320 550,260 C 750,200 900,300 1100,240 C 1300,180 1450,260 1600,220"
                fill="none"
              />
              <path
                className="attract-wave attract-wave-2"
                d="M0,300 C 250,220 400,360 600,300 C 800,240 950,340 1150,280 C 1350,220 1500,300 1600,270"
                fill="none"
              />
              <path
                className="attract-wave attract-wave-3"
                d="M0,340 C 220,260 380,400 580,340 C 780,280 940,380 1150,320 C 1350,260 1500,340 1600,310"
                fill="none"
              />
            </svg>

            <div className="attract-copy">
              <Image
                src="/tcs-logo.png"
                alt="TCS"
                width={375}
                height={170}
                priority
                className="attract-logo"
              />
              <div className="attract-tagline">{t(lang, "attractTagline")}</div>

              <div className="attract-title">
                {t(lang, "attractTitle")}{" "}
                <span className="attract-title-accent">{t(lang, "attractTitleAccent")}</span>
              </div>
              <div className="attract-sub">{t(lang, "attractSub")}</div>

              <div className="attract-mic-ring">
                <span className="attract-mic-pulse" />
                <span className="attract-mic-pulse attract-mic-pulse-delay" />
                <div className="attract-mic-circle">
                  <Icon name="mic" />
                </div>
              </div>

              <div className="attract-tap">{t(lang, "attractTap")}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  function renderScreen() {
    switch (state.screen) {
      case "language":
        return <LanguageScreen lang={lang} onSelect={k.onLanguageSelected} />;
      case "pickup":
      case "dropoff":
        return (
          <AssistantScreen
            section={state.screen === "pickup" ? "pickup" : "dropoff"}
            stepper={stepper}
            assistant={k.assistant}
            lang={lang}
            userSpeaking={k.userSpeaking}
            ready={k.avatarReady}
            failed={k.avatarFailed}
            needsUnmute={k.avatarNeedsUnmute}
            setAvatarVideoEl={k.setAvatarVideoEl}
            onStartVoice={k.startAssistantVoice}
            onCancelVoice={k.cancelAssistantVoice}
            onUnmute={k.unmuteAvatar}
            onUpdateField={k.updateDraftField}
            onContinue={state.screen === "pickup" ? k.finalizePickup : k.finalizeAssistant}
          />
        );
      case "deliveryType":
        return (
          <SelectionScreen
            headline={t(lang, "deliverTypeHeadline")}
            cards={[
              {
                key: "document",
                icon: "doc",
                title: t(lang, "docTitle"),
                desc: t(lang, "docDesc"),
                onSelect: () => k.selectDeliveryType("document"),
              },
              {
                key: "parcel",
                icon: "parcel",
                title: t(lang, "parcelTitle"),
                desc: t(lang, "parcelDesc"),
                onSelect: () => k.selectDeliveryType("parcel"),
              },
            ]}
          />
        );
      case "speed":
        return (
          <SelectionScreen
            headline={t(lang, "speedHeadline")}
            cards={[
              {
                key: "standard",
                icon: "truck",
                title: t(lang, "standardTitle"),
                desc: t(lang, "standardDesc"),
                onSelect: () => k.selectSpeed("standard"),
              },
              {
                key: "express",
                icon: "bolt",
                title: t(lang, "expressTitle"),
                desc: t(lang, "expressDesc"),
                onSelect: () => k.selectSpeed("express"),
                featured: true,
              },
            ]}
          />
        );
      case "review":
        return (
          <ReviewScreen booking={state.booking} lang={lang} onConfirmPay={k.onConfirmPay} />
        );
      case "payment":
        return (
          <PaymentScreen
            booking={state.booking}
            lang={lang}
            receipt={state.receipt}
            onSimulatePayment={k.onSimulatePayment}
            onNewRequest={k.onNewRequest}
          />
        );
      default:
        return null;
    }
  }
}
