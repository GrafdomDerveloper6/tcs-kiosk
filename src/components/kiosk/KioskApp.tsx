"use client";

import { useKiosk } from "@/hooks/useKiosk";
import { t } from "@/lib/i18n";
import { BOOKING_STEPS, FORM_SCREENS } from "@/lib/kiosk-types";
import { Icon } from "./icons";
import { SelectionScreen } from "./screens/SelectionScreen";
import { AssistantScreen } from "./screens/AssistantScreen";
import { ReviewScreen } from "./screens/ReviewScreen";
import { PaymentScreen } from "./screens/PaymentScreen";

export function KioskApp() {
  const k = useKiosk();
  const { state } = k;
  const lang = state.lang;
  const dir = t(lang, "dir");

  const backDisabled = state.backStack.length === 0 || state.screen === "attract";
  const stepIdx = BOOKING_STEPS.indexOf(state.screen);

  return (
    <div className="viewport-bg">
      <div
        className={`kiosk ${FORM_SCREENS.includes(state.screen) ? "kiosk-hero" : ""}`}
        id="kiosk"
        dir={dir}
      >
        <div className="app-header">
          <div className="app-header-logo">TCS · WE MOVE YOU</div>
        </div>

        {stepIdx >= 0 && (
          <div className="stepper">
            {BOOKING_STEPS.map((s, i) => (
              <div key={s} className={`seg ${i <= stepIdx ? "done" : ""}`} />
            ))}
          </div>
        )}

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
            <button className="nav-btn" onClick={k.onGoHome}>
              <Icon name="home" />
              <span>{t(lang, "home")}</span>
            </button>
          </div>
        )}

        {state.screen === "attract" && (
          <div className="attract-overlay" onClick={k.onTapStart}>
            <div className="attract-copy">
              <div className="attract-logo">TCS · WE MOVE YOU</div>
              <div className="attract-title">{t(lang, "attractTitle")}</div>
              <div className="attract-tap">{t(lang, "attractTap")}</div>
            </div>
          </div>
        )}

        {k.idleVisible && (
          <div className="modal-scrim">
            <div className="modal-card">
              <h3>{t(lang, "idleTitle")}</h3>
              <p>{t(lang, "idleBody", { s: k.idleCountdown })}</p>
              <div className="modal-actions">
                <button className="primary-btn" onClick={k.markActivity}>
                  {t(lang, "idleContinue")}
                </button>
                <button className="ghost-btn" onClick={k.resetToAttract}>
                  {t(lang, "idleReset")}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  function renderScreen() {
    switch (state.screen) {
      case "language":
        return (
          <SelectionScreen
            headline={t(lang, "languageHeadline")}
            subhead={t(lang, "languageSub")}
            cards={[
              {
                key: "en",
                icon: "language",
                title: "English",
                desc: "Continue in English",
                onSelect: () => k.onLanguageSelected("en"),
              },
              {
                key: "ur",
                icon: "language",
                title: "اردو",
                desc: "اردو میں جاری رکھیں",
                onSelect: () => k.onLanguageSelected("ur"),
              },
            ]}
          />
        );
      case "pickup":
      case "dropoff":
        return (
          <AssistantScreen
            section={state.screen === "pickup" ? "pickup" : "dropoff"}
            assistant={k.assistant}
            lang={lang}
            userSpeaking={k.userSpeaking}
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
