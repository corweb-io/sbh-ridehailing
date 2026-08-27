import {
  noStoreJson,
  parseJson,
  rateLimit,
  validIslandPoint,
} from "@/lib/api";
import {
  DRIVER_SESSION_COOKIE,
  readDriverSessionToken,
} from "@/lib/driver-session";
import { listDriverLocations, upsertDriverLocation } from "@/lib/driver-locations";
import { MOCK_DRIVERS } from "@/lib/mock-store";
import type { NextRequest } from "next/server";

const KNOWN_DRIVERS = new Set(MOCK_DRIVERS.map((driver) => driver.id));

export const dynamic = "force-dynamic";

function normalizeHeading(value: number) {
  const heading = value % 360;
  return heading < 0 ? heading + 360 : heading;
}

export async function GET(request: Request) {
  const limited = rateLimit(request, "drivers:location:get", 60, 60_000);
  if (limited) return limited;

  try {
    const locations = await listDriverLocations();
    return noStoreJson({ locations });
  } catch (error) {
    console.error("driver_locations_read_failed", { error });
    return noStoreJson(
      { error: "Impossible de lire les positions." },
      { status: 500 },
    );
  }
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "drivers:location:post", 40, 60_000);
  if (limited) return limited;

  const body = await parseJson<{
    driverId?: string;
    lat?: number;
    lng?: number;
    heading?: number | null;
    accuracy?: number | null;
  }>(request);

  const driverId =
    typeof body?.driverId === "string" ? body.driverId.trim() : "";
  const session = readDriverSessionToken(
    request.cookies.get(DRIVER_SESSION_COOKIE)?.value,
  );
  const point = { lat: body?.lat, lng: body?.lng };
  const heading =
    body?.heading === undefined || body.heading === null
      ? null
      : typeof body.heading === "number" && Number.isFinite(body.heading)
        ? body.heading
        : undefined;
  const accuracy =
    body?.accuracy === undefined || body.accuracy === null
      ? null
      : typeof body.accuracy === "number" && Number.isFinite(body.accuracy)
        ? body.accuracy
        : undefined;

  if (
    !body ||
    !session ||
    session.driverId !== driverId ||
    !KNOWN_DRIVERS.has(driverId) ||
    !validIslandPoint(point) ||
    heading === undefined ||
    accuracy === undefined ||
    (heading !== null && (heading < 0 || heading > 360)) ||
    (accuracy !== null && (accuracy < 0 || accuracy > 10_000))
  ) {
    return noStoreJson(
      { error: session ? "Position invalide." : "Session chauffeur requise." },
      { status: session ? 400 : 401 },
    );
  }

  try {
    const location = await upsertDriverLocation({
      driverId,
      lat: point.lat,
      lng: point.lng,
      heading: heading === null ? null : normalizeHeading(heading),
      accuracy,
      updatedAt: new Date().toISOString(),
    });
    return noStoreJson({ location });
  } catch (error) {
    console.error("driver_location_write_failed", { error });
    return noStoreJson(
      { error: "Impossible d’enregistrer la position." },
      { status: 500 },
    );
  }
}
