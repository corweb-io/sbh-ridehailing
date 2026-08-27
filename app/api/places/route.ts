import { noStoreJson, rateLimit } from "@/lib/api";
import {
  normalizePlacesSessionToken,
  resolvePlaceDetails,
  searchPlaces,
} from "@/lib/places-search";

export async function GET(request: Request) {
  const limited = rateLimit(request, "places:search", 40, 60_000);
  if (limited) return limited;

  const params = new URL(request.url).searchParams;
  const query = params.get("q")?.trim() ?? "";
  const placeId = params.get("placeId")?.trim() ?? "";
  const sessionToken = normalizePlacesSessionToken(params.get("sessionToken"));
  const apiKey = process.env.GOOGLE_MAPS_API_KEY?.trim() || null;

  if (placeId) {
    if (!apiKey || placeId.length > 256 || !/^[A-Za-z0-9_-]+$/.test(placeId)) {
      return noStoreJson({ error: "Lieu invalide." }, { status: 400 });
    }
    try {
      const place = await resolvePlaceDetails(placeId, { sessionToken });
      if (!place) {
        return noStoreJson(
          { error: "Ce lieu n’est pas situé à Saint-Barthélemy." },
          { status: 400 },
        );
      }
      return noStoreJson({ place });
    } catch (error) {
      console.error("google_place_details_failed", { error });
      return noStoreJson(
        { error: "Impossible de confirmer ce lieu." },
        { status: 502 },
      );
    }
  }

  if (query.length > 80) {
    return noStoreJson({ error: "Recherche trop longue." }, { status: 400 });
  }

  const places = await searchPlaces(query, { sessionToken });
  return noStoreJson({ places });
}
