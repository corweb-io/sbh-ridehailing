import { FARE_ZONE_LABELS, formatFareBand, SBH_TIME_ZONE } from "./fares";
import { digitsOnly } from "./phone";
import type { TaxiStandHead } from "./regulation";
import type { FareQuote } from "./types";

export type TaxiContact = {
  id: string;
  name: string;
  kind: "stand" | "concierge";
  phone: string;
  phoneLabel: string;
};

/**
 * Provisional station-head points for the local demo. Production dispatch must
 * replace these with coordinates verified by the Collectivité.
 */
export const TAXI_STAND_HEADS: TaxiStandHead[] = [
  {
    id: "airport",
    name: "Station taxi — Aéroport",
    point: { lat: 17.9044, lng: -62.8436 },
    phone: "+590590524040",
    phoneLabel: "+590 590 52 40 40",
    coordinatesStatus: "provisional",
  },
  {
    id: "gustavia",
    name: "Station taxi — Gustavia",
    point: { lat: 17.8961, lng: -62.8498 },
    phone: "+590590276631",
    phoneLabel: "+590 590 27 66 31",
    coordinatesStatus: "provisional",
  },
];

export const TAXI_STANDS: TaxiContact[] = TAXI_STAND_HEADS.map((stand) => ({
  id: stand.id,
  name: stand.name,
  kind: "stand",
  phone: stand.phone,
  phoneLabel: stand.phoneLabel,
}));

export function getConciergeWhatsApp(): string | null {
  const raw = process.env.NEXT_PUBLIC_TAXI_WHATSAPP?.trim();
  if (!raw) return null;
  const digits = digitsOnly(raw);
  return digits.length >= 10 ? digits : null;
}

export function taxiContacts(): TaxiContact[] {
  const concierge = getConciergeWhatsApp();
  const contacts = [...TAXI_STANDS];
  if (concierge) {
    contacts.unshift({
      id: "concierge",
      name: "WhatsApp — demander un taxi",
      kind: "concierge",
      phone: `+${concierge}`,
      phoneLabel: `+${concierge}`,
    });
  }
  return contacts;
}

export function callHref(phone: string) {
  return `tel:${phone}`;
}

export function whatsappHref(phone: string, text: string) {
  const digits = digitsOnly(phone);
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

export function formatTripWhen(at: Date, locale = "fr-FR") {
  return new Intl.DateTimeFormat(locale, {
    timeZone: SBH_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(at);
}

export function buildTaxiRequestMessage(input: {
  pickup: string;
  when: Date;
  quote: FareQuote;
  client?: string | null;
  phone?: string | null;
  notes?: string | null;
  guestCount?: number;
}) {
  const zoneLine =
    input.quote.zoneFrom && input.quote.zoneTo
      ? `${FARE_ZONE_LABELS[input.quote.zoneFrom]} → ${FARE_ZONE_LABELS[input.quote.zoneTo]}`
      : "à confirmer par le chauffeur";
  const fareLine =
    input.quote.fare == null
      ? "Tarif : à confirmer avec le chauffeur (grille Collectivité)"
      : `Tarif indicatif : ${input.quote.fare} € (${formatFareBand(input.quote.fareBand).toLowerCase()})`;

  return [
    "Bonjour, je souhaite un taxi agréé à Saint-Barthélemy.",
    "",
    `Départ : ${input.pickup}`,
    `Quand : ${formatTripWhen(input.when)}`,
    `Zones : ${zoneLine}`,
    fareLine,
    input.guestCount
      ? `${input.guestCount} passager${input.guestCount > 1 ? "s" : ""}`
      : null,
    input.client ? `Client : ${input.client}` : null,
    input.phone ? `Tél : ${input.phone}` : null,
    input.notes ? `Note : ${input.notes}` : null,
    "",
    "Paiement à bord, sans frais de réservation.",
  ]
    .filter((line) => line !== null)
    .join("\n");
}
