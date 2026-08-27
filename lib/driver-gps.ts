import type { LatLng } from "./types";

export type DriverLocationPing = {
  driverId: string;
  lat: number;
  lng: number;
  heading: number | null;
  accuracy: number | null;
  updatedAt: string;
};

export const GPS_UPLOAD_MS = 5_000;
export const GPS_POLL_MS = 5_000;
export const GPS_FRESH_MS = 45_000;
export const GPS_MIN_MOVE_M = 12;

export function isFreshGps(updatedAt: string | null | undefined, now = Date.now()) {
  if (!updatedAt) return false;
  const at = Date.parse(updatedAt);
  return Number.isFinite(at) && now - at < GPS_FRESH_MS;
}

export function movedEnough(from: LatLng, to: LatLng, minMeters: number) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.lat - from.lat);
  const dLng = toRad(to.lng - from.lng);
  const lat1 = toRad(from.lat);
  const lat2 = toRad(to.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.min(1, Math.sqrt(h))) >= minMeters;
}

export async function postDriverLocation(
  ping: Omit<DriverLocationPing, "updatedAt">,
) {
  const response = await fetch("/api/drivers/location", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(ping),
    keepalive: true,
  });
  if (!response.ok) {
    throw new Error("driver_location_post_failed");
  }
}

export async function fetchDriverLocations(signal?: AbortSignal) {
  const response = await fetch("/api/drivers/location", {
    cache: "no-store",
    signal,
  });
  if (!response.ok) return [] as DriverLocationPing[];
  const data = (await response.json()) as { locations?: DriverLocationPing[] };
  return Array.isArray(data.locations) ? data.locations : [];
}
