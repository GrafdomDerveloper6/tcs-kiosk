import Image from "next/image";
import { t, type Lang } from "@/lib/i18n";
import { Icon } from "../icons";

/** The wide hero-style language picker — replaces the generic card-list
 *  SelectionScreen for this one screen, since its layout (photo panel /
 *  content / map panel, three columns) doesn't generalize to the other
 *  screens that still use SelectionScreen (deliveryType, speed). */
export function LanguageScreen({
  lang,
  onSelect,
}: {
  lang: Lang;
  onSelect: (lang: Lang) => void;
}) {
  return (
    <div className="lang-screen">
      <div className="lang-photo">
        <Image
          src="/tcs-rider.png"
          alt=""
          fill
          priority
          className="lang-photo-img"
        />
      </div>

      <div className="lang-main">
        <div className="rule" />
        <div className="lang-headline">
          {/* "TCS" is a Latin brand name embedded in an Urdu sentence — in
              RTL flow, whichever of these two pieces comes SECOND in the
              markup ends up on the visual left. English reads naturally as
              "Welcome to [TCS]"; Urdu reads naturally as "[TCS] mein khush
              aamdeed" — TCS first — so the DOM order has to flip for Urdu
              to land TCS on the right, not just the text content. */}
          {lang === "ur" ? (
            <>
              <span className="lang-headline-accent">{t(lang, "languageHeadlineAccent")}</span>{" "}
              {t(lang, "languageHeadline")}
            </>
          ) : (
            <>
              {t(lang, "languageHeadline")}{" "}
              <span className="lang-headline-accent">{t(lang, "languageHeadlineAccent")}</span>
            </>
          )}
        </div>
        <div className="lang-sub">{t(lang, "languageSub")}</div>

        <div className="lang-cards">
          <button type="button" className="lang-card" onClick={() => onSelect("en")}>
            <span className="lang-card-icon">
              <Icon name="language" />
            </span>
            <span className="lang-card-text">
              <span className="lang-card-title">English</span>
              <span className="lang-card-desc">Continue in English</span>
            </span>
            <span className="lang-card-arrow">
              <Icon name="send" />
            </span>
          </button>

          <button type="button" className="lang-card" onClick={() => onSelect("ur")}>
            <span className="lang-card-icon lang-card-icon-ur">اردو</span>
            <span className="lang-card-text">
              <span className="lang-card-title">اردو</span>
              <span className="lang-card-desc">اردو میں جاری رکھیں</span>
            </span>
            <span className="lang-card-arrow">
              <Icon name="send" />
            </span>
          </button>
        </div>
      </div>

      <div className="lang-right">
        <div className="lang-map" aria-hidden="true" />
        <div className="lang-tagline">
          <span className="lang-tagline-bar" />
          <span className="lang-tagline-text">
            <span className="lang-tagline-title">{t(lang, "connectingPeopleTitle")}</span>
            <span className="lang-tagline-sub">{t(lang, "connectingPeopleSub")}</span>
          </span>
        </div>
      </div>
    </div>
  );
}
