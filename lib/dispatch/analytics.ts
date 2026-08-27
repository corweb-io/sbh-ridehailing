import { FARE_ZONE_LABELS, SBH_TIME_ZONE } from "../fares";
import { LICENSED_TAXIS } from "../licensed-taxis";
import { companyById } from "./companies";
import { isLiveTrip } from "./engine";
import {
  DISPATCH_EVENT_LABELS,
  DISPATCH_STATUS_LABELS,
  isBookingFlowStep,
  type DispatchEvent,
} from "./events";
import { isStaffOnDuty, isStaffSessionOpen } from "./staff-session";
import type {
  BookerSession,
  BookerStep,
  DispatchChannel,
  DispatchJob,
  DispatchStatus,
  StaffBinding,
  SupplierKind,
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

const STEP_LABELS: Partial<Record<BookerStep, string>> = {
  pickup: "Départ",
  pickup_text: "Départ (saisie)",
  dropoff: "Destination",
  dropoff_text: "Destination (saisie)",
  place_pick: "Lieu",
  zone: "Quartier",
  when: "Quand",
  when_day: "Jour",
  when_time: "Heure",
  pax: "Passagers",
  phone: "Téléphone",
  confirm: "Confirmation",
  dispatching: "Dispatch",
};

export type CountRow = { label: string; count: number; share: number };

export type FunnelRow = {
  label: string;
  count: number;
  conversion: number | null;
};

export type DispatchDayPoint = {
  day: string;
  inbound: number;
  outbound: number;
  jobs: number;
  assigned: number;
};

export type DispatchHourPoint = {
  hour: number;
  inbound: number;
  jobs: number;
};

export type DispatchRecentEvent = {
  id: string;
  at: string;
  channel: DispatchChannel;
  name: string;
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
  supplierLabel: string | null;
};

export type DispatchLiveStaff = {
  id: string;
  label: string;
  kind: SupplierKind;
  onDuty: boolean;
  sessionOpen: boolean;
};

export type DispatchKpis = {
  inbound: number;
  outbound: number;
  uniqueBookers: number;
  bookingsStarted: number;
  jobs: number;
  assigned: number;
  completed: number;
  unfilled: number;
  cancelled: number;
  fillRate: number;
  medianMinutesToAssign: number | null;
  offersAccepted: number;
  offersDeclined: number;
  acceptRate: number;
  revenue: number;
  averageFare: number;
};

export type DispatchKpiDelta = {
  inbound: number | null;
  uniqueBookers: number | null;
  jobs: number | null;
  fillRate: number | null;
  revenue: number | null;
  bookingsStarted: number | null;
};

export type DispatchStats = {
  persistence: string;
  range: DispatchRange;
  channel: DispatchChannelFilter;
  generatedAt: string;
  eventsSince: string | null;
  kpis: DispatchKpis;
  previous: DispatchKpis;
  delta: DispatchKpiDelta;
  series: DispatchDayPoint[];
  byHour: DispatchHourPoint[];
  funnel: FunnelRow[];
  byStatus: CountRow[];
  byLocale: CountRow[];
  byPickup: CountRow[];
  byDropoff: CountRow[];
  bySupplierKind: CountRow[];
  byStep: CountRow[];
  live: {
    openRings: number;
    liveTrips: number;
    onDutyStaff: number;
    bookingSessions: number;
    staff: DispatchLiveStaff[];
    attention: DispatchRecentJob[];
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

export function hourInSbh(iso: string) {
  const hour = new Intl.DateTimeFormat("en-GB", {
    timeZone: SBH_TIME_ZONE,
    hour: "2-digit",
    hourCycle: "h23",
  }).formatToParts(new Date(iso)).find((part) => part.type === "hour")?.value;
  const parsed = Number(hour);
  return Number.isFinite(parsed) ? parsed : 0;
}

export function supplierLabel(kind: SupplierKind, id: string) {
  if (kind === "company") return companyById(id)?.name ?? id;
  const taxi = LICENSED_TAXIS.find((item) => item.id === id);
  return taxi ? `Taxi ${taxi.number}` : id;
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
  const total = [...map.values()].reduce((sum, value) => sum + value, 0);
  return [...map.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([label, count]) => ({
      label,
      count,
      share: total === 0 ? 0 : count / total,
    }));
}

function zoneLabel(zone: string | null | undefined) {
  if (!zone) return null;
  return FARE_ZONE_LABELS[zone as keyof typeof FARE_ZONE_LABELS] ?? zone;
}

function eventDetail(event: DispatchEvent) {
  if (event.name === "booking_step" && event.meta.step) {
    return STEP_LABELS[event.meta.step] ?? event.meta.step;
  }
  if (event.name === "job_status" && event.meta.statusTo) {
    return DISPATCH_STATUS_LABELS[event.meta.statusTo];
  }
  if (event.meta.inboundKind) return event.meta.inboundKind;
  if (event.meta.outboundKind) return event.meta.outboundKind;
  if (event.meta.supplierId && event.meta.supplierKind) {
    return supplierLabel(event.meta.supplierKind, event.meta.supplierId);
  }
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

function emptyKpis(): DispatchKpis {
  return {
    inbound: 0,
    outbound: 0,
    uniqueBookers: 0,
    bookingsStarted: 0,
    jobs: 0,
    assigned: 0,
    completed: 0,
    unfilled: 0,
    cancelled: 0,
    fillRate: 0,
    medianMinutesToAssign: null,
    offersAccepted: 0,
    offersDeclined: 0,
    acceptRate: 0,
    revenue: 0,
    averageFare: 0,
  };
}

function kpisFor(jobs: DispatchJob[], events: DispatchEvent[]): DispatchKpis {
  const inbound = events.filter((event) => event.name === "inbound");
  const outbound = events.filter((event) => event.name === "outbound");
  const uniqueBookers = new Set(
    inbound
      .filter((event) => event.actorRole === "booker" && event.actorHash)
      .map((event) => event.actorHash as string),
  ).size;
  const assigned = jobs.filter((job) => FILLED_STATUSES.has(job.status)).length;
  const unfilled = jobs.filter((job) => job.status === "unfilled").length;
  const fillDenom = assigned + unfilled;
  let offersAccepted = 0;
  let offersDeclined = 0;
  for (const job of jobs) {
    for (const offer of job.offers) {
      if (offer.status === "accepted") offersAccepted += 1;
      if (offer.status === "declined") offersDeclined += 1;
    }
  }
  const offerDenom = offersAccepted + offersDeclined;
  const fares = jobs
    .filter((job) => FILLED_STATUSES.has(job.status))
    .map((job) => job.quote.fare)
    .filter((value): value is number => value != null && Number.isFinite(value));
  return {
    inbound: inbound.length,
    outbound: outbound.length,
    uniqueBookers,
    bookingsStarted: events.filter((event) => event.name === "booking_started")
      .length,
    jobs: jobs.length,
    assigned,
    completed: jobs.filter((job) => job.status === "completed").length,
    unfilled,
    cancelled: jobs.filter((job) => job.status === "cancelled").length,
    fillRate: fillDenom === 0 ? 0 : assigned / fillDenom,
    medianMinutesToAssign: median(
      jobs
        .map(minutesToAssign)
        .filter((value): value is number => value != null),
    ),
    offersAccepted,
    offersDeclined,
    acceptRate: offerDenom === 0 ? 0 : offersAccepted / offerDenom,
    revenue: fares.reduce((sum, value) => sum + value, 0),
    averageFare: fares.length === 0 ? 0 : fares.reduce((sum, value) => sum + value, 0) / fares.length,
  };
}

function relativeDelta(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return (current - previous) / previous;
}

function fillDenom(kpis: DispatchKpis) {
  return kpis.assigned + kpis.unfilled;
}

function fillRateDelta(current: DispatchKpis, previous: DispatchKpis) {
  if (fillDenom(previous) === 0) {
    return fillDenom(current) === 0 ? 0 : null;
  }
  return current.fillRate - previous.fillRate;
}

function toRecentJob(job: DispatchJob): DispatchRecentJob {
  return {
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
    supplierLabel: job.acceptedBy
      ? supplierLabel(job.acceptedBy.kind, job.acceptedBy.supplierId)
      : null,
  };
}

function isAttentionJob(job: DispatchJob) {
  return (
    job.status === "ring_taxis" ||
    job.status === "ring_companies" ||
    job.status === "hold" ||
    isLiveTrip(job.status)
  );
}

function attentionRank(status: DispatchStatus) {
  if (status === "ring_taxis" || status === "ring_companies") return 0;
  if (status === "hold") return 1;
  if (status === "en_route" || status === "arrived") return 2;
  return 3;
}

function compareLiveStaff(a: DispatchLiveStaff, b: DispatchLiveStaff) {
  const rank = (staff: DispatchLiveStaff) => {
    if (staff.onDuty && staff.sessionOpen) return 0;
    if (staff.onDuty) return 1;
    if (staff.sessionOpen) return 2;
    return 3;
  };
  return rank(a) - rank(b) || a.label.localeCompare(b.label, "fr");
}

function funnelRows(
  uniqueBookers: number,
  bookingsStarted: number,
  confirmSteps: number,
  jobs: number,
  assigned: number,
  completed: number,
): FunnelRow[] {
  const counts = [
    { label: "Conversations", count: uniqueBookers },
    { label: "Réservations commencées", count: bookingsStarted },
    { label: "Confirmation", count: confirmSteps },
    { label: "Courses", count: jobs },
    { label: "Assignées", count: assigned },
    { label: "Terminées", count: completed },
  ];
  return counts.map((row, index) => {
    const previous = index === 0 ? null : counts[index - 1].count;
    return {
      ...row,
      conversion:
        previous == null || previous === 0 ? null : row.count / previous,
    };
  });
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
  const previousUntil = Date.parse(sinceIso);
  const previousSince = new Date(
    previousUntil - RANGE_DAYS[input.range] * 24 * 60 * 60 * 1000,
  ).toISOString();
  const channel = input.channel;

  const scopedEvents = input.events.filter((event) =>
    matchesChannel(event.channel, channel),
  );
  const scopedJobs = input.jobs.filter((job) =>
    matchesChannel(job.channel, channel),
  );

  const events = scopedEvents.filter((event) =>
    inRange(event.createdAt, sinceIso, untilMs),
  );
  const jobs = scopedJobs.filter((job) =>
    inRange(job.createdAt, sinceIso, untilMs),
  );
  const previousEvents = scopedEvents.filter((event) =>
    inRange(event.createdAt, previousSince, previousUntil),
  );
  const previousJobs = scopedJobs.filter((job) =>
    inRange(job.createdAt, previousSince, previousUntil),
  );

  const kpis = kpisFor(jobs, events);
  const previous = kpisFor(previousJobs, previousEvents);
  const confirmSteps = events.filter(
    (event) => event.name === "booking_step" && event.meta.step === "confirm",
  ).length;

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

  const byHour: DispatchHourPoint[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    inbound: 0,
    jobs: 0,
  }));
  for (const event of events) {
    if (event.name === "inbound") byHour[hourInSbh(event.createdAt)].inbound += 1;
  }
  for (const job of jobs) {
    byHour[hourInSbh(job.createdAt)].jobs += 1;
  }

  const byStatus = new Map<string, number>();
  const byLocale = new Map<string, number>();
  const byPickup = new Map<string, number>();
  const byDropoff = new Map<string, number>();
  const bySupplierKind = new Map<string, number>();
  const byStep = new Map<string, number>();
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
  for (const event of events) {
    if (event.name !== "booking_step" || !event.meta.step) continue;
    const label = STEP_LABELS[event.meta.step];
    if (label) bump(byStep, label);
  }

  const liveStaff = input.staff.filter((staff) =>
    matchesChannel(staff.channel, channel),
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

  return {
    persistence: input.persistence,
    range: input.range,
    channel,
    generatedAt: now.toISOString(),
    eventsSince,
    kpis,
    previous,
    delta: {
      inbound: relativeDelta(kpis.inbound, previous.inbound),
      uniqueBookers: relativeDelta(kpis.uniqueBookers, previous.uniqueBookers),
      jobs: relativeDelta(kpis.jobs, previous.jobs),
      fillRate: fillRateDelta(kpis, previous),
      revenue: relativeDelta(kpis.revenue, previous.revenue),
      bookingsStarted: relativeDelta(
        kpis.bookingsStarted,
        previous.bookingsStarted,
      ),
    },
    series: dayKeys.map(
      (day) =>
        seriesMap.get(day) ?? {
          day,
          inbound: 0,
          outbound: 0,
          jobs: 0,
          assigned: 0,
        },
    ),
    byHour,
    funnel: funnelRows(
      kpis.uniqueBookers,
      kpis.bookingsStarted,
      confirmSteps,
      kpis.jobs,
      kpis.assigned,
      kpis.completed,
    ),
    byStatus: rowsFrom(byStatus),
    byLocale: rowsFrom(byLocale),
    byPickup: rowsFrom(byPickup),
    byDropoff: rowsFrom(byDropoff),
    bySupplierKind: rowsFrom(bySupplierKind),
    byStep: rowsFrom(byStep, 10),
    live: {
      openRings: scopedJobs.filter(
        (job) =>
          job.status === "ring_taxis" ||
          job.status === "ring_companies" ||
          job.status === "hold",
      ).length,
      liveTrips: scopedJobs.filter((job) => isLiveTrip(job.status)).length,
      onDutyStaff: liveStaff.filter(isStaffOnDuty).length,
      bookingSessions: input.sessions.filter(
        (session) =>
          matchesChannel(session.channel, channel) &&
          isBookingFlowStep(session.step),
      ).length,
      staff: liveStaff
        .map((staff) => ({
          id: staff.supplierId,
          label: supplierLabel(staff.kind, staff.supplierId),
          kind: staff.kind,
          onDuty: isStaffOnDuty(staff),
          sessionOpen: isStaffSessionOpen(staff, now),
        }))
        .sort(compareLiveStaff),
      attention: scopedJobs
        .filter(isAttentionJob)
        .sort((a, b) => attentionRank(a.status) - attentionRank(b.status)
          || b.createdAt.localeCompare(a.createdAt))
        .slice(0, 12)
        .map(toRecentJob),
    },
    recentEvents: [...events]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30)
      .map((event) => ({
        id: event.id,
        at: event.createdAt,
        channel: event.channel,
        name: event.name,
        label: DISPATCH_EVENT_LABELS[event.name],
        detail: eventDetail(event),
      })),
    recentJobs: [...jobs]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30)
      .map(toRecentJob),
  };
}
