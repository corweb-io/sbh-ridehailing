import { FARE_ZONE_LABELS, SBH_TIME_ZONE } from "../fares";
import { isLiveTrip } from "./engine";
import {
  DISPATCH_EVENT_LABELS,
  DISPATCH_STATUS_LABELS,
  isBookingFlowStep,
  type DispatchEvent,
} from "./events";
import { isStaffOnDuty } from "./staff-session";
import type {
  BookerSession,
  DispatchChannel,
  DispatchJob,
  DispatchStatus,
  StaffBinding,
} from "./types";

export const DISPATCH_RANGES = ["7d", "30d", "90d"] as const;
export type DispatchRange = (typeof DISPATCH_RANGES)[number];

export const DISPATCH_CHANNEL_FILTERS = [
  "whatsapp",
  "telegram",
  "all",
] as const;
export type DispatchChannelFilter = (typeof DISPATCH_CHANNEL_FILTERS)[number];

const RANGE_DAYS: Record<DispatchRange, number> = {
  "7d": 7,
  "30d": 30,
  "90d": 90,
};

const FILLED_STATUSES = new Set<DispatchStatus>([
  "assigned",
  "en_route",
  "arrived",
  "completed",
]);

export type CountRow = { label: string; count: number };

export type DispatchDayPoint = {
  day: string;
  inbound: number;
  outbound: number;
  jobs: number;
  assigned: number;
};

export type DispatchRecentEvent = {
  id: string;
  at: string;
  channel: DispatchChannel;
  label: string;
  detail: string;
};

export type DispatchRecentJob = {
  idPrefix: string;
  createdAt: string;
  channel: DispatchChannel;
  status: DispatchStatus;
  statusLabel: string;
  zones: string;
  fare: number | null;
  pax: number;
  supplierId: string | null;
};

export type DispatchStats = {
  persistence: string;
  range: DispatchRange;
  channel: DispatchChannelFilter;
  eventsSince: string | null;
  kpis: {
    inbound: number;
    outbound: number;
    uniqueBookers: number;
    bookingsStarted: number;
    jobs: number;
    assigned: number;
    completed: number;
    unfilled: number;
    fillRate: number;
    medianMinutesToAssign: number | null;
    offersAccepted: number;
    offersDeclined: number;
  };
  series: DispatchDayPoint[];
  funnel: CountRow[];
  byStatus: CountRow[];
  byLocale: CountRow[];
  byPickup: CountRow[];
  byDropoff: CountRow[];
  bySupplierKind: CountRow[];
  live: {
    openRings: number;
    liveTrips: number;
    onDutyStaff: number;
    bookingSessions: number;
  };
  recentEvents: DispatchRecentEvent[];
  recentJobs: DispatchRecentJob[];
};

export function parseDispatchRange(value: unknown): DispatchRange {
  return DISPATCH_RANGES.includes(value as DispatchRange)
    ? (value as DispatchRange)
    : "30d";
}

export function parseDispatchChannelFilter(
  value: unknown,
): DispatchChannelFilter {
  return DISPATCH_CHANNEL_FILTERS.includes(value as DispatchChannelFilter)
    ? (value as DispatchChannelFilter)
    : "whatsapp";
}

export function rangeStartIso(range: DispatchRange, now = new Date()) {
  const start = new Date(now.getTime() - RANGE_DAYS[range] * 24 * 60 * 60 * 1000);
  return start.toISOString();
}

export function dayKey(iso: string) {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: SBH_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date(iso));
}

function eachDayKeys(sinceIso: string, now: Date) {
  const keys: string[] = [];
  const cursor = new Date(`${dayKey(sinceIso)}T12:00:00.000Z`);
  const last = dayKey(now.toISOString());
  for (let i = 0; i < 120; i += 1) {
    const key = dayKey(cursor.toISOString());
    keys.push(key);
    if (key >= last) break;
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  if (!keys.includes(last)) keys.push(last);
  return keys;
}

function matchesChannel(
  channel: DispatchChannel,
  filter: DispatchChannelFilter,
) {
  return filter === "all" || channel === filter;
}

function inRange(iso: string, sinceIso: string, untilMs: number) {
  const at = Date.parse(iso);
  return Number.isFinite(at) && at >= Date.parse(sinceIso) && at <= untilMs;
}

function median(values: number[]) {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function bump(map: Map<string, number>, label: string, amount = 1) {
  map.set(label, (map.get(label) ?? 0) + amount);
}

function rowsFrom(map: Map<string, number>, limit = 12): CountRow[] {
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function zoneLabel(zone: string | null | undefined) {
  if (!zone) return null;
  return FARE_ZONE_LABELS[zone as keyof typeof FARE_ZONE_LABELS] ?? zone;
}

function eventDetail(event: DispatchEvent) {
  if (event.name === "booking_step" && event.meta.step) {
    return event.meta.step;
  }
  if (event.name === "job_status" && event.meta.statusTo) {
    return DISPATCH_STATUS_LABELS[event.meta.statusTo];
  }
  if (event.meta.inboundKind) return event.meta.inboundKind;
  if (event.meta.outboundKind) return event.meta.outboundKind;
  if (event.meta.supplierId) return event.meta.supplierId;
  return event.channel;
}

function minutesToAssign(job: DispatchJob) {
  if (!job.acceptedBy?.at) return null;
  const created = Date.parse(job.createdAt);
  const accepted = Date.parse(job.acceptedBy.at);
  if (!Number.isFinite(created) || !Number.isFinite(accepted)) return null;
  return Math.max(0, (accepted - created) / 60_000);
}

export function buildDispatchStats(input: {
  now?: Date;
  range: DispatchRange;
  channel: DispatchChannelFilter;
  events: DispatchEvent[];
  jobs: DispatchJob[];
  sessions: BookerSession[];
  staff: StaffBinding[];
  persistence: string;
  earliestLiveEventAt?: string | null;
}): DispatchStats {
  const now = input.now ?? new Date();
  const sinceIso = rangeStartIso(input.range, now);
  const untilMs = now.getTime();
  const channel = input.channel;

  const events = input.events.filter(
    (event) =>
      matchesChannel(event.channel, channel) &&
      inRange(event.createdAt, sinceIso, untilMs),
  );
  const jobs = input.jobs.filter(
    (job) =>
      matchesChannel(job.channel, channel) &&
      inRange(job.createdAt, sinceIso, untilMs),
  );

  const inbound = events.filter((event) => event.name === "inbound");
  const outbound = events.filter((event) => event.name === "outbound");
  const uniqueBookers = new Set(
    inbound
      .filter((event) => event.actorRole === "booker" && event.actorHash)
      .map((event) => event.actorHash as string),
  ).size;
  const bookingsStarted = events.filter(
    (event) => event.name === "booking_started",
  ).length;
  const confirmSteps = events.filter(
    (event) => event.name === "booking_step" && event.meta.step === "confirm",
  ).length;

  const assigned = jobs.filter((job) => FILLED_STATUSES.has(job.status)).length;
  const completed = jobs.filter((job) => job.status === "completed").length;
  const unfilled = jobs.filter((job) => job.status === "unfilled").length;
  const fillDenom = assigned + unfilled;
  const fillRate = fillDenom === 0 ? 0 : assigned / fillDenom;

  let offersAccepted = 0;
  let offersDeclined = 0;
  for (const job of jobs) {
    for (const offer of job.offers) {
      if (offer.status === "accepted") offersAccepted += 1;
      if (offer.status === "declined") offersDeclined += 1;
    }
  }

  const dayKeys = eachDayKeys(sinceIso, now);
  const seriesMap = new Map<string, DispatchDayPoint>(
    dayKeys.map((day) => [
      day,
      { day, inbound: 0, outbound: 0, jobs: 0, assigned: 0 },
    ]),
  );
  for (const event of events) {
    const point = seriesMap.get(dayKey(event.createdAt));
    if (!point) continue;
    if (event.name === "inbound") point.inbound += 1;
    if (event.name === "outbound") point.outbound += 1;
  }
  for (const job of jobs) {
    const created = seriesMap.get(dayKey(job.createdAt));
    if (created) created.jobs += 1;
    if (job.acceptedBy?.at) {
      const assignedPoint = seriesMap.get(dayKey(job.acceptedBy.at));
      if (assignedPoint) assignedPoint.assigned += 1;
    }
  }

  const byStatus = new Map<string, number>();
  const byLocale = new Map<string, number>();
  const byPickup = new Map<string, number>();
  const byDropoff = new Map<string, number>();
  const bySupplierKind = new Map<string, number>();
  for (const job of jobs) {
    bump(byStatus, DISPATCH_STATUS_LABELS[job.status]);
    bump(byLocale, job.bookerLocale === "en" ? "English" : "Français");
    const pickup = zoneLabel(job.quote.zoneFrom);
    const dropoff = zoneLabel(job.quote.zoneTo);
    if (pickup) bump(byPickup, pickup);
    if (dropoff) bump(byDropoff, dropoff);
    if (job.acceptedBy) {
      bump(
        bySupplierKind,
        job.acceptedBy.kind === "company" ? "Société" : "Taxi",
      );
    }
  }

  const liveJobs = input.jobs.filter((job) =>
    matchesChannel(job.channel, channel),
  );
  const liveSessions = input.sessions.filter(
    (session) =>
      matchesChannel(session.channel, channel) &&
      isBookingFlowStep(session.step),
  );
  const liveStaff = input.staff.filter(
    (staff) => matchesChannel(staff.channel, channel) && isStaffOnDuty(staff),
  );

  const trackedEvents = events.filter((event) => event.meta.backfill !== true);
  const eventsSince =
    input.earliestLiveEventAt !== undefined
      ? input.earliestLiveEventAt
      : trackedEvents.length === 0
        ? null
        : trackedEvents.reduce(
            (earliest, event) =>
              event.createdAt < earliest ? event.createdAt : earliest,
            trackedEvents[0].createdAt,
          );

  const recentEvents = [...events]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 40)
    .map((event) => ({
      id: event.id,
      at: event.createdAt,
      channel: event.channel,
      label: DISPATCH_EVENT_LABELS[event.name],
      detail: eventDetail(event),
    }));

  const recentJobs = [...jobs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 40)
    .map((job) => ({
      idPrefix: job.id.slice(0, 8),
      createdAt: job.createdAt,
      channel: job.channel,
      status: job.status,
      statusLabel: DISPATCH_STATUS_LABELS[job.status],
      zones: [zoneLabel(job.quote.zoneFrom), zoneLabel(job.quote.zoneTo)]
        .filter(Boolean)
        .join(" → "),
      fare: job.quote.fare,
      pax: job.pax,
      supplierId: job.acceptedBy?.supplierId ?? null,
    }));

  return {
    persistence: input.persistence,
    range: input.range,
    channel,
    eventsSince,
    kpis: {
      inbound: inbound.length,
      outbound: outbound.length,
      uniqueBookers,
      bookingsStarted,
      jobs: jobs.length,
      assigned,
      completed,
      unfilled,
      fillRate,
      medianMinutesToAssign: median(
        jobs
          .map(minutesToAssign)
          .filter((value): value is number => value != null),
      ),
      offersAccepted,
      offersDeclined,
    },
    series: dayKeys.map(
      (day) => seriesMap.get(day) ?? { day, inbound: 0, outbound: 0, jobs: 0, assigned: 0 },
    ),
    funnel: [
      { label: "Conversations", count: uniqueBookers },
      { label: "Réservations commencées", count: bookingsStarted },
      { label: "Confirmation", count: confirmSteps },
      { label: "Courses", count: jobs.length },
      { label: "Assignées", count: assigned },
      { label: "Terminées", count: completed },
    ],
    byStatus: rowsFrom(byStatus),
    byLocale: rowsFrom(byLocale),
    byPickup: rowsFrom(byPickup),
    byDropoff: rowsFrom(byDropoff),
    bySupplierKind: rowsFrom(bySupplierKind),
    live: {
      openRings: liveJobs.filter(
        (job) =>
          job.status === "ring_taxis" ||
          job.status === "ring_companies" ||
          job.status === "hold",
      ).length,
      liveTrips: liveJobs.filter((job) => isLiveTrip(job.status)).length,
      onDutyStaff: liveStaff.length,
      bookingSessions: liveSessions.length,
    },
    recentEvents,
    recentJobs,
  };
}
