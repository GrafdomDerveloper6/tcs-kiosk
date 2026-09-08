"use client";

import { useState } from "react";
import type { Booking, Receipt } from "@/lib/kiosk-types";
import type { Lang } from "@/lib/i18n";
import { t } from "@/lib/i18n";
import { computePricing, fmtRs } from "@/lib/kiosk-utils";
import { Icon } from "../icons";
import { QRCode } from "../QRCode";

type PayMethod = "raast" | "easypaisa" | "jazzcash";

const METHODS: { key: PayMethod; labelKey: string }[] = [
  { key: "raast", labelKey: "payRaast" },
  { key: "easypaisa", labelKey: "payEasypaisa" },
  { key: "jazzcash", labelKey: "payJazzcash" },
];

export function PaymentScreen({
  booking,
  lang,
  receipt,
  onSimulatePayment,
  onNewRequest,
}: {
  booking: Booking;
  lang: Lang;
  receipt: Receipt | null;
  onSimulatePayment: (methodLabel: string) => void;
  onNewRequest: () => void;
}) {
  const [method, setMethod] = useState<PayMethod>("raast");
  const [walletNumber, setWalletNumber] = useState(booking.pickup.phone ?? "");
  const p = computePricing(booking);

  if (receipt) {
    return (
      <>
        <div style={{ textAlign: "center" }}>
          <div className="success-badge">
            <Icon name="check" />
          </div>
          <div className="headline" style={{ marginTop: 14 }}>
            {t(lang, "paymentSuccess")}
          </div>
        </div>
        <div className="summary-card">
          <div className="s-row">
            <div className="k">{t(lang, "receiptNumber")}</div>
            <div className="v">{receipt.number}</div>
          </div>
          <div className="s-row">
            <div className="k">{t(lang, "receiptTime")}</div>
            <div className="v">{receipt.time}</div>
          </div>
          <div className="s-row">
            <div className="k">{t(lang, "receiptMethod")}</div>
            <div className="v">{receipt.method}</div>
          </div>
          <div className="s-div" />
          <div className="s-row total">
            <div className="k">{t(lang, "receiptTotal")}</div>
            <div className="v">{fmtRs(receipt.total)}</div>
          </div>
        </div>
        <button className="primary-btn" onClick={onNewRequest}>
          {t(lang, "newRequest")}
        </button>
      </>
    );
  }

  const methodLabel = t(lang, METHODS.find((m) => m.key === method)!.labelKey);
  const isWallet = method !== "raast";
  const canPay = !isWallet || walletNumber.trim().length > 0;

  return (
    <>
      <div>
        <div className="headline">{t(lang, "paymentHeadline")}</div>
        <div className="rule" />
      </div>

      <div className="pay-methods">
        {METHODS.map((m) => (
          <button
            key={m.key}
            type="button"
            className={`pay-method pay-${m.key} ${method === m.key ? "active" : ""}`}
            onClick={() => setMethod(m.key)}
          >
            <span className="pay-method-mark" />
            {t(lang, m.labelKey)}
          </button>
        ))}
      </div>

      <div className="qr-card">
        {method === "raast" ? (
          <>
            <QRCode
              seed={`${booking.pickup.city ?? ""}${booking.dropoff.city ?? ""}${Math.round(p.total)}`}
            />
            <div className="raast-tag">{t(lang, "payRaastTag")}</div>
          </>
        ) : (
          <div className="wallet-panel">
            <div className={`wallet-badge pay-${method}`}>{methodLabel}</div>
            <label className="field">
              <span className="field-label">{t(lang, "walletNumberLabel")}</span>
              <input
                className="field-input"
                type="tel"
                inputMode="tel"
                value={walletNumber}
                placeholder="03xx xxxxxxx"
                onChange={(e) => setWalletNumber(e.target.value)}
              />
            </label>
            <div className="wallet-hint">{t(lang, "walletHint", { wallet: methodLabel })}</div>
          </div>
        )}

        <div style={{ fontSize: 15, fontWeight: 700, color: "var(--ink)" }}>
          {fmtRs(p.total)}
        </div>
        <div
          style={{
            fontSize: 13,
            color: "var(--slate)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <span className="spinner" />
          {t(lang, "paymentWaiting")}
        </div>
      </div>

      <button
        className="ghost-btn"
        disabled={!canPay}
        onClick={() => onSimulatePayment(methodLabel)}
      >
        {t(lang, "simulatePayment")}
      </button>
    </>
  );
}
