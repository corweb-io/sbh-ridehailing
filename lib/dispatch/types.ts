import type { Place, PlaceSuggestion, QuoteResult } from "../types";

export const DEFAULT_RING_MS = 2 * 60 * 1000;
export const DEFAULT_REOFFER_MS = 5_000;
export const DEFAULT_HOLD_MS = 60 * 1000;

export type DispatchChannel = "telegram" | "whatsapp";

export const CHAT_LOCALES = ["fr", "en"] as const;
export type ChatLocale = (typeof CHAT_LOCALES)[number];
export const DEFAULT_CHAT_LOCALE: ChatLocale = "fr";

export type SupplierKind = "taxi" | "company";

export type DispatchStatus =
  | "ring_taxis"
  | "ring_companies"
  | "hold"
  | "assigned"
  | "en_route"
  | "arrived"
  | "completed"
  | "unfilled"
  | "cancelled";

export type StaffBinding = {
  channel: DispatchChannel;
  chatId: string;
  kind: SupplierKind;
  supplierId: string;
  boundAt: string;
  lastInboundAt?: string;
  onDuty: boolean;
  sessionNudgedAt?: string | null;
};

export type OfferTarget = {
  kind: SupplierKind;
  supplierId: string;
  chatId: string | null;
  status: "pending" | "held" | "accepted" | "declined" | "taken";
};

export type DispatchJob = {
  id: string;
  channel: DispatchChannel;
  bookerChatId: string;
  bookerLocale?: ChatLocale;
  status: DispatchStatus;
  ringStartedAt: string;
  ringEndsAt: string;
  pickup: Place;
  dropoff: Place;
  departAt: string;
  pax: number;
  passengerPhone: string;
  quote: QuoteResult;
  offers: OfferTarget[];
  hold: {
    kind: SupplierKind;
    supplierId: string;
    heldAt: string;
    expiresAt: string;
    ringRemainingMs: number;
    resumeStatus: "ring_taxis" | "ring_companies";
  } | null;
  reofferAt: string | null;
  remindedAt?: string | null;
  acceptedBy: {
    kind: SupplierKind;
    supplierId: string;
    at: string;
    companyRate: number | null;
  } | null;
  createdAt: string;
};

export type BookerStep =
  | "idle"
  | "lang"
  | "pickup"
  | "pickup_text"
  | "dropoff"
  | "dropoff_text"
  | "place_pick"
  | "zone"
  | "when"
  | "when_day"
  | "when_time"
  | "pax"
  | "phone"
  | "confirm"
  | "dispatching";

export type BookerSession = {
  channel: DispatchChannel;
  chatId: string;
  step: BookerStep;
  locale: ChatLocale | null;
  afterLang: "book" | "menu" | null;
  pickup: Place | null;
  dropoff: Place | null;
  placePickSide: "pickup" | "dropoff" | null;
  placeQuery: string | null;
  placeCandidates: PlaceSuggestion[] | null;
  placesToken: string | null;
  zoneSide: "pickup" | "dropoff" | null;
  departAt: string | null;
  departDay: string | null;
  pax: number | null;
  passengerPhone: string | null;
  jobId: string | null;
  updatedAt: string;
};

export type ChatButton = { id: string; label: string };

export type DriverNotice = "cancel" | "reminder";

export type OutboundMessage = {
  chatId: string;
  text: string;
  locale?: ChatLocale;
  buttons?: ChatButton[][];
  requestLocation?: boolean;
  requestContact?: boolean;
  removeKeyboard?: boolean;
  /** Reaches WhatsApp drivers even if their 24h session is closed (utility template). */
  notice?: DriverNotice;
  templateParams?: string[];
};

export type InboundMessage = {
  channel: DispatchChannel;
  chatId: string;
  fromId: string;
  text?: string;
  buttonId?: string;
  locale?: string;
  location?: { lat: number; lng: number };
  contact?: { phone: string; name?: string; userId?: string };
  callbackId?: string;
};

export type ChatChannel = {
  name: DispatchChannel;
  send(message: OutboundMessage): Promise<void>;
  ack?(callbackId: string): Promise<void>;
};
