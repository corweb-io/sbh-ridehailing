import { fareZoneForPlace, quoteFareForZones } from "./fares";
import { mockRouteEstimate, pointFromPlace } from "./geo";
import type { Place, QuoteResult } from "./types";

export function buildOfficialQuote(
  pickup: Place,
  destination: Place,
  at: Date = new Date(),
): QuoteResult {
  const pickupPoint = pointFromPlace(pickup);
  const destinationPoint = pointFromPlace(destination);
  const fare = quoteFareForZones({
    zoneFrom: fareZoneForPlace(pickup),
    zoneTo: fareZoneForPlace(destination),
    at,
  });
  const estimate =
    pickupPoint && destinationPoint
      ? mockRouteEstimate(pickupPoint, destinationPoint)
      : null;
  return {
    ...fare,
    distanceKm: estimate ? Number(estimate.distanceKm.toFixed(1)) : null,
    durationMinutes: estimate
      ? Math.max(1, Math.round(estimate.durationMinutes))
      : null,
    route: estimate?.route ?? [],
    departAt: at.toISOString(),
  };
}
