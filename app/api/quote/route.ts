import {
  cleanText,
  noStoreJson,
  normalizeSessionId,
  parseJson,
  rateLimit,
  validIslandPoint,
} from "@/lib/api";
import { quoteOfficialFare } from "@/lib/fares";
import { estimateRoute } from "@/lib/geo";
import { getRide, updateRide } from "@/lib/store";

function parseDepartAt(value: unknown): Date {
  if (typeof value !== "string") return new Date();
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? new Date(parsed) : new Date();
}

export async function POST(request: Request) {
  const limited = rateLimit(request, "quote:create", 20, 60_000);
  if (limited) return limited;

  const body = await parseJson<{
    rideId?: string;
    sessionId?: string;
    pickup?: { lat: number; lng: number };
    destination?: { lat: number; lng: number };
    pickupAddress?: string;
    destinationAddress?: string;
    pickupName?: string;
    destinationName?: string;
    departAt?: string;
  }>(request);
  const sessionId = normalizeSessionId(body?.sessionId);

  if (
    !body ||
    !body.rideId ||
    !sessionId ||
    !validIslandPoint(body.pickup) ||
    !validIslandPoint(body.destination)
  ) {
    return noStoreJson(
      { error: "Le départ et la destination sont obligatoires." },
      { status: 400 },
    );
  }

  const samePoint =
    Math.abs(body.pickup.lat - body.destination.lat) < 0.0004 &&
    Math.abs(body.pickup.lng - body.destination.lng) < 0.0004;
  if (samePoint) {
    return noStoreJson(
      { error: "Choisissez une destination différente du point de départ." },
      { status: 400 },
    );
  }

  try {
    const existing = await getRide(body.rideId, sessionId);
    if (!existing) {
      return noStoreJson({ error: "Course introuvable." }, { status: 404 });
    }

    const departAt = parseDepartAt(body.departAt);
    const route = await estimateRoute(body.pickup, body.destination);
    const distanceKm = Number(route.distanceKm.toFixed(2));
    const durationMinutes = Math.max(3, Math.round(route.durationMinutes));
    const fareQuote = quoteOfficialFare({
      pickup: body.pickup,
      destination: body.destination,
      at: departAt,
    });
    const ride = await updateRide(body.rideId, sessionId, {
      status: "quote_viewed",
      pickup_lat: body.pickup.lat,
      pickup_lng: body.pickup.lng,
      pickup_address: cleanText(body.pickupAddress, 240),
      destination_lat: null,
      destination_lng: null,
      destination_address: null,
      distance_km: distanceKm,
      estimated_duration_minutes: durationMinutes,
      quoted_price: fareQuote.fare,
      fare_zone_from: fareQuote.zoneFrom,
      fare_zone_to: fareQuote.zoneTo,
      fare_band: fareQuote.fareBand,
      quote_viewed_at: new Date().toISOString(),
      event: "quote_generated",
      eventMeta: {
        zoneFrom: fareQuote.zoneFrom,
        zoneTo: fareQuote.zoneTo,
        fareBand: fareQuote.fareBand,
        fare: fareQuote.fare,
      },
    });

    return noStoreJson({
      distanceKm,
      durationMinutes,
      route: route.route,
      departAt: departAt.toISOString(),
      ...fareQuote,
      ride,
    });
  } catch (error) {
    console.error("quote_generation_failed", { rideId: body.rideId, error });
    return noStoreJson(
      { error: "Impossible de calculer le tarif pour le moment." },
      { status: 502 },
    );
  }
}
