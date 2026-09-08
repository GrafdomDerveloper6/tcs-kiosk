import type { Booking, BookingDraft, BookingExtraction, Receipt } from "./kiosk-types";

/** Voice fills in whatever it just heard; anything not mentioned yet keeps
 *  the current value (which may itself have come from a touch edit). */
export function mergeExtractionIntoDraft(
  draft: BookingDraft,
  extraction: BookingExtraction
): BookingDraft {
  return {
    deliveryType: extraction.deliveryType ?? draft.deliveryType,
    pickupName: extraction.pickupName ?? draft.pickupName,
    pickupPhone: extraction.pickupPhone ?? draft.pickupPhone,
    pickupStreet: extraction.pickupStreet ?? draft.pickupStreet,
    pickupCity: extraction.pickupCity ?? draft.pickupCity,
    dropoffName: extraction.dropoffName ?? draft.dropoffName,
    dropoffPhone: extraction.dropoffPhone ?? draft.dropoffPhone,
    dropoffStreet: extraction.dropoffStreet ?? draft.dropoffStreet,
    dropoffCity: extraction.dropoffCity ?? draft.dropoffCity,
    speed: extraction.speed ?? draft.speed,
  };
}

/** Pickup and delivery details live on their own screens now, so each has
 *  its own gate. Item type and shipping speed are picked on card screens
 *  afterwards and deliberately aren't part of either check. Lets each
 *  Continue button light up whether the customer spoke the details, typed
 *  them, or mixed both. */
export function isPickupComplete(draft: BookingDraft): boolean {
  return !!(
    draft.pickupName.trim() &&
    draft.pickupPhone.trim() &&
    draft.pickupStreet.trim() &&
    draft.pickupCity.trim()
  );
}

export function isDropoffComplete(draft: BookingDraft): boolean {
  return !!(
    draft.dropoffName.trim() &&
    draft.dropoffPhone.trim() &&
    draft.dropoffStreet.trim() &&
    draft.dropoffCity.trim()
  );
}

export function computePricing(booking: Booking) {
  const base = booking.deliveryType === "parcel" ? 450 : 250;
  const mult = booking.speed === "express" ? 1.6 : 1.0;
  const fare = base * mult;
  const surcharge = 50;
  const tax = 0.05 * (fare + surcharge);
  const total = fare + surcharge + tax;
  return { fare, surcharge, tax, total };
}

export function fmtRs(n: number) {
  return "Rs. " + Math.round(n).toLocaleString();
}

export function generateReceipt(booking: Booking, method: string): Receipt {
  const p = computePricing(booking);
  const number = "RC" + Math.floor(100000 + Math.random() * 900000);
  const time = new Date().toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
  return { number, time, total: p.total, method };
}

/* ---------- QR (cosmetic placeholder, same pseudo-random pattern as prototype) ---------- */
function pseudoRandom(seed: number) {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}
function inFinder(lx: number, ly: number) {
  if (lx === 0 || lx === 6 || ly === 0 || ly === 6) return true;
  if (lx >= 2 && lx <= 4 && ly >= 2 && ly <= 4) return true;
  return false;
}
function isFinderCell(x: number, y: number, size: number): boolean | null {
  if (x < 7 && y < 7) return inFinder(x, y);
  if (x >= size - 7 && y < 7) return inFinder(x - (size - 7), y);
  if (x < 7 && y >= size - 7) return inFinder(x, y - (size - 7));
  return null;
}
export function qrCells(seedStr: string): boolean[] {
  let seed = 1;
  for (const c of seedStr) seed += c.charCodeAt(0);
  const size = 21;
  const cells: boolean[] = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const f = isFinderCell(x, y, size);
      const on = f !== null ? f : pseudoRandom(seed + x * 31 + y * 17) > 0.5;
      cells.push(on);
    }
  }
  return cells;
}
export const QR_SIZE = 21;
