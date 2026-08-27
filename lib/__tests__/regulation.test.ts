import { describe, expect, it } from "vitest";
import {
  isRefusalGround,
  nearestStandWithinRadius,
  OFFER_RESPONSE_MS,
  rankEligibleTaxis,
  TAXI_STAND_RADIUS_KM,
  type DispatchCandidate,
} from "../regulation";

const now = Date.parse("2026-08-25T12:00:00.000Z");

function candidate(
  id: string,
  lat: number,
  overrides: Partial<DispatchCandidate> = {},
): DispatchCandidate {
  return {
    id,
    location: { lat, lng: -62.85 },
    locationUpdatedAt: new Date(now - 1_000).toISOString(),
    online: true,
    busy: false,
    pmr: null,
    hybridElectric: null,
    ...overrides,
  };
}

describe("taxi register regulation", () => {
  it("uses the statutory 90-second offer window", () => {
    expect(OFFER_RESPONSE_MS).toBe(90_000);
  });

  it("accepts only the five Article 7 refusal grounds", () => {
    expect(isRefusalGround("at_station_head")).toBe(true);
    expect(isRefusalGround("prefer_not_to")).toBe(false);
  });

  it("applies the 150 m rule from pickup to station head", () => {
    const stand = {
      id: "test",
      name: "Station test",
      point: { lat: 17.9, lng: -62.85 },
      phone: "123",
      phoneLabel: "123",
      coordinatesStatus: "provisional" as const,
    };
    const near = nearestStandWithinRadius(
      { lat: 17.9 + TAXI_STAND_RADIUS_KM / 111 / 2, lng: -62.85 },
      [stand],
    );
    const far = nearestStandWithinRadius(
      { lat: 17.9 + TAXI_STAND_RADIUS_KM / 111 * 2, lng: -62.85 },
      [stand],
    );
    expect(near?.stand.id).toBe("test");
    expect(far).toBeNull();
  });

  it("filters stale, busy, declined and unknown-capability taxis then ranks nearest", () => {
    const ranked = rankEligibleTaxis(
      [
        candidate("far-capable", 17.92, { pmr: true }),
        candidate("near-capable", 17.901, { pmr: true }),
        candidate("unknown", 17.9001),
        candidate("busy", 17.9, { pmr: true, busy: true }),
        candidate("stale", 17.9, {
          pmr: true,
          locationUpdatedAt: new Date(now - 60_000).toISOString(),
        }),
      ],
      { lat: 17.9, lng: -62.85 },
      { pmr: true, hybridElectric: false },
      ["far-capable"],
      now,
    );
    expect(ranked.map((taxi) => taxi.id)).toEqual(["near-capable"]);
  });

  it("advances sequentially after the nearest taxi times out or refuses", () => {
    const taxis = [
      candidate("nearest", 17.901),
      candidate("second", 17.902),
    ];
    const first = rankEligibleTaxis(
      taxis,
      { lat: 17.9, lng: -62.85 },
      { pmr: false, hybridElectric: false },
      [],
      now,
    );
    const next = rankEligibleTaxis(
      taxis,
      { lat: 17.9, lng: -62.85 },
      { pmr: false, hybridElectric: false },
      ["nearest"],
      now,
    );
    expect(first[0].id).toBe("nearest");
    expect(next[0].id).toBe("second");
  });
});
