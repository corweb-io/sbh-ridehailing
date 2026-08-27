import { describe, expect, it } from "vitest";
import { buildDispatchStats } from "../dispatch/analytics";
import {
  backfillEventsForJob,
  eventFromDraft,
  hashActor,
  inboundKind,
  jobLifecycleEvents,
  sanitizeMeta,
  sessionLifecycleEvents,
  type DispatchEvent,
} from "../dispatch/events";
import { sanitizeDispatchStore } from "../dispatch/store";
import type { BookerSession, DispatchJob, StaffBinding } from "../dispatch/types";
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
    channel: "whatsapp",
    bookerChatId: "+590690000000",
    status: "ring_taxis",
    ringStartedAt: "2026-08-20T16:00:00.000Z",
    ringEndsAt: "2026-08-20T16:02:00.000Z",
    pickup: {
      name: "Villa",
      address: "Secret",
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
    departAt: "2026-08-20T16:00:00.000Z",
    pax: 2,
    passengerPhone: "+590690000000",
    quote,
    offers: [],
    hold: null,
    reofferAt: null,
    acceptedBy: null,
    createdAt: "2026-08-20T16:00:00.000Z",
    ...overrides,
  };
}

function event(overrides: Partial<DispatchEvent>): DispatchEvent {
  return {
    id: crypto.randomUUID(),
    createdAt: "2026-08-20T16:00:00.000Z",
    channel: "whatsapp",
    name: "inbound",
    actorRole: "booker",
    actorHash: "abc123",
    jobId: null,
    meta: {},
    ...overrides,
  };
}

function session(overrides: Partial<BookerSession> = {}): BookerSession {
  return {
    channel: "whatsapp",
    chatId: "+590690000000",
    step: "idle",
    locale: "fr",
    afterLang: null,
    pickup: null,
    dropoff: null,
    placePickSide: null,
    placeQuery: null,
    placeCandidates: null,
    placesToken: null,
    zoneSide: null,
    departAt: null,
    departDay: null,
    pax: null,
    passengerPhone: null,
    jobId: null,
    updatedAt: "2026-08-20T16:00:00.000Z",
    ...overrides,
  };
}

describe("dispatch event redaction", () => {
  it("hashes chat ids without storing the phone", () => {
    const phone = "+590690000000";
    const hash = hashActor("whatsapp", phone);
    expect(hash).toHaveLength(16);
    expect(hash).not.toContain("590");
    expect(hash).not.toContain(phone);
    expect(hashActor("whatsapp", phone)).toBe(hash);
    expect(hashActor("telegram", phone)).not.toBe(hash);
  });

  it("drops phones, chat ids, and message text from meta", () => {
    const meta = sanitizeMeta({
      locale: "fr",
      step: "confirm",
      chatId: "+590690000000",
      text: "Je vais à Gustavia",
      phone: "+590690000000",
      passengerPhone: "+590690000000",
      lat: 17.9,
      fare: 45,
      pax: 3,
      supplierId: "taxi-12",
    });
    expect(meta).toEqual({
      locale: "fr",
      step: "confirm",
      fare: 45,
      pax: 3,
      supplierId: "taxi-12",
    });
    expect(JSON.stringify(meta)).not.toContain("590");
  });

  it("classifies inbound without reading message bodies", () => {
    expect(inboundKind({ channel: "whatsapp", chatId: "1", fromId: "1" })).toBe(
      "text",
    );
    expect(
      inboundKind({
        channel: "whatsapp",
        chatId: "1",
        fromId: "1",
        buttonId: "go",
      }),
    ).toBe("button");
    expect(
      inboundKind({
        channel: "whatsapp",
        chatId: "1",
        fromId: "1",
        location: { lat: 17.9, lng: -62.85 },
      }),
    ).toBe("location");
  });
});

describe("dispatch lifecycle events", () => {
  it("emits job_created and job_status on first save", () => {
    const created = jobLifecycleEvents(null, job());
    expect(created.map((item) => item.name)).toEqual([
      "job_created",
      "job_status",
    ]);
    expect(created[0]?.chatId).toBe("+590690000000");
    const stored = eventFromDraft(created[0]!);
    expect(stored.actorHash).not.toContain("590");
    expect(stored.meta.fareZoneFrom).toBe("gustavia");
  });

  it("emits accept and decline when offer rows change", () => {
    const previous = job({
      offers: [
        { kind: "taxi", supplierId: "taxi-1", chatId: "1", status: "pending" },
      ],
    });
    const next = job({
      status: "hold",
      offers: [
        { kind: "taxi", supplierId: "taxi-1", chatId: "1", status: "accepted" },
        { kind: "taxi", supplierId: "taxi-2", chatId: "2", status: "declined" },
      ],
    });
    const names = jobLifecycleEvents(previous, next).map((item) => item.name);
    expect(names).toContain("offer_accepted");
    expect(names).toContain("offer_declined");
    expect(names).toContain("job_status");
  });

  it("starts a booking when the session enters empty pickup", () => {
    const events = sessionLifecycleEvents(session({ step: "idle" }), session({
      step: "pickup",
    }));
    expect(events.map((item) => item.name)).toEqual([
      "booking_started",
      "booking_step",
    ]);
  });

  it("does not re-count an identical empty pickup save", () => {
    const events = sessionLifecycleEvents(
      session({ step: "pickup" }),
      session({ step: "pickup" }),
    );
    expect(events).toEqual([]);
  });
});

describe("dispatch analytics", () => {
  const now = new Date("2026-08-27T16:00:00.000Z");

  it("filters by channel, buckets days, and computes fill rate", () => {
    const filled = job({
      id: "11111111-1111-1111-1111-111111111111",
      status: "completed",
      acceptedBy: {
        kind: "taxi",
        supplierId: "taxi-1",
        at: "2026-08-20T16:08:00.000Z",
        companyRate: null,
      },
    });
    const missed = job({
      id: "22222222-2222-2222-2222-222222222222",
      status: "unfilled",
      createdAt: "2026-08-21T12:00:00.000Z",
    });
    const telegram = job({
      id: "33333333-3333-3333-3333-333333333333",
      channel: "telegram",
      status: "completed",
    });
    const ringing = job({
      id: "66666666-6666-6666-6666-666666666666",
      status: "ring_taxis",
      createdAt: "2026-08-27T15:00:00.000Z",
    });
    const stats = buildDispatchStats({
      now,
      range: "30d",
      channel: "whatsapp",
      persistence: "local-file",
      jobs: [filled, missed, telegram, ringing],
      sessions: [session({ step: "confirm" })],
      staff: [
        {
          channel: "whatsapp",
          chatId: "driver",
          kind: "taxi",
          supplierId: "taxi-01",
          boundAt: "2026-08-20T00:00:00.000Z",
          onDuty: true,
        } satisfies StaffBinding,
      ],
      events: [
        event({
          name: "inbound",
          actorHash: "booker-a",
          createdAt: "2026-08-20T16:01:00.000Z",
        }),
        event({
          name: "inbound",
          actorHash: "booker-a",
          createdAt: "2026-08-20T16:02:00.000Z",
        }),
        event({
          name: "outbound",
          createdAt: "2026-08-20T16:02:00.000Z",
        }),
        event({
          name: "booking_started",
          createdAt: "2026-08-20T16:03:00.000Z",
        }),
        event({
          name: "booking_step",
          createdAt: "2026-08-20T16:10:00.000Z",
          meta: { step: "confirm" },
        }),
        event({
          channel: "telegram",
          name: "inbound",
          actorHash: "tg-1",
          createdAt: "2026-08-20T16:01:00.000Z",
        }),
      ],
    });

    expect(stats.kpis.inbound).toBe(2);
    expect(stats.kpis.outbound).toBe(1);
    expect(stats.kpis.uniqueBookers).toBe(1);
    expect(stats.kpis.bookingsStarted).toBe(1);
    expect(stats.kpis.jobs).toBe(3);
    expect(stats.kpis.assigned).toBe(1);
    expect(stats.kpis.unfilled).toBe(1);
    expect(stats.kpis.fillRate).toBeCloseTo(0.5);
    expect(stats.kpis.medianMinutesToAssign).toBe(8);
    expect(stats.kpis.revenue).toBe(45);
    expect(stats.funnel.map((row) => row.count)).toEqual([1, 1, 1, 3, 1, 1]);
    expect(stats.funnel[4]?.conversion).toBeCloseTo(1 / 3);
    expect(stats.live.bookingSessions).toBe(1);
    expect(stats.live.onDutyStaff).toBe(1);
    expect(stats.live.staff[0]?.label).toMatch(/^Taxi /);
    expect(stats.live.attention[0]?.status).toBe("ring_taxis");
    expect(stats.byHour).toHaveLength(24);
    expect(stats.delta.jobs).toBeNull();
    expect(stats.delta.fillRate).toBeNull();
    const day = stats.series.find((point) => point.day === "2026-08-20");
    expect(day?.inbound).toBe(2);
    expect(day?.jobs).toBe(1);
    expect(day?.assigned).toBe(1);
    expect(JSON.stringify(stats)).not.toContain("+590");
    expect(JSON.stringify(stats.recentJobs)).not.toContain("Villa");
  });

  it("does not treat backfilled job events as the start of message tracking", () => {
    const created = backfillEventsForJob(job());
    const stats = buildDispatchStats({
      now,
      range: "30d",
      channel: "whatsapp",
      persistence: "local-file",
      jobs: [job()],
      sessions: [],
      staff: [],
      events: created.map((draft) => eventFromDraft(draft)),
      earliestLiveEventAt: null,
    });
    expect(stats.eventsSince).toBeNull();
    expect(stats.kpis.jobs).toBe(1);
  });

  it("compares the current window to the previous equal window", () => {
    const current = job({
      id: "44444444-4444-4444-4444-444444444444",
      status: "completed",
      createdAt: "2026-08-25T12:00:00.000Z",
      acceptedBy: {
        kind: "taxi",
        supplierId: "taxi-01",
        at: "2026-08-25T12:10:00.000Z",
        companyRate: null,
      },
    });
    const previous = job({
      id: "55555555-5555-5555-5555-555555555555",
      status: "unfilled",
      createdAt: "2026-08-15T12:00:00.000Z",
    });
    const stats = buildDispatchStats({
      now,
      range: "7d",
      channel: "whatsapp",
      persistence: "local-file",
      jobs: [current, previous],
      sessions: [],
      staff: [],
      events: [
        event({
          actorHash: "now",
          createdAt: "2026-08-25T12:00:00.000Z",
        }),
        event({
          actorHash: "then-a",
          createdAt: "2026-08-15T12:00:00.000Z",
        }),
        event({
          actorHash: "then-b",
          createdAt: "2026-08-15T13:00:00.000Z",
        }),
      ],
    });
    expect(stats.kpis.inbound).toBe(1);
    expect(stats.previous.inbound).toBe(2);
    expect(stats.delta.inbound).toBeCloseTo(-0.5);
    expect(stats.kpis.fillRate).toBe(1);
    expect(stats.previous.fillRate).toBe(0);
    expect(stats.delta.fillRate).toBe(1);
  });
});

describe("dispatch event retention", () => {
  it("drops events older than a year from the local store", () => {
    const now = Date.parse("2026-08-27T12:00:00.000Z");
    const sanitized = sanitizeDispatchStore(
      {
        jobs: [],
        sessions: [],
        staff: [],
        events: [
          event({ createdAt: "2026-08-20T12:00:00.000Z" }),
          event({ createdAt: "2025-01-01T12:00:00.000Z" }),
        ],
      },
      now,
    );
    expect(sanitized.events).toHaveLength(1);
    expect(sanitized.events[0].createdAt).toBe("2026-08-20T12:00:00.000Z");
  });
});
