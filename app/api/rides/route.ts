import {
  cleanText,
  noStoreJson,
  normalizeSessionId,
  parseJson,
  rateLimit,
  validIslandPoint,
} from "@/lib/api";
import { createRide } from "@/lib/store";

export async function POST(request: Request) {
  const limited = rateLimit(request, "rides:create", 20, 60_000);
  if (limited) return limited;

  const body = await parseJson<{
    sessionId?: string;
    acquisitionSource?: string | null;
    pickup?: { lat: number; lng: number; address: string };
    destination?: { lat: number; lng: number; address: string };
  }>(request);
  const sessionId = normalizeSessionId(body?.sessionId);

  if (!body || !sessionId) {
    return noStoreJson({ error: "Session invalide." }, { status: 400 });
  }
  if (
    (body.pickup && !validIslandPoint(body.pickup)) ||
    (body.destination && !validIslandPoint(body.destination))
  ) {
    return noStoreJson(
      { error: "Le trajet doit être situé à Saint-Barthélemy." },
      { status: 400 },
    );
  }

  try {
    const ride = await createRide({
      session_id: sessionId,
      acquisition_source: cleanText(body.acquisitionSource, 120),
      pickup_lat: body.pickup?.lat ?? null,
      pickup_lng: body.pickup?.lng ?? null,
      pickup_address: cleanText(body.pickup?.address, 240),
      // Destination is used by the client for quoting but is not retained in
      // the registry-style analytics record.
      destination_lat: null,
      destination_lng: null,
      destination_address: null,
    });

    return noStoreJson({ ride });
  } catch (error) {
    console.error("ride_create_failed", { error });
    return noStoreJson(
      { error: "Impossible de démarrer la demande." },
      { status: 500 },
    );
  }
}
