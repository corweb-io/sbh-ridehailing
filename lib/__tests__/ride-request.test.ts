import { describe, expect, it } from "vitest";
import { parseDepartTime } from "../chat/booker";
import { hydrateRideRequest } from "../ride-request-hydrate";
import {
  looksLikeRideRequest,
  parseRideRequestDeterministic,
} from "../ride-request";

describe("looksLikeRideRequest", () => {
  it("accepts a short stand-style message", () => {
    expect(
      looksLikeRideRequest("2 · Eden Rock → Aéroport · maintenant"),
    ).toBe(true);
    expect(
      looksLikeRideRequest("taxi for 2 from Eden Rock to the airport now"),
    ).toBe(true);
    expect(looksLikeRideRequest("Gustavia")).toBe(false);
    expect(looksLikeRideRequest("/taxi")).toBe(false);
    expect(looksLikeRideRequest("merci")).toBe(false);
  });
});

describe("parseRideRequestDeterministic", () => {
  it("reads the compact recommended format", () => {
    const fields = parseRideRequestDeterministic(
      "2 · Eden Rock → Aéroport · maintenant",
    );
    expect(fields).toMatchObject({
      pickupText: "Eden Rock",
      destinationText: "Aéroport",
      pax: 2,
      departNow: true,
      isRideRequest: true,
    });
  });

  it("reads labeled French lines", () => {
    const fields = parseRideRequestDeterministic(
      "De: Eden Rock\nÀ: Aéroport\nPax: 3\nQuand: demain 10h",
    );
    expect(fields.pickupText).toBe("Eden Rock");
    expect(fields.destinationText).toBe("Aéroport");
    expect(fields.pax).toBe(3);
    expect(fields.whenText).toMatch(/demain 10h/i);
  });

  it("reads a natural English sentence and airport alias", () => {
    const fields = parseRideRequestDeterministic(
      "I need a taxi for two people going from Eden Rock to the airport",
    );
    expect(fields.pickupText).toBe("Eden Rock");
    expect(fields.destinationText).toBe("Aéroport");
    expect(fields.pax).toBe(2);
  });

  it("reads two catalog names in order as pickup then drop-off", () => {
    const fields = parseRideRequestDeterministic(
      "Kitchen Gustavia demain 18h",
    );
    expect(fields.pickupText).toBe("Kitchen");
    expect(fields.destinationText).toBe("Gustavia");
    expect(fields.whenText).toMatch(/demain 18h/i);
  });
});

describe("hydrateRideRequest", () => {
  it("resolves catalog places and a typed time", async () => {
    const fields = parseRideRequestDeterministic(
      "2 · Eden Rock → Aéroport · demain 10h",
    );
    const now = new Date("2026-08-26T12:00:00.000Z");
    const draft = await hydrateRideRequest(fields, {
      method: "deterministic",
      parseWhen: parseDepartTime,
      now,
      whatsappChatId: "590690111111",
    });
    expect(draft.pickup).toMatchObject({ name: "Eden Rock", source: "catalog" });
    expect(draft.destination).toMatchObject({
      name: "Aéroport",
      source: "catalog",
    });
    expect(draft.pax).toBe(2);
    expect(draft.passengerPhone).toBe("+590690111111");
    expect(draft.departAt).toBe(parseDepartTime("demain 10h", now)?.toISOString());
  });
});
