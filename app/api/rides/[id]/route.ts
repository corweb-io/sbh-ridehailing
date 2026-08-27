import {
  noStoreJson,
  normalizeSessionId,
  parseJson,
  parseRidePatch,
  rateLimit,
} from "@/lib/api";
import { InvalidRideTransitionError, updateRide } from "@/lib/store";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const limited = rateLimit(request, "rides:update", 60, 60_000);
  if (limited) return limited;

  const { id } = await params;
  const body = await parseJson<Record<string, unknown>>(request);
  const sessionId = normalizeSessionId(body?.sessionId);
  const patch = parseRidePatch(body);
  if (!body || !sessionId || !patch) {
    return noStoreJson({ error: "Données invalides." }, { status: 400 });
  }

  let ride;
  try {
    ride = await updateRide(id, sessionId, patch);
  } catch (error) {
    if (error instanceof InvalidRideTransitionError) {
      return noStoreJson(
        { error: "Cette étape de réservation n’est plus disponible." },
        { status: 409 },
      );
    }
    console.error("ride_update_failed", { rideId: id, error });
    return noStoreJson(
      { error: "Impossible d’enregistrer la demande." },
      { status: 500 },
    );
  }
  if (!ride) {
    return noStoreJson({ error: "Course introuvable." }, { status: 404 });
  }

  return noStoreJson({ ride });
}
