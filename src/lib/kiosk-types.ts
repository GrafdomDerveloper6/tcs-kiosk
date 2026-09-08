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

export const BOOKING_STEPS: Screen[] = [
  "pickup",
  "dropoff",
  "deliveryType",
  "speed",
  "review",
  "payment",
];

/** The two screens that collect contact details by voice + touch, where the
 *  avatar session stays alive as the customer moves between them. */
export const FORM_SCREENS: Screen[] = ["pickup", "dropoff"];

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

/** Shape /api/extract-booking returns — same field names as BookingDraft
 *  (all nullable) plus a completion flag. */
export type BookingExtraction = {
  complete: boolean;
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
