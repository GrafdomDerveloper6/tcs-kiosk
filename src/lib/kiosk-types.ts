import type { Lang } from "./i18n";

export type Screen =
  | "attract"
  | "language"
  | "pickup"
  | "dropoff"
  | "deliveryType"
  | "speed"
  | "review"
  | "payment";

/** The five steps the customer sees in the progress bar — deliberately
 *  coarser than the screen list. Item type and speed are both just "what
 *  are you sending", and the fare review is part of paying, so each of
 *  those pairs reads as one step instead of padding the bar out to one dot
 *  per screen. Confirmation has no screen of its own: it's the payment
 *  screen once a receipt exists. */
export const BOOKING_STEP_GROUPS: { labelKey: string; screens: Screen[] }[] = [
  { labelKey: "stepPickupDetails", screens: ["pickup"] },
  { labelKey: "stepDeliveryDetails", screens: ["dropoff"] },
  { labelKey: "stepParcelInfo", screens: ["deliveryType", "speed"] },
  { labelKey: "stepPayment", screens: ["review", "payment"] },
  { labelKey: "stepConfirmation", screens: [] },
];

/** Which of the five steps is showing, or -1 on a screen outside the flow. */
export function currentStepIndex(screen: Screen, paid: boolean): number {
  if (screen === "payment" && paid) return BOOKING_STEP_GROUPS.length - 1;
  return BOOKING_STEP_GROUPS.findIndex((group) => group.screens.includes(screen));
}

/** The two screens that collect contact details by voice + touch, where the
 *  avatar session stays alive as the customer moves between them. */
export const FORM_SCREENS: Screen[] = ["pickup", "dropoff"];

/** Screens that use the wide landscape frame instead of the narrower
 *  centered-column one — a separate list from FORM_SCREENS on purpose:
 *  this one is purely about layout width, that one is about avatar-session
 *  continuity, and "language" needs the former without the latter. */
export const WIDE_SCREENS: Screen[] = [...FORM_SCREENS, "language"];

export type DeliveryType = "document" | "parcel" | null;
export type Speed = "standard" | "express" | null;

export type ContactDetails = Partial<{
  name: string;
  phone: string;
  street: string;
  city: string;
}>;

export type Booking = {
  deliveryType: DeliveryType;
  pickup: ContactDetails;
  dropoff: ContactDetails;
  speed: Speed;
};

export type Receipt = {
  number: string;
  time: string;
  total: number;
  /** Already-translated label of the method the customer paid with. */
  method: string;
};

export type KioskState = {
  screen: Screen;
  lang: Lang;
  backStack: Screen[];
  booking: Booking;
  receipt: Receipt | null;
};

export function freshState(): KioskState {
  return {
    screen: "attract",
    lang: "en",
    backStack: [],
    booking: { deliveryType: null, pickup: {}, dropoff: {}, speed: null },
    receipt: null,
  };
}

/* ---------- The one assistant screen ----------
 * Avatar on one side (tap to talk — its own LLM, configured server-side,
 * holds a free conversation), an editable booking form on the other.
 * Whichever fields the customer mentions get filled live via
 * /api/extract-booking; every field is also just a normal input the
 * customer can tap and type into directly. Voice and touch both write to
 * the same draft. */
export type BookingDraft = {
  deliveryType: DeliveryType;
  pickupName: string;
  pickupPhone: string;
  pickupStreet: string;
  pickupCity: string;
  dropoffName: string;
  dropoffPhone: string;
  dropoffStreet: string;
  dropoffCity: string;
  speed: Speed;
};

export function freshBookingDraft(): BookingDraft {
  return {
    deliveryType: null,
    pickupName: "",
    pickupPhone: "",
    pickupStreet: "",
    pickupCity: "",
    dropoffName: "",
    dropoffPhone: "",
    dropoffStreet: "",
    dropoffCity: "",
    speed: null,
  };
}

export type AssistantState = {
  draft: BookingDraft;
  avatarStarted: boolean;
};

export function freshAssistantState(): AssistantState {
  return { draft: freshBookingDraft(), avatarStarted: false };
}

/** Shape /api/extract-booking returns — same field names as BookingDraft,
 *  all nullable. Whether a phase is "done" is decided by the app itself
 *  (isPickupComplete/isDropoffComplete against the merged draft), not by
 *  anything this endpoint judges — it only ever reports what was said. */
export type BookingExtraction = {
  deliveryType: DeliveryType;
  pickupName: string | null;
  pickupPhone: string | null;
  pickupStreet: string | null;
  pickupCity: string | null;
  dropoffName: string | null;
  dropoffPhone: string | null;
  dropoffStreet: string | null;
  dropoffCity: string | null;
  speed: Speed;
};
