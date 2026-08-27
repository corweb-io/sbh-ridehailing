import { SBH_BOUNDS } from "./config";
import type { LatLng, Place } from "./types";

const NOMINATIM_HEADERS = {
  Accept: "application/json",
  "User-Agent": "sbh-ridehailing-smoke-test/1.0",
};
const EXTERNAL_REQUEST_TIMEOUT_MS = 4_000;

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

export function samePlace(a: LatLng, b: LatLng) {
  return Math.abs(a.lat - b.lat) < 0.00045 && Math.abs(b.lng - a.lng) < 0.00045;
}

export function bearingDegrees(from: LatLng, to: LatLng) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const φ1 = toRad(from.lat);
  const φ2 = toRad(to.lat);
  const Δλ = toRad(to.lng - from.lng);
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x =
    Math.cos(φ1) * Math.sin(φ2) -
    Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

export function pointFromPlace(place: Place | null | undefined): LatLng | null {
  if (
    !place ||
    typeof place.lat !== "number" ||
    typeof place.lng !== "number"
  ) {
    return null;
  }
  return { lat: place.lat, lng: place.lng };
}

export function sameLocation(a: Place, b: Place) {
  const pointA = pointFromPlace(a);
  const pointB = pointFromPlace(b);
  if (pointA && pointB) return samePlace(pointA, pointB);
  return (
    a.address.trim().toLocaleLowerCase("fr") ===
    b.address.trim().toLocaleLowerCase("fr")
  );
}

export type RouteEstimate = {
  distanceKm: number;
  durationMinutes: number;
  route: [number, number][];
};

export async function estimateRoute(
  pickup: LatLng,
  destination: LatLng,
): Promise<RouteEstimate> {
  try {
    const url = `https://router.project-osrm.org/route/v1/driving/${pickup.lng},${pickup.lat};${destination.lng},${destination.lat}?overview=full&geometries=geojson`;
    const response = await fetch(url, {
      next: { revalidate: 300 },
      signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
    });
    if (response.ok) {
      const data = (await response.json()) as {
        routes?: {
          distance: number;
          duration: number;
          geometry?: { coordinates: [number, number][] };
        }[];
      };
      const route = data.routes?.[0];
      if (route) {
        return {
          distanceKm: route.distance / 1000,
          durationMinutes: route.duration / 60,
          route: route.geometry?.coordinates ?? [
            [pickup.lng, pickup.lat],
            [destination.lng, destination.lat],
          ],
        };
      }
    }
  } catch {
    // Fall through to the island-road estimate.
  }

  return mockRouteEstimate(pickup, destination);
}

export function mockRouteEstimate(
  pickup: LatLng,
  destination: LatLng,
): RouteEstimate {
  const straight = haversineKm(pickup, destination);
  const distanceKm = Math.max(0.6, straight * 1.4);
  const durationMinutes = (distanceKm / 28) * 60;
  const steps = 8;
  const route: [number, number][] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const bulge = Math.sin(t * Math.PI) * 0.0038;
    route.push([
      pickup.lng + (destination.lng - pickup.lng) * t + bulge,
      pickup.lat + (destination.lat - pickup.lat) * t - bulge * 0.35,
    ]);
  }
  return {
    distanceKm,
    durationMinutes,
    route,
  };
}

type NominatimHit = {
  display_name: string;
  lat: string;
  lon: string;
  name?: string;
};

export async function searchNominatim(query: string) {
  const params = new URLSearchParams({
    q: query,
    format: "jsonv2",
    addressdetails: "1",
    limit: "6",
    countrycodes: "bl",
    viewbox: `${SBH_BOUNDS.west},${SBH_BOUNDS.north},${SBH_BOUNDS.east},${SBH_BOUNDS.south}`,
    bounded: "1",
  });

  const response = await fetch(
    `https://nominatim.openstreetmap.org/search?${params}`,
    {
      headers: NOMINATIM_HEADERS,
      next: { revalidate: 3_600 },
      signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
    },
  );

  if (!response.ok) return [];
  const hits = (await response.json()) as NominatimHit[];
  return hits.map((hit) => ({
    name: hit.name || hit.display_name.split(",")[0],
    address: hit.display_name,
    lat: Number(hit.lat),
    lng: Number(hit.lon),
  }));
}

export async function reverseGeocode(point: LatLng): Promise<string | null> {
  const params = new URLSearchParams({
    lat: String(point.lat),
    lon: String(point.lng),
    format: "jsonv2",
    zoom: "16",
  });

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?${params}`,
      {
        headers: NOMINATIM_HEADERS,
        next: { revalidate: 86_400 },
        signal: AbortSignal.timeout(EXTERNAL_REQUEST_TIMEOUT_MS),
      },
    );
    if (!response.ok) return null;
    const data = (await response.json()) as {
      name?: string;
      display_name?: string;
    };
    if (data.display_name) return data.display_name.split(",").slice(0, 3).join(", ");
    if (data.name) return data.name;
    return null;
  } catch {
    return null;
  }
}
