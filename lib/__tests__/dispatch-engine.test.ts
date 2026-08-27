import { describe, expect, it } from "vitest";
import { taxiFitsParty, taxiSeats } from "../dispatch/seats";
import {
  acceptOffer,
  allPendingDeclined,
  busySupplierIds,
  cancelJob,
  confirmHold,
  declineOffer,
  isReofferDue,
  markArrived,
  markCompleted,
  markEnRoute,
  placeHold,
  rejectHold,
  releaseAssignment,
  reminderDue,
  scheduleLoopbackReoffer,
  startCompanyRing,
  startTaxiRing,
  tickJob,
  upcomingAssignedJobs,
  upcomingBookerJobs,
} from "../dispatch/engine";
import {
  assignedDriverText,
  bookerRideButton,
  bookerRidesText,
  jobLabel,
  ridesChooserText,
  taxiOfferText,
  upcomingRidesText,
} from "../dispatch/copy";
import type { DispatchJob } from "../dispatch/types";
import type { QuoteResult } from "../types";

const quote: QuoteResult = {
  zoneFrom: "gustavia",
  zoneTo: "grand-cul-de-sac",
  fareBand: "day",
  daytimeFare: 45,
  surcharge: 0,
  fare: 45,
  distanceKm: 8,
  durationMinutes: 18,
  route: [],
  departAt: "2026-08-26T16:00:00.000Z",
};

function job(overrides: Partial<DispatchJob> = {}): DispatchJob {
  return {
    id: "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee",
    channel: "telegram",
    bookerChatId: "booker-1",
    status: "ring_taxis",
    ringStartedAt: "2026-08-26T16:00:00.000Z",
    ringEndsAt: "2026-08-26T16:02:00.000Z",
    pickup: {
      name: "Villa confidentielle",
      address: "Adresse secrète",
      lat: 17.9,
      lng: -62.85,
      fareZone: "gustavia",
    },
    dropoff: {
      name: "Eden Rock",
      address: "Saint-Jean",
      lat: 17.9,
      lng: -62.83,
      fareZone: "saint-jean",
    },
    departAt: "2026-08-26T16:00:00.000Z",
    pax: 2,
    passengerPhone: "+590690000000",
    quote,
    offers: [],
    hold: null,
    reofferAt: null,
    acceptedBy: null,
    createdAt: "2026-08-26T16:00:00.000Z",
    ...overrides,
  };
}

const taxis = [
  {
    id: "taxi-01",
    name: "A",
    phone: "+1",
    phoneLabel: "+1",
    vehicle: null,
    kind: "licensed" as const,
    number: "1",
    ads: "ADS 1",
    plate: "Taxi n°1",
    pmr: null,
    hybridElectric: null,
    registrySource: "demo" as const,
  },
  {
    id: "taxi-02",
    name: "B",
    phone: "+2",
    phoneLabel: "+2",
    vehicle: "Hyundai Staria",
    kind: "licensed" as const,
    number: "2",
    ads: "ADS 2",
    plate: "Taxi n°2",
    pmr: null,
    hybridElectric: null,
    registrySource: "demo" as const,
  },
];

describe("taxi seats", () => {
  it("treats a Staria as a van, not a 4-seater", () => {
    expect(taxiSeats({ vehicle: "Hyundai Staria" })).toBe(7);
    expect(taxiFitsParty({ vehicle: null }, 5)).toBe(false);
    expect(taxiFitsParty({ vehicle: "Mercedes Class V" }, 6)).toBe(true);
  });
});

describe("dispatch rings", () => {
  it("broadcasts every taxi that seats the party", () => {
    const live = startTaxiRing(job(), new Date("2026-08-26T16:00:00.000Z"), [], taxis, 2_000);
    expect(live.status).toBe("ring_taxis");
    expect(live.offers.map((offer) => offer.supplierId)).toEqual([
      "taxi-01",
      "taxi-02",
    ]);
    expect(live.offers.every((offer) => offer.chatId === "booker-1")).toBe(true);
  });

  it("does not offer to a WhatsApp driver whose 24h session is closed", () => {
    const now = new Date("2026-08-27T16:00:00.000Z");
    const live = startTaxiRing(
      job({ channel: "whatsapp", bookerChatId: "booker-wa" }),
      now,
      [
        {
          channel: "whatsapp",
          chatId: "590690000001",
          kind: "taxi",
          supplierId: "taxi-01",
          boundAt: "2026-08-25T16:00:00.000Z",
          lastInboundAt: "2026-08-25T16:00:00.000Z",
          onDuty: true,
        },
        {
          channel: "whatsapp",
          chatId: "590690000002",
          kind: "taxi",
          supplierId: "taxi-02",
          boundAt: "2026-08-27T12:00:00.000Z",
          lastInboundAt: "2026-08-27T12:00:00.000Z",
          onDuty: true,
        },
      ],
      taxis,
      2_000,
    );
    expect(live.offers.map((offer) => offer.supplierId)).toEqual(["taxi-02"]);
    expect(live.offers[0]?.chatId).toBe("590690000002");
  });

  it("does not offer to a bound taxi who is off duty", () => {
    const now = new Date("2026-08-26T16:00:00.000Z");
    const live = startTaxiRing(
      job(),
      now,
      [
        {
          channel: "telegram",
          chatId: "driver-2",
          kind: "taxi",
          supplierId: "taxi-02",
          boundAt: now.toISOString(),
          lastInboundAt: now.toISOString(),
          onDuty: false,
        },
      ],
      taxis,
      2_000,
    );
    expect(live.offers.map((offer) => offer.supplierId)).toEqual(["taxi-01"]);
  });

  it("skips the taxi ring when no car seats the party", () => {
    const live = startTaxiRing(
      job({ pax: 8 }),
      new Date("2026-08-26T16:00:00.000Z"),
      [],
      taxis,
      2_000,
    );
    expect(live.status).toBe("ring_companies");
    expect(live.offers.every((offer) => offer.kind === "company")).toBe(true);
  });

  it("lets the first yes win and marks the rest taken", () => {
    let live = startTaxiRing(job(), new Date("2026-08-26T16:00:00.000Z"), [], taxis, 2_000);
    live = acceptOffer(live, "taxi-02", new Date("2026-08-26T16:00:10.000Z"))!;
    expect(live.status).toBe("assigned");
    expect(live.acceptedBy?.supplierId).toBe("taxi-02");
    expect(live.offers.find((offer) => offer.supplierId === "taxi-01")?.status).toBe(
      "taken",
    );
    expect(acceptOffer(live, "taxi-01", new Date())).toBeNull();
  });

  it("opens companies after the taxi ring times out", () => {
    const started = startTaxiRing(
      job(),
      new Date("2026-08-26T16:00:00.000Z"),
      [],
      taxis,
      2_000,
    );
    const later = tickJob(
      started,
      new Date("2026-08-26T16:00:03.000Z"),
      [],
      2_000,
    );
    expect(later.status).toBe("ring_companies");
    expect(later.offers.some((offer) => offer.kind === "company")).toBe(true);
    expect(
      later.offers.filter((offer) => offer.kind === "taxi").every((offer) => offer.status === "taken"),
    ).toBe(true);
  });

  it("declines only one taxi so the rest of the ring stays open", () => {
    let live = startTaxiRing(job(), new Date("2026-08-26T16:00:00.000Z"), [], taxis, 60_000);
    live = declineOffer(live, "any-taxi")!;
    expect(live.status).toBe("ring_taxis");
    expect(live.offers.filter((offer) => offer.status === "pending")).toHaveLength(1);
    expect(allPendingDeclined(live)).toBe(false);
    live = tickJob(live, new Date("2026-08-26T16:00:01.000Z"), [], 60_000);
    expect(live.status).toBe("ring_taxis");
  });

  it("opens companies when every taxi in the ring has refused", () => {
    let live = startTaxiRing(job(), new Date("2026-08-26T16:00:00.000Z"), [], taxis, 60_000);
    live = declineOffer(live, "taxi-01")!;
    live = declineOffer(live, "taxi-02")!;
    expect(allPendingDeclined(live)).toBe(true);
    live = tickJob(live, new Date("2026-08-26T16:00:01.000Z"), [], 60_000);
    expect(live.status).toBe("ring_companies");
  });

  it("pauses the ring while the booker confirms a driver", () => {
    const t0 = new Date("2026-08-26T16:00:00.000Z");
    let live = startTaxiRing(job(), t0, [], taxis, 2_000);
    live = placeHold(live, "taxi-02", new Date("2026-08-26T16:00:01.000Z"), 60_000)!;
    expect(live.status).toBe("hold");
    expect(live.hold?.expiresAt).toBe("2026-08-26T16:01:01.000Z");
    expect(live.offers.find((offer) => offer.supplierId === "taxi-01")?.status).toBe(
      "pending",
    );
    expect(
      tickJob(live, new Date("2026-08-26T16:00:30.000Z"), [], 2_000).status,
    ).toBe("hold");
    expect(placeHold(live, "taxi-01", new Date("2026-08-26T16:00:02.000Z"))).toBeNull();
  });

  it("drops the request if the booker does not confirm in time", () => {
    const t0 = new Date("2026-08-26T16:00:00.000Z");
    let live = startTaxiRing(job(), t0, [], taxis, 2_000);
    live = placeHold(live, "taxi-02", new Date("2026-08-26T16:00:01.000Z"), 60_000)!;
    expect(
      tickJob(live, new Date("2026-08-26T16:01:01.000Z"), [], 2_000).status,
    ).toBe("cancelled");
  });

  it("assigns on booker confirm", () => {
    const t0 = new Date("2026-08-26T16:00:00.000Z");
    let live = startTaxiRing(job(), t0, [], taxis, 60_000);
    live = placeHold(live, "taxi-02", new Date("2026-08-26T16:00:10.000Z"))!;
    live = confirmHold(live, new Date("2026-08-26T16:00:12.000Z"))!;
    expect(live.status).toBe("assigned");
    expect(live.acceptedBy?.supplierId).toBe("taxi-02");
    expect(live.offers.find((offer) => offer.supplierId === "taxi-01")?.status).toBe(
      "taken",
    );
  });

  it("returns leftover ring time to the other drivers if the booker declines", () => {
    const t0 = new Date("2026-08-26T16:00:00.000Z");
    let live = startTaxiRing(job(), t0, [], taxis, 60_000);
    live = placeHold(live, "taxi-02", new Date("2026-08-26T16:00:10.000Z"))!;
    expect(live.hold?.ringRemainingMs).toBe(50_000);
    const t2 = new Date("2026-08-26T16:00:40.000Z");
    live = rejectHold(live, t2)!;
    expect(live.status).toBe("ring_taxis");
    expect(live.offers.find((offer) => offer.supplierId === "taxi-02")?.status).toBe(
      "declined",
    );
    expect(live.offers.find((offer) => offer.supplierId === "taxi-01")?.status).toBe(
      "pending",
    );
    expect(Date.parse(live.ringEndsAt) - t2.getTime()).toBe(50_000);
    expect(tickJob(live, new Date(t2.getTime() + 10_000), [], 60_000).status).toBe(
      "ring_taxis",
    );
    expect(tickJob(live, new Date(t2.getTime() + 50_000), [], 60_000).status).toBe(
      "ring_companies",
    );
  });

  it("reoffers 5 seconds after a refuse only if the ring is still open", () => {
    const t0 = new Date("2026-08-26T16:00:00.000Z");
    let live = startTaxiRing(job(), t0, [], taxis, 60_000);
    live = declineOffer(live, "taxi-01")!;
    live = scheduleLoopbackReoffer(live, t0, 5_000);
    expect(
      isReofferDue(live, new Date("2026-08-26T16:00:04.000Z")),
    ).toBe(false);
    expect(
      isReofferDue(live, new Date("2026-08-26T16:00:05.000Z")),
    ).toBe(true);
    live.ringEndsAt = "2026-08-26T16:00:03.000Z";
    expect(
      isReofferDue(live, new Date("2026-08-26T16:00:05.000Z")),
    ).toBe(false);
  });

  it("marks the job unfilled when companies time out", () => {
    const companies = startCompanyRing(
      job({ status: "ring_taxis", offers: [] }),
      new Date("2026-08-26T16:02:00.000Z"),
      [],
      [{ id: "prestige", name: "Prestige", phone: "+1", phoneLabel: "+1" }],
      2_000,
    );
    const done = tickJob(
      companies,
      new Date("2026-08-26T16:02:03.000Z"),
      [],
      2_000,
    );
    expect(done.status).toBe("unfilled");
  });

  it("puts pickup and dropoff on a taxi offer", () => {
    const text = taxiOfferText(job(), "taxi-01");
    expect(text).toContain("Villa confidentielle");
    expect(text).toContain("Eden Rock");
    expect(text).not.toContain("Destination exacte");
    expect(text).toContain("CAGAN Mathurin");
  });

  it("labels a booker job by trip and guest phone tail", () => {
    expect(jobLabel(job())).toBe("Villa confidentielle → Eden Rock · …0000");
  });

  it("reveals pickup, dropoff and phone on the driver recap after accept", () => {
    const accepted = acceptOffer(
      startTaxiRing(job(), new Date("2026-08-26T16:00:00.000Z"), [], taxis, 60_000),
      "taxi-02",
      new Date("2026-08-26T16:00:10.000Z"),
    )!;
    const text = assignedDriverText(accepted);
    expect(text).toContain("Récapitulatif");
    expect(text).toContain("Villa confidentielle");
    expect(text).toContain("Eden Rock");
    expect(text).toContain("+590690000000");
    expect(text).toContain("45");
  });

  it("lists upcoming assigned rides for that taxi and skips old ones", () => {
    const t0 = new Date("2026-08-26T16:00:00.000Z");
    const mine = acceptOffer(startTaxiRing(job(), t0, [], taxis, 60_000), "taxi-02", t0)!;
    const other = acceptOffer(
      startTaxiRing(
        job({
          id: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
          departAt: "2026-08-26T18:00:00.000Z",
        }),
        t0,
        [],
        taxis,
        60_000,
      ),
      "taxi-01",
      t0,
    )!;
    const past = acceptOffer(
      startTaxiRing(
        job({
          id: "cccccccc-bbbb-cccc-dddd-eeeeeeeeeeee",
          departAt: "2026-08-26T10:00:00.000Z",
        }),
        t0,
        [],
        taxis,
        60_000,
      ),
      "taxi-02",
      t0,
    )!;
    const upcoming = upcomingAssignedJobs(
      [mine, other, past],
      { kind: "taxi", supplierId: "taxi-02" },
      t0,
    );
    expect(upcoming.map((item) => item.id)).toEqual([mine.id]);
    expect(upcomingRidesText(upcoming)).toContain("Villa confidentielle → Eden Rock");
    expect(upcomingRidesText([])).toContain("Aucune course à venir");
  });

  it("lists the booker’s own searches and live trips, not rides they drive for someone else", () => {
    const t0 = new Date("2026-08-26T16:00:00.000Z");
    const searching = job({
      id: "11111111-bbbb-cccc-dddd-eeeeeeeeeeee",
      bookerChatId: "driver-chat",
      status: "ring_taxis",
    });
    const booked = acceptOffer(
      startTaxiRing(
        job({
          id: "22222222-bbbb-cccc-dddd-eeeeeeeeeeee",
          bookerChatId: "driver-chat",
        }),
        t0,
        [],
        taxis,
        60_000,
      ),
      "taxi-01",
      t0,
    )!;
    const drivingForGuest = acceptOffer(
      startTaxiRing(
        job({
          id: "33333333-bbbb-cccc-dddd-eeeeeeeeeeee",
          bookerChatId: "guest-chat",
        }),
        t0,
        [
          {
            channel: "telegram",
            chatId: "driver-chat",
            kind: "taxi",
            supplierId: "taxi-02",
            boundAt: t0.toISOString(),
            lastInboundAt: t0.toISOString(),
            onDuty: true,
          },
        ],
        taxis,
        60_000,
      ),
      "taxi-02",
      t0,
    )!;
    const stale = acceptOffer(
      startTaxiRing(
        job({
          id: "44444444-bbbb-cccc-dddd-eeeeeeeeeeee",
          bookerChatId: "driver-chat",
          departAt: "2026-08-26T10:00:00.000Z",
        }),
        t0,
        [],
        taxis,
        60_000,
      ),
      "taxi-01",
      t0,
    )!;
    const bookedList = upcomingBookerJobs(
      [searching, booked, drivingForGuest, stale],
      { chatId: "driver-chat", channel: "telegram" },
      t0,
    );
    expect(bookedList.map((item) => item.id)).toEqual([searching.id, booked.id]);
    expect(bookerRidesText(bookedList)).toContain("Recherche en cours");
    expect(bookerRidesText([])).toContain("Aucune réservation en cours");
    expect(bookerRideButton(booked).id).toMatch(/^b:/);
    expect(ridesChooserText(1, 2)).toContain("Au volant : 1");
    expect(ridesChooserText(1, 2)).toContain("Réservations : 2");
  });

  it("lists a ride accepted in this chat even without a staff binding", () => {
    const t0 = new Date("2026-08-26T16:00:00.000Z");
    const accepted = acceptOffer(
      startTaxiRing(
        job(),
        t0,
        [{
          channel: "telegram",
          chatId: "driver-chat",
          kind: "taxi",
          supplierId: "taxi-02",
          boundAt: t0.toISOString(),
          lastInboundAt: t0.toISOString(),
          onDuty: true,
        }],
        taxis,
        60_000,
      ),
      "taxi-02",
      t0,
    )!;
    expect(
      upcomingAssignedJobs([accepted], { chatId: "driver-chat" }, t0).map(
        (item) => item.id,
      ),
    ).toEqual([accepted.id]);
    expect(
      upcomingAssignedJobs([accepted], { chatId: "other-chat" }, t0),
    ).toEqual([]);
  });

  it("omits maps links from the driver recap", () => {
    const accepted = acceptOffer(
      startTaxiRing(job(), new Date("2026-08-26T16:00:00.000Z"), [], taxis, 60_000),
      "taxi-02",
      new Date("2026-08-26T16:00:10.000Z"),
    )!;
    const text = assignedDriverText(accepted);
    expect(text).not.toContain("google.com/maps");
    expect(text).not.toContain("Itinéraire");
  });

  it("advances assigned → en route → arrived → completed", () => {
    const t0 = new Date("2026-08-26T16:00:00.000Z");
    let live = acceptOffer(startTaxiRing(job(), t0, [], taxis, 60_000), "taxi-02", t0)!;
    live = markEnRoute(live)!;
    expect(live.status).toBe("en_route");
    live = markArrived(live)!;
    expect(live.status).toBe("arrived");
    live = markCompleted(live)!;
    expect(live.status).toBe("completed");
    expect(markEnRoute(live)).toBeNull();
  });

  it("cancels an assigned ride so the driver can still be notified", () => {
    const t0 = new Date("2026-08-26T16:00:00.000Z");
    const assigned = acceptOffer(
      startTaxiRing(job(), t0, [], taxis, 60_000),
      "taxi-02",
      t0,
    )!;
    const cancelled = cancelJob(assigned);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.acceptedBy?.supplierId).toBe("taxi-02");
    expect(
      cancelled.offers.find((offer) => offer.supplierId === "taxi-02")?.status,
    ).toBe("accepted");
  });

  it("releases an assigned ride back to the ring without that taxi", () => {
    const t0 = new Date("2026-08-26T16:00:00.000Z");
    const mine = acceptOffer(startTaxiRing(job(), t0, [], taxis, 60_000), "taxi-02", t0)!;
    const next = releaseAssignment(mine, t0, [], new Set(), taxis)!;
    expect(next.status).toBe("ring_taxis");
    expect(next.acceptedBy).toBeNull();
    expect(next.offers.map((offer) => offer.supplierId)).toEqual(["taxi-01"]);
  });

  it("does not ring a taxi already booked on an overlapping ride", () => {
    const t0 = new Date("2026-08-26T16:00:00.000Z");
    const held = acceptOffer(startTaxiRing(job(), t0, [], taxis, 60_000), "taxi-02", t0)!;
    const other = startTaxiRing(
      job({
        id: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
        departAt: "2026-08-26T16:10:00.000Z",
      }),
      t0,
      [],
      taxis,
      60_000,
      busySupplierIds([held], {
        id: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
        departAt: "2026-08-26T16:10:00.000Z",
        quote,
      }),
    );
    expect(other.offers.map((offer) => offer.supplierId)).toEqual(["taxi-01"]);
  });

  it("does not ring a taxi already en route, even for a later ride", () => {
    const t0 = new Date("2026-08-26T16:00:00.000Z");
    const ongoing = markEnRoute(
      acceptOffer(startTaxiRing(job(), t0, [], taxis, 60_000), "taxi-02", t0)!,
    )!;
    const later = startTaxiRing(
      job({
        id: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
        departAt: "2026-08-26T18:00:00.000Z",
      }),
      t0,
      [],
      taxis,
      60_000,
      busySupplierIds([ongoing], {
        id: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
        departAt: "2026-08-26T18:00:00.000Z",
        quote,
      }),
    );
    expect(later.offers.map((offer) => offer.supplierId)).toEqual(["taxi-01"]);
  });

  it("still rings a taxi who only has a non-overlapping reservation", () => {
    const t0 = new Date("2026-08-26T16:00:00.000Z");
    const booked = acceptOffer(
      startTaxiRing(
        job({ departAt: "2026-08-26T18:00:00.000Z" }),
        t0,
        [],
        taxis,
        60_000,
      ),
      "taxi-02",
      t0,
    )!;
    const nowRide = startTaxiRing(
      job({
        id: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
        departAt: t0.toISOString(),
      }),
      t0,
      [],
      taxis,
      60_000,
      busySupplierIds([booked], {
        id: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
        departAt: t0.toISOString(),
        quote,
      }),
    );
    expect(nowRide.offers.map((offer) => offer.supplierId)).toEqual([
      "taxi-01",
      "taxi-02",
    ]);
  });

  it("reminds only scheduled holds, not immediate accepts", () => {
    const t0 = new Date("2026-08-26T16:00:00.000Z");
    const soon = acceptOffer(startTaxiRing(job(), t0, [], taxis, 60_000), "taxi-02", t0)!;
    expect(reminderDue(soon, t0)).toBe(false);
    const later = acceptOffer(
      startTaxiRing(
        job({
          id: "bbbbbbbb-bbbb-cccc-dddd-eeeeeeeeeeee",
          departAt: "2026-08-26T18:00:00.000Z",
        }),
        t0,
        [],
        taxis,
        60_000,
      ),
      "taxi-02",
      t0,
    )!;
    expect(reminderDue(later, t0)).toBe(false);
    expect(
      reminderDue(later, new Date("2026-08-26T17:45:00.000Z")),
    ).toBe(true);
  });
});
