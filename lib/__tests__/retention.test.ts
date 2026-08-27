import { describe, expect, it } from "vitest";
import {
  sanitizeLocalStore,
  type StoreShape,
} from "../store";
import type { SmokeTestEvent, SmokeTestRide } from "../types";

function ride(createdAt: string): SmokeTestRide {
  return {
    id: crypto.randomUUID(),
    session_id: "session",
    created_at: createdAt,
    pickup_lat: 17.9,
    pickup_lng: -62.85,
    pickup_address: "Pickup",
    destination_lat: 17.91,
    destination_lng: -62.82,
    destination_address: "Must be erased",
    distance_km: null,
    estimated_duration_minutes: null,
    quoted_price: null,
    fare_zone_from: "gustavia",
    fare_zone_to: "lorient",
    fare_band: "day",
    pricing_variant: null,
    status: "started",
    started_at: createdAt,
    quote_viewed_at: null,
    pickup_confirmed_at: null,
    requested_at: null,
    search_started_at: null,
    completed_at: null,
    contact: null,
    first_name: null,
    user_type: null,
    acquisition_source: null,
    events: [],
  };
}

function event(createdAt: string): SmokeTestEvent {
  return {
    id: crypto.randomUUID(),
    session_id: "session",
    ride_id: null,
    name: "ride_started",
    created_at: createdAt,
  };
}

describe("local retention", () => {
  it("always redacts destination, removes old coordinates, and deletes annual records", () => {
    const now = Date.parse("2026-08-25T12:00:00.000Z");
    const recent = ride("2026-08-20T12:00:00.000Z");
    const oldGeo = ride("2026-05-01T12:00:00.000Z");
    const expired = ride("2025-01-01T12:00:00.000Z");
    const store: StoreShape = {
      rides: [recent, oldGeo, expired],
      events: [
        event("2026-08-20T12:00:00.000Z"),
        event("2025-01-01T12:00:00.000Z"),
      ],
    };

    const sanitized = sanitizeLocalStore(store, now);

    expect(sanitized.rides).toHaveLength(2);
    expect(sanitized.events).toHaveLength(1);
    expect(sanitized.rides[0].destination_address).toBeNull();
    expect(sanitized.rides[0].destination_lat).toBeNull();
    expect(sanitized.rides[0].pickup_lat).toBe(17.9);
    expect(sanitized.rides[1].pickup_lat).toBeNull();
    expect(sanitized.rides[1].pickup_lng).toBeNull();
  });
});
