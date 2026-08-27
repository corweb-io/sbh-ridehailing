import {
  noStoreJson,
  parseJson,
  rateLimit,
  validIslandPoint,
} from "@/lib/api";
import { estimateRoute } from "@/lib/geo";

export async function POST(request: Request) {
  const limited = rateLimit(request, "route:preview", 30, 60_000);
  if (limited) return limited;

  const body = await parseJson<{
    pickup?: { lat: number; lng: number };
    destination?: { lat: number; lng: number };
  }>(request);

  if (
    !body ||
    !validIslandPoint(body.pickup) ||
    !validIslandPoint(body.destination)
  ) {
    return noStoreJson(
      { error: "Le départ et la destination sont invalides." },
      { status: 400 },
    );
  }

  const samePoint =
    Math.abs(body.pickup.lat - body.destination.lat) < 0.0004 &&
    Math.abs(body.pickup.lng - body.destination.lng) < 0.0004;
  if (samePoint) {
    return noStoreJson(
      { error: "Choisissez deux lieux différents." },
      { status: 400 },
    );
  }

  try {
    const route = await estimateRoute(body.pickup, body.destination);
    return noStoreJson({ route: route.route });
  } catch (error) {
    console.error("route_preview_failed", { error });
    return noStoreJson(
      { error: "Impossible de prévisualiser l’itinéraire." },
      { status: 502 },
    );
  }
}
