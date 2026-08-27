import { haversineKm } from "./geo";
import type { LatLng } from "./types";

export const OFFER_RESPONSE_MS = 90_000;
export const TAXI_STAND_RADIUS_KM = 0.15;
export const REGULATORY_AUDIT_RETENTION_MS = 365 * 24 * 60 * 60 * 1000;
export const GEOLOCATION_RETENTION_MS = 62 * 24 * 60 * 60 * 1000;

export type TripRequirements = {
  pmr: boolean;
  hybridElectric: boolean;
};

export const EMPTY_TRIP_REQUIREMENTS: TripRequirements = {
  pmr: false,
  hybridElectric: false,
};

export type TaxiCapabilities = {
  pmr: boolean | null;
  hybridElectric: boolean | null;
};

export type RefusalGround =
  | "work_rest_time"
  | "prior_reservation"
  | "simultaneous_street_request"
  | "at_station_head"
  | "pickup_inaccessible_or_client_absent";

export const REFUSAL_GROUND_LABELS: Record<RefusalGround, string> = {
  work_rest_time: "Temps de travail ou de repos incompatible",
  prior_reservation: "Réservation préalable incompatible",
  simultaneous_street_request: "Demande simultanée sur la voie publique",
  at_station_head: "Taxi en tête de station",
  pickup_inaccessible_or_client_absent:
    "Prise en charge inaccessible ou client absent",
};

export type TripRefusal = {
  driverId: string;
  ground: RefusalGround;
  offeredAt: string;
  refusedAt: string;
  reportedAt: string;
};

export type TaxiStandHead = {
  id: string;
  name: string;
  point: LatLng;
  phone: string;
  phoneLabel: string;
  coordinatesStatus: "provisional" | "verified";
};

export type DispatchCandidate = TaxiCapabilities & {
  id: string;
  location: LatLng;
  locationUpdatedAt: string | null;
  online: boolean;
  busy: boolean;
};

export function taxiMeetsRequirements(
  taxi: TaxiCapabilities,
  requirements: TripRequirements,
) {
  if (requirements.pmr && taxi.pmr !== true) return false;
  if (requirements.hybridElectric && taxi.hybridElectric !== true) return false;
  return true;
}

export function rankEligibleTaxis(
  candidates: readonly DispatchCandidate[],
  pickup: LatLng,
  requirements: TripRequirements,
  declinedBy: readonly string[],
  now = Date.now(),
  freshnessMs = 45_000,
) {
  return candidates
    .filter((candidate) => {
      const updatedAt = Date.parse(candidate.locationUpdatedAt ?? "");
      return (
        candidate.online &&
        !candidate.busy &&
        Number.isFinite(updatedAt) &&
        now - updatedAt <= freshnessMs &&
        !declinedBy.includes(candidate.id) &&
        taxiMeetsRequirements(candidate, requirements)
      );
    })
    .map((candidate) => ({
      ...candidate,
      distanceKm: haversineKm(candidate.location, pickup),
    }))
    .sort(
      (a, b) =>
        a.distanceKm - b.distanceKm || a.id.localeCompare(b.id),
    );
}

export function nearestStandWithinRadius(
  pickup: LatLng | null,
  stands: readonly TaxiStandHead[],
) {
  if (!pickup) return null;
  let nearest: { stand: TaxiStandHead; distanceKm: number } | null = null;
  for (const stand of stands) {
    const distanceKm = haversineKm(pickup, stand.point);
    if (distanceKm > TAXI_STAND_RADIUS_KM) continue;
    if (!nearest || distanceKm < nearest.distanceKm) {
      nearest = { stand, distanceKm };
    }
  }
  return nearest;
}

export function isRefusalGround(value: unknown): value is RefusalGround {
  return (
    typeof value === "string" &&
    Object.prototype.hasOwnProperty.call(REFUSAL_GROUND_LABELS, value)
  );
}
