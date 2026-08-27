import { describe, expect, it } from "vitest";
import { fareZoneForPlace } from "../fares";
import { customPlace } from "../places-search";
import { findPlaceByName } from "../places";
import { bookerQuoteText, taxiOfferText } from "../dispatch/copy";
import {
  assignJobFareZone,
  driverZoneButtons,
  jobNeedsDriverZone,
  missingFareSides,
  parseDriverZoneButton,
} from "../dispatch/zones";
import type { DispatchJob } from "../dispatch/types";
import type { QuoteResult } from "../types";

const quote: QuoteResult = {
  zoneFrom: null,
  zoneTo: "saint-jean",
  fareBand: "day",
  daytimeFare: null,
  surcharge: 0,
  fare: null,
  distanceKm: null,
  durationMinutes: null,
  route: [],
  departAt: "2026-08-26T16:00:00.000Z",
};

function job(overrides: Partial<DispatchJob> = {}): DispatchJob {
  return {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    channel: "whatsapp",
    bookerChatId: "590690000000",
    status: "ring_taxis",
    ringStartedAt: "2026-08-26T16:00:00.000Z",
    ringEndsAt: "2026-08-26T16:02:00.000Z",
    pickup: customPlace("Villa secret 12"),
    dropoff: {
      ...findPlaceByName("Eden Rock")!,
      source: "catalog",
    },
    departAt: "2026-08-26T16:00:00.000Z",
    pax: 2,
    passengerPhone: "+590690000000",
    quote,
    offers: [
      {
        kind: "taxi",
        supplierId: "taxi-12",
        chatId: "1",
        status: "pending",
      },
    ],
    hold: null,
    reofferAt: null,
    acceptedBy: null,
    createdAt: "2026-08-26T16:00:00.000Z",
    ...overrides,
  };
}

describe("driver fare zone assignment", () => {
  it("asks the driver only when a place has no quartier", () => {
    const live = job();
    expect(missingFareSides(live.pickup, live.dropoff)).toEqual(["pickup"]);
    expect(jobNeedsDriverZone(live)).toBe(true);
    expect(
      missingFareSides(
        { ...findPlaceByName("Gustavia")!, source: "catalog" },
        live.dropoff,
      ),
    ).toEqual([]);
  });

  it("assigns Google Places quartiers from coordinates, not Gustavia in the address", () => {
    expect(
      fareZoneForPlace({
        name: "Sella",
        address: "Gustavia 97133, Saint-Barthélemy",
        lat: 17.904952,
        lng: -62.853432,
        source: "google",
      }),
    ).toBe("public");
  });

  it("infers a quartier from a custom name that already contains one", () => {
    expect(
      missingFareSides(customPlace("Villa Lorient"), liveDropoff()),
    ).toEqual([]);
  });

  it("rebuilds the official fare after the driver picks a quartier", () => {
    const next = assignJobFareZone(job(), "pickup", "gustavia");
    expect(next.pickup.fareZone).toBe("gustavia");
    expect(next.quote.zoneFrom).toBe("gustavia");
    expect(next.quote.zoneTo).toBe("saint-jean");
    expect(next.quote.fare).toBeGreaterThan(0);
    expect(jobNeedsDriverZone(next)).toBe(false);
  });

  it("keeps Telegram callback data under 64 bytes", () => {
    const buttons = driverZoneButtons(
      job(),
      "pickup",
      "caribbean-discovery",
      0,
      "fr",
    );
    const ids = buttons.flat().map((button) => button.id);
    expect(ids.some((id) => id.startsWith("zd:aaaaaaaa:p:caribbean-discovery:"))).toBe(
      true,
    );
    expect(ids).toContain("n:aaaaaaaa:caribbean-discovery");
    expect(ids.every((id) => id.length <= 64)).toBe(true);
    expect(parseDriverZoneButton(ids[0]!)).toEqual({
      jobPrefix: "aaaaaaaa",
      side: "pickup",
      supplierId: "caribbean-discovery",
      page: null,
      zone: expect.any(String),
    });
    expect(
      parseDriverZoneButton("zd:aaaaaaaa:p:caribbean-discovery:m1"),
    ).toEqual({
      jobPrefix: "aaaaaaaa",
      side: "pickup",
      supplierId: "caribbean-discovery",
      page: 1,
      zone: null,
    });
  });

  it("tells the booker and driver that the chauffeur will set the quartier", () => {
    const live = job();
    expect(bookerQuoteText(live, "fr")).toContain(
      "Le chauffeur indiquera le quartier",
    );
    expect(taxiOfferText(live, "taxi-12", "fr")).toContain(
      "à l’acceptation, choisissez le quartier",
    );
    expect(taxiOfferText(live, "taxi-12", "fr")).not.toContain("Villa secret 12");
    expect(taxiOfferText(live, "taxi-12", "fr")).toContain("quartiers à confirmer");
    expect(taxiOfferText(live, "taxi-12", "fr")).toContain("Saint-Jean");
  });
});

function liveDropoff() {
  return { ...findPlaceByName("Eden Rock")!, source: "catalog" as const };
}
