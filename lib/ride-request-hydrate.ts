import { datetimeLocalInStBarth, stBarthIsoFromLocalInput } from "./format";
import {
  hydratePlaceSuggestion,
  resolveTypedPlaceQuery,
} from "./places-search";
import { whatsappPassengerPhone } from "./phone";
import { EMPTY_TRIP_REQUIREMENTS, type TripRequirements } from "./regulation";
import {
  catalogPlaceName,
  clampPax,
  type RideRequestFields,
  type RideRequestParseMethod,
} from "./ride-request";
import type { Place, PlaceSuggestion } from "./types";

export type RideRequestDraft = {
  pickup: Place | null;
  destination: Place | null;
  pickupChoices: PlaceSuggestion[];
  destinationChoices: PlaceSuggestion[];
  pax: number;
  departAt: string;
  notes: string | null;
  requirements: TripRequirements;
  passengerPhone: string | null;
  method: RideRequestParseMethod;
  fields: RideRequestFields;
};

async function resolvePlaceText(
  query: string | null,
  language: "fr" | "en",
): Promise<{ place: Place | null; choices: PlaceSuggestion[] }> {
  if (!query?.trim()) return { place: null, choices: [] };
  const catalog = catalogPlaceName(query);
  if (catalog) {
    const exact = await resolveTypedPlaceQuery(catalog, { language });
    if (exact.kind === "place") return { place: exact.place, choices: [] };
  }
  const result = await resolveTypedPlaceQuery(query, { language });
  if (result.kind === "place") return { place: result.place, choices: [] };
  if (result.choices.length === 1) {
    return {
      place: await hydratePlaceSuggestion(result.choices[0], { language }),
      choices: [],
    };
  }
  return { place: null, choices: result.choices };
}

export function resolveDepartAtFromFields(
  fields: RideRequestFields,
  now: Date,
  parseWhen: (text: string, now: Date) => Date | null,
) {
  if (fields.departNow) return now.toISOString();
  if (fields.resolvedDepartAt) {
    const local = fields.resolvedDepartAt.match(
      /^(\d{4}-\d{2}-\d{2})(?:T(\d{2}):(\d{2}))?/,
    );
    if (local) {
      const clock = local[2]
        ? `${local[1]}T${local[2]}:${local[3] ?? "00"}`
        : `${local[1]}T${datetimeLocalInStBarth(now).slice(11, 16)}`;
      const iso = stBarthIsoFromLocalInput(clock);
      if (Number.isFinite(Date.parse(iso))) return iso;
    }
    const parsed = Date.parse(fields.resolvedDepartAt);
    if (Number.isFinite(parsed)) return new Date(parsed).toISOString();
  }
  if (fields.whenText) {
    const parsed = parseWhen(fields.whenText, now);
    if (parsed) return parsed.toISOString();
  }
  return now.toISOString();
}

export async function hydrateRideRequest(
  fields: RideRequestFields,
  options: {
    method: RideRequestParseMethod;
    language?: "fr" | "en";
    now?: Date;
    whatsappChatId?: string | null;
    parseWhen?: (text: string, now: Date) => Date | null;
  },
): Promise<RideRequestDraft> {
  const language = options.language ?? "fr";
  const now = options.now ?? new Date();
  const [pickup, destination] = await Promise.all([
    resolvePlaceText(fields.pickupText, language),
    resolvePlaceText(fields.destinationText, language),
  ]);
  return {
    pickup: pickup.place,
    destination: destination.place,
    pickupChoices: pickup.choices,
    destinationChoices: destination.choices,
    pax: clampPax(fields.pax),
    departAt: resolveDepartAtFromFields(
      fields,
      now,
      options.parseWhen ?? (() => null),
    ),
    notes: fields.notes,
    requirements: {
      ...EMPTY_TRIP_REQUIREMENTS,
      pmr: fields.pmr,
      hybridElectric: fields.hybridElectric,
    },
    passengerPhone: options.whatsappChatId
      ? whatsappPassengerPhone(options.whatsappChatId)
      : null,
    method: options.method,
    fields,
  };
}
