import { SBH_BOUNDS } from "./config";
import { searchNominatim } from "./geo";
import { findPlaceByName, searchLocalPlaces } from "./places";
import type { Place, PlaceSuggestion } from "./types";

const GOOGLE_PLACES_URL = "https://places.googleapis.com/v1";
const EXTERNAL_REQUEST_TIMEOUT_MS = 4_000;
export const MAX_PLACE_RESULTS = 8;

type PlacesLanguage = "fr" | "en";

type GoogleAutocompleteResponse = {
  suggestions?: {
    placePrediction?: {
      placeId?: string;
      text?: { text?: string };
      structuredFormat?: {
        mainText?: { text?: string };
        secondaryText?: { text?: string };
      };
    };
  }[];
};

type GooglePlaceResponse = {
  displayName?: { text?: string };
  formattedAddress?: string;
  location?: { latitude?: number; longitude?: number };
};

export type TypedPlaceResult =
  | { kind: "place"; place: Place }
  | { kind: "choices"; choices: PlaceSuggestion[]; query: string };

function googleKey() {
  return process.env.GOOGLE_MAPS_API_KEY?.trim() || null;
}

export function normalizePlacesSessionToken(value: string | null | undefined) {
  return value && /^[A-Za-z0-9_-]{8,36}$/.test(value) ? value : null;
}

export function newPlacesSessionToken() {
  return crypto.randomUUID();
}

export function customPlace(query: string): Place {
  const name = query.trim() || "Lieu personnalisé";
  return {
    name,
    address: name,
    lat: null,
    lng: null,
    source: "custom",
  };
}

export function asPlace(suggestion: PlaceSuggestion): Place {
  return {
    name: suggestion.name,
    address: suggestion.address,
    lat: suggestion.lat,
    lng: suggestion.lng,
    source: suggestion.source,
    fareZone: suggestion.fareZone,
  };
}

function catalogSuggestions(query: string): PlaceSuggestion[] {
  return searchLocalPlaces(query).map((place) => ({
    ...place,
    source: "catalog" as const,
  }));
}

async function googleAutocomplete(
  query: string,
  sessionToken: string | null,
  apiKey: string,
  language: PlacesLanguage,
): Promise<PlaceSuggestion[]> {
  const response = await fetch(`${GOOGLE_PLACES_URL}/places:autocomplete`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat",
    },
    body: JSON.stringify({
      input: query,
      includedRegionCodes: ["bl"],
      languageCode: language,
      regionCode: "BL",
      locationRestriction: {
        rectangle: {
          low: {
            latitude: SBH_BOUNDS.south,
            longitude: SBH_BOUNDS.west,
          },
          high: {
            latitude: SBH_BOUNDS.north,
            longitude: SBH_BOUNDS.east,
          },
        },
      },
      ...(sessionToken ? { sessionToken } : {}),
    }),
    cache: "no-store",
    signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Google autocomplete failed: ${response.status}`);
  }
  const data = (await response.json()) as GoogleAutocompleteResponse;
  return (data.suggestions ?? []).flatMap((suggestion) => {
    const prediction = suggestion.placePrediction;
    const placeId = prediction?.placeId;
    const text = prediction?.text?.text;
    if (!placeId || !text) return [];
    return [
      {
        placeId,
        name: prediction.structuredFormat?.mainText?.text ?? text.split(",")[0],
        address: prediction.structuredFormat?.secondaryText?.text ?? text,
        lat: null,
        lng: null,
        source: "google" as const,
      },
    ];
  });
}

async function googlePlaceDetails(
  placeId: string,
  sessionToken: string | null,
  apiKey: string,
  language: PlacesLanguage,
) {
  const url = new URL(
    `${GOOGLE_PLACES_URL}/places/${encodeURIComponent(placeId)}`,
  );
  if (sessionToken) url.searchParams.set("sessionToken", sessionToken);
  url.searchParams.set("languageCode", language);
  url.searchParams.set("regionCode", "BL");
  const response = await fetch(url, {
    headers: {
      "X-Goog-Api-Key": apiKey,
      "X-Goog-FieldMask": "id,displayName,formattedAddress,location",
    },
    cache: "no-store",
    signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
  });
  if (!response.ok) {
    throw new Error(`Google place details failed: ${response.status}`);
  }
  return (await response.json()) as GooglePlaceResponse;
}

export async function searchPlaces(
  query: string,
  options?: { sessionToken?: string | null; language?: PlacesLanguage },
): Promise<PlaceSuggestion[]> {
  const local = catalogSuggestions(query);
  if (query.trim().length < 3) return local.slice(0, MAX_PLACE_RESULTS);

  const sessionToken = normalizePlacesSessionToken(options?.sessionToken);
  const language = options?.language ?? "fr";
  const apiKey = googleKey();

  if (apiKey) {
    try {
      const google = await googleAutocomplete(
        query,
        sessionToken,
        apiKey,
        language,
      );
      const localNames = new Set(
        local.map((place) => place.name.toLocaleLowerCase("fr")),
      );
      return [
        ...local,
        ...google.filter(
          (place) => !localNames.has(place.name.toLocaleLowerCase("fr")),
        ),
      ].slice(0, MAX_PLACE_RESULTS);
    } catch (error) {
      console.error("google_places_search_failed", { error });
    }
  }

  try {
    const remote = await searchNominatim(query);
    const seen = new Set(
      local.flatMap((place) =>
        typeof place.lat === "number" && typeof place.lng === "number"
          ? [`${place.lat.toFixed(4)}:${place.lng.toFixed(4)}`]
          : [],
      ),
    );
    const merged: PlaceSuggestion[] = [...local];
    for (const place of remote) {
      const key = `${place.lat.toFixed(4)}:${place.lng.toFixed(4)}`;
      if (!seen.has(key)) {
        seen.add(key);
        merged.push({ ...place, source: "google" });
      }
    }
    return merged.slice(0, MAX_PLACE_RESULTS);
  } catch {
    return local.slice(0, MAX_PLACE_RESULTS);
  }
}

export async function resolvePlaceDetails(
  placeId: string,
  options?: { sessionToken?: string | null; language?: PlacesLanguage },
): Promise<Place | null> {
  const apiKey = googleKey();
  if (!apiKey) return null;
  const details = await googlePlaceDetails(
    placeId,
    normalizePlacesSessionToken(options?.sessionToken),
    apiKey,
    options?.language ?? "fr",
  );
  const lat = details.location?.latitude;
  const lng = details.location?.longitude;
  if (
    typeof lat !== "number" ||
    typeof lng !== "number" ||
    lat < SBH_BOUNDS.south ||
    lat > SBH_BOUNDS.north ||
    lng < SBH_BOUNDS.west ||
    lng > SBH_BOUNDS.east
  ) {
    return null;
  }
  const address = details.formattedAddress ?? details.displayName?.text;
  return {
    name: details.displayName?.text ?? address ?? "Lieu sélectionné",
    address: address ?? "Saint-Barthélemy",
    lat,
    lng,
    source: "google",
  };
}

export async function hydratePlaceSuggestion(
  suggestion: PlaceSuggestion,
  options?: { sessionToken?: string | null; language?: PlacesLanguage },
): Promise<Place> {
  if (typeof suggestion.lat === "number" && typeof suggestion.lng === "number") {
    return asPlace(suggestion);
  }
  if (suggestion.placeId) {
    try {
      const details = await resolvePlaceDetails(suggestion.placeId, options);
      if (details) return details;
    } catch (error) {
      console.error("google_place_details_failed", { error });
    }
  }
  return customPlace(suggestion.name);
}

export async function resolveTypedPlaceQuery(
  query: string,
  options?: { sessionToken?: string | null; language?: PlacesLanguage },
): Promise<TypedPlaceResult> {
  const trimmed = query.trim();
  if (!trimmed) return { kind: "place", place: customPlace(trimmed) };
  if (trimmed.length > 80) {
    return { kind: "place", place: customPlace(trimmed.slice(0, 80)) };
  }

  const exact = findPlaceByName(trimmed);
  if (exact) {
    return {
      kind: "place",
      place: { ...exact, source: exact.source ?? "catalog" },
    };
  }

  const suggestions = await searchPlaces(trimmed, options);
  if (suggestions.length === 0) {
    return { kind: "place", place: customPlace(trimmed) };
  }
  return { kind: "choices", choices: suggestions, query: trimmed };
}
