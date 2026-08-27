import { describe, expect, it } from "vitest";
import { driverTripView, type MockTrip } from "../mock-store";

const trip: MockTrip = {
  id: "trip-1",
  source: "passenger",
  hotelId: null,
  passengerId: "passenger-1",
  passengerName: "Marie",
  passengerPhone: "+590690000000",
  guestName: null,
  guestPhone: null,
  guestRoom: null,
  guestCount: 1,
  pickup: {
    name: "Départ",
    address: "Rue du départ",
    lat: 17.9,
    lng: -62.85,
    fareZone: "gustavia",
  },
  destination: {
    name: "Villa confidentielle",
    address: "Adresse secrète",
    lat: 17.91,
    lng: -62.82,
    fareZone: "grand-cul-de-sac",
  },
  quote: {
    zoneFrom: "gustavia",
    zoneTo: "grand-cul-de-sac",
    fareBand: "day",
    daytimeFare: 35,
    surcharge: 0,
    fare: 35,
    distanceKm: 8,
    durationMinutes: 20,
    route: [
      [-62.85, 17.9],
      [-62.82, 17.91],
    ],
    departAt: "2026-08-25T12:00:00.000Z",
  },
  status: "requested",
  driverId: null,
  createdAt: "2026-08-25T11:59:00.000Z",
  acceptedAt: null,
  arrivedAt: null,
  onboardAt: null,
  completedAt: null,
  notes: "Portail bleu",
  declinedBy: [],
  refusals: [],
  requirements: { pmr: false, hybridElectric: false },
  offeredDriverId: "taxi-1",
  offeredAt: "2026-08-25T12:00:00.000Z",
  cancelReason: null,
};

describe("driver destination firewall", () => {
  it("keeps only the destination fare zone and removes route geometry", () => {
    const view = driverTripView(trip);
    const serialized = JSON.stringify(view);

    expect(view.destinationZone).toBe("grand-cul-de-sac");
    expect(serialized).not.toContain("Villa confidentielle");
    expect(serialized).not.toContain("Adresse secrète");
    expect(serialized).not.toContain("-62.82");
    expect("route" in view.quote).toBe(false);
    expect("destination" in view).toBe(false);
    expect("refusals" in view).toBe(false);
  });
});
