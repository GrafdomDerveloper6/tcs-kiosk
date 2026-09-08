import type { Booking } from "@/lib/kiosk-types";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { computePricing, fmtRs } from "@/lib/kiosk-utils";

export function ReviewScreen({
  booking,
  lang,
  onConfirmPay,
}: {
  booking: Booking;
  lang: Lang;
  onConfirmPay: () => void;
}) {
  const p = computePricing(booking);
  const itemLabel = booking.deliveryType === "parcel" ? t(lang, "parcelType") : t(lang, "docType");
  const speedLabel = booking.speed === "express" ? t(lang, "expressSpeed") : t(lang, "standardSpeed");

  return (
    <>
      <div>
        <div className="headline">{t(lang, "reviewHeadline")}</div>
        <div className="rule" />
      </div>
      <div className="summary-card">
        <div className="s-row">
          <div className="k">{t(lang, "labelItem")}</div>
          <div className="v">{itemLabel}</div>
        </div>
        <div className="s-row">
          <div className="k">{t(lang, "labelRoute")}</div>
          <div className="v">
            {booking.pickup.city || ""} → {booking.dropoff.city || ""}
          </div>
        </div>
        <div className="s-row">
          <div className="k">{t(lang, "labelService")}</div>
          <div className="v">{speedLabel}</div>
        </div>
        <div className="s-div" />
        <div className="s-row">
          <div className="k">{t(lang, "labelBase")}</div>
          <div className="v">{fmtRs(p.fare)}</div>
        </div>
        <div className="s-row">
          <div className="k">{t(lang, "labelSurcharge")}</div>
          <div className="v">{fmtRs(p.surcharge)}</div>
        </div>
        <div className="s-row">
          <div className="k">{t(lang, "labelTax")}</div>
          <div className="v">{fmtRs(p.tax)}</div>
        </div>
        <div className="s-div" />
        <div className="s-row total">
          <div className="k">{t(lang, "labelTotal")}</div>
          <div className="v">{fmtRs(p.total)}</div>
        </div>
      </div>
      <button className="primary-btn" onClick={onConfirmPay}>
        {t(lang, "confirmPay")}
      </button>
    </>
  );
}
