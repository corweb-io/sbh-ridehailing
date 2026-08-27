import { timingSafeEqual } from "node:crypto";
import { getAdminSecret } from "./config";
import { FARE_ZONE_LABELS } from "./fares";
import { listEvents, listRides, persistenceMode } from "./store";
import {
  buildDispatchStats,
  parseDispatchChannelFilter,
  parseDispatchRange,
  rangeStartIso,
} from "./dispatch/analytics";
import {
  dispatchPersistenceMode,
  earliestLiveDispatchEventAt,
  ensureJobEventBackfill,
  listDispatchEvents,
  listJobs,
  listSessions,
  listStaff,
} from "./dispatch/store";

export function isAdminAuthorized(request: Request) {
  const expected = getAdminSecret();
  const header = request.headers.get("x-admin-key");
  if (!expected || !header) return false;
  const providedBuffer = Buffer.from(header);
  const expectedBuffer = Buffer.from(expected);
  return (
    providedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(providedBuffer, expectedBuffer)
  );
}

function average(values: number[]) {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

export async function getAdminStats() {
  const [allRides, allEvents] = await Promise.all([listRides(), listEvents()]);
  const rides = allRides.filter(
    (ride) => ride.acquisition_source !== "__internal__",
  );
  const events = allEvents.filter((event) => event.meta?.internal !== true);
  const landingViews = events.filter((event) => event.name === "landing_view");
  const uniqueVisitors = new Set(landingViews.map((event) => event.session_id))
    .size;
  const rideStarts = rides.length;
  const quotes = rides.filter((ride) => ride.quoted_price != null);
  const confirmations = rides.filter((ride) =>
    ["requested", "confirmed", "searching", "no_driver"].includes(ride.status),
  );
  const contacts = rides.filter(
    (ride) =>
      Boolean(ride.contact) ||
      ride.events.some(
        (event) =>
          event.name === "whatsapp_clicked" || event.name === "stand_called",
      ),
  );
  const quoteToConfirm =
    quotes.length === 0 ? 0 : confirmations.length / quotes.length;

  const byOrigin = new Map<string, number>();
  const byDestination = new Map<string, number>();
  for (const ride of rides) {
    if (ride.pickup_address) {
      byOrigin.set(
        ride.pickup_address,
        (byOrigin.get(ride.pickup_address) ?? 0) + 1,
      );
    }
    if (ride.fare_zone_to) {
      const label = FARE_ZONE_LABELS[ride.fare_zone_to];
      byDestination.set(
        label,
        (byDestination.get(label) ?? 0) + 1,
      );
    }
  }

  return {
    persistence: persistenceMode(),
    visitors: uniqueVisitors,
    rideAttempts: rideStarts,
    quotes: quotes.length,
    confirmations: confirmations.length,
    contactSubmissions: contacts.length,
    conversionQuoteToConfirm: quoteToConfirm,
    averageFare: average(
      quotes
        .map((ride) => ride.quoted_price)
        .filter((value): value is number => value != null),
    ),
    averageDistanceKm: average(
      quotes
        .map((ride) => ride.distance_km)
        .filter((value): value is number => value != null),
    ),
    byOrigin: [...byOrigin.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([label, count]) => ({ label, count })),
    byDestination: [...byDestination.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 12)
      .map(([label, count]) => ({ label, count })),
    recent: rides.slice(0, 50),
  };
}

export async function getDispatchStats(rangeInput?: unknown, channelInput?: unknown) {
  const range = parseDispatchRange(rangeInput);
  const channel = parseDispatchChannelFilter(channelInput);
  await ensureJobEventBackfill();
  const since = rangeStartIso(range);
  const [events, jobs, sessions, staff, earliestLiveEventAt] = await Promise.all([
    listDispatchEvents({ channel, since }),
    listJobs(),
    listSessions(),
    listStaff(),
    earliestLiveDispatchEventAt(channel),
  ]);
  return buildDispatchStats({
    range,
    channel,
    events,
    jobs,
    sessions,
    staff,
    persistence: dispatchPersistenceMode(),
    earliestLiveEventAt,
  });
}
