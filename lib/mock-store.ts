import {
  fetchDriverLocations,
  GPS_POLL_MS,
  isFreshGps,
  type DriverLocationPing,
} from "./driver-gps";
import {
  bearingDegrees,
  mockRouteEstimate,
  pointFromPlace,
} from "./geo";
import {
  defaultTaxiLocation,
  LICENSED_TAXIS,
  type LicensedTaxiKind,
} from "./licensed-taxis";
import { buildOfficialQuote } from "./quote";
import {
  EMPTY_TRIP_REQUIREMENTS,
  GEOLOCATION_RETENTION_MS,
  OFFER_RESPONSE_MS,
  rankEligibleTaxis,
  REGULATORY_AUDIT_RETENTION_MS,
  type RefusalGround,
  type TripRefusal,
  type TripRequirements,
} from "./regulation";
import type { FareZoneId, LatLng, Place, QuoteResult } from "./types";

export const SEARCH_TIMEOUT_MS = OFFER_RESPONSE_MS;
export const STALE_TRIP_MS = 45 * 60 * 1000;
export const DISPATCH_LEAD_MS = 15 * 60 * 1000;
export const PASSENGER_KEY = "ride-passenger-id";
export const DRIVER_KEY = "ride-driver-session";
export const PASSENGER_CONTACT_KEY = "ride-passenger-contact";

export type TripSource = "passenger" | "concierge";
export type CancelReason = "user" | "timeout" | "driver" | "no_show";

const STORAGE_KEY = "ride-mock-v7";
const CHANNEL_NAME = "ride-mock-v7";

export type TripStatus =
  | "scheduled"
  | "requested"
  | "accepted"
  | "arrived"
  | "onboard"
  | "completed"
  | "cancelled";

export type MockDriver = {
  id: string;
  name: string;
  plate: string;
  ads: string;
  vehicle: string | null;
  kind: LicensedTaxiKind;
  phone: string;
  phoneLabel: string;
  location: LatLng;
  heading: number | null;
  accuracy: number | null;
  locationUpdatedAt: string | null;
  online: boolean;
  pmr: boolean | null;
  hybridElectric: boolean | null;
};

export type MockTrip = {
  id: string;
  passengerId: string;
  driverId: string | null;
  pickup: Place;
  destination: Place;
  quote: QuoteResult;
  status: TripStatus;
  source: TripSource;
  hotelId: string | null;
  passengerName: string | null;
  passengerPhone: string | null;
  guestName: string | null;
  guestPhone: string | null;
  guestRoom: string | null;
  guestCount: number;
  notes: string | null;
  declinedBy: string[];
  refusals: TripRefusal[];
  requirements: TripRequirements;
  offeredDriverId: string | null;
  offeredAt: string | null;
  cancelReason: CancelReason | null;
  createdAt: string;
  acceptedAt: string | null;
  arrivedAt: string | null;
  onboardAt: string | null;
  completedAt: string | null;
};

export type DriverTripView = Omit<
  MockTrip,
  "destination" | "quote" | "refusals"
> & {
  destinationZone: FareZoneId | null;
  quote: Omit<QuoteResult, "route">;
};

export type MockState = {
  drivers: MockDriver[];
  trips: MockTrip[];
};

export const MOCK_DRIVERS: MockDriver[] = LICENSED_TAXIS.map((taxi) => ({
  id: taxi.id,
  name: taxi.name,
  plate: taxi.plate,
  ads: taxi.ads,
  vehicle: taxi.vehicle,
  kind: taxi.kind,
  phone: taxi.phone,
  phoneLabel: taxi.phoneLabel,
  location: defaultTaxiLocation(),
  heading: null,
  accuracy: null,
  locationUpdatedAt: null,
  online: false,
  pmr: taxi.pmr,
  hybridElectric: taxi.hybridElectric,
}));

const listeners = new Set<() => void>();

let memory: MockState | null = null;
let channel: BroadcastChannel | null = null;

function seedState(): MockState {
  return {
    drivers: MOCK_DRIVERS.map((driver) => ({ ...driver })),
    trips: [],
  };
}

function normalizeTrip(raw: Partial<MockTrip>): MockTrip | null {
  if (!raw.id || !raw.pickup || !raw.destination || !raw.quote) return null;
  const status = raw.status ?? "requested";
  return {
    id: raw.id,
    passengerId: raw.passengerId ?? raw.id,
    driverId: raw.driverId ?? null,
    pickup: raw.pickup,
    destination: raw.destination,
    quote: raw.quote,
    status,
    source: raw.source ?? "passenger",
    hotelId: raw.hotelId ?? null,
    passengerName: raw.passengerName ?? null,
    passengerPhone: raw.passengerPhone ?? null,
    guestName: raw.guestName ?? null,
    guestPhone: raw.guestPhone ?? null,
    guestRoom: raw.guestRoom ?? null,
    guestCount: raw.guestCount ?? 1,
    notes: raw.notes ?? null,
    declinedBy: Array.isArray(raw.declinedBy) ? raw.declinedBy : [],
    refusals: Array.isArray(raw.refusals) ? raw.refusals : [],
    requirements: {
      pmr: raw.requirements?.pmr === true,
      hybridElectric: raw.requirements?.hybridElectric === true,
    },
    offeredDriverId: raw.offeredDriverId ?? null,
    offeredAt: raw.offeredAt ?? null,
    cancelReason: raw.cancelReason ?? null,
    createdAt: raw.createdAt ?? new Date().toISOString(),
    acceptedAt: raw.acceptedAt ?? null,
    arrivedAt: raw.arrivedAt ?? null,
    onboardAt: raw.onboardAt ?? null,
    completedAt: raw.completedAt ?? null,
  };
}

function isBrowser() {
  return typeof window !== "undefined";
}

function loadState(): MockState {
  if (!isBrowser()) return seedState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return seedState();
    const parsed = JSON.parse(raw) as Partial<MockState>;
    const drivers = MOCK_DRIVERS.map((seed) => {
      const saved = parsed.drivers?.find((driver) => driver.id === seed.id);
      if (!saved) return { ...seed };
      const location =
        saved.location &&
        typeof saved.location.lat === "number" &&
        typeof saved.location.lng === "number"
          ? saved.location
          : seed.location;
      return {
        ...seed,
        online: typeof saved.online === "boolean" ? saved.online : seed.online,
        location,
        heading: typeof saved.heading === "number" ? saved.heading : null,
        accuracy: typeof saved.accuracy === "number" ? saved.accuracy : null,
        locationUpdatedAt:
          typeof saved.locationUpdatedAt === "string"
            ? saved.locationUpdatedAt
            : null,
      };
    });
    const trips = Array.isArray(parsed.trips)
      ? parsed.trips
          .map((trip) => normalizeTrip(trip))
          .filter((trip): trip is MockTrip => trip != null)
          .filter((trip) => {
            const at = Date.parse(trip.completedAt ?? trip.createdAt);
            return (
              !Number.isFinite(at) ||
              Date.now() - at < REGULATORY_AUDIT_RETENTION_MS
            );
          })
          .map((trip) => {
            const at = Date.parse(trip.completedAt ?? trip.createdAt);
            if (
              !Number.isFinite(at) ||
              Date.now() - at < GEOLOCATION_RETENTION_MS
            ) {
              return trip;
            }
            return {
              ...trip,
              pickup: { ...trip.pickup, lat: null, lng: null },
              destination: { ...trip.destination, lat: null, lng: null },
              quote: { ...trip.quote, route: [] },
            };
          })
      : [];
    return { drivers, trips };
  } catch {
    return seedState();
  }
}

function persist(next: MockState) {
  const reconciled = reconcileOffers(next);
  memory = reconciled;
  if (isBrowser()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(reconciled));
    channel?.postMessage("sync");
    syncTripTimers(reconciled);
  }
  for (const listener of listeners) listener();
}

const scheduledTimers = new Set<string>();
let locationPollTimer: number | null = null;
let locationPollAbort: AbortController | null = null;

function pollDriverLocations() {
  if (!isBrowser() || document.visibilityState === "hidden") return;
  locationPollAbort?.abort();
  const controller = new AbortController();
  locationPollAbort = controller;
  void fetchDriverLocations(controller.signal)
    .then((locations) => {
      if (!controller.signal.aborted) applyDriverLocations(locations);
    })
    .catch(() => undefined);
}

function onLocationVisibility() {
  if (document.visibilityState === "visible") pollDriverLocations();
}

function startLocationPoll() {
  if (!isBrowser() || locationPollTimer !== null) return;
  pollDriverLocations();
  locationPollTimer = window.setInterval(pollDriverLocations, GPS_POLL_MS);
  document.addEventListener("visibilitychange", onLocationVisibility);
}

function stopLocationPoll() {
  if (locationPollTimer !== null) {
    window.clearInterval(locationPollTimer);
    locationPollTimer = null;
  }
  locationPollAbort?.abort();
  locationPollAbort = null;
  if (isBrowser()) {
    document.removeEventListener("visibilitychange", onLocationVisibility);
  }
}

export function isFutureDepart(departAt: string, now = Date.now()) {
  const at = Date.parse(departAt);
  return Number.isFinite(at) && at - now > DISPATCH_LEAD_MS;
}

function dispatchAtMs(departAt: string) {
  const at = Date.parse(departAt);
  return Number.isFinite(at) ? at - DISPATCH_LEAD_MS : NaN;
}

function expireStaleRequests(state: MockState): MockState {
  const now = Date.now();
  let changed = false;
  const trips = state.trips.map((trip) => {
    const created = Date.parse(trip.createdAt);
    const age = Number.isFinite(created) ? now - created : 0;
    if (trip.status === "scheduled" && !trip.driverId) {
      const due = dispatchAtMs(trip.quote.departAt);
      if (Number.isFinite(due) && now >= due) {
        changed = true;
        return { ...trip, status: "requested" as const };
      }
    }
    if (
      trip.status === "requested" &&
      !trip.offeredDriverId &&
      age >= SEARCH_TIMEOUT_MS
    ) {
      changed = true;
      return {
        ...trip,
        status: "cancelled" as const,
        cancelReason: "timeout" as const,
        completedAt: new Date(now).toISOString(),
      };
    }
    if (isBusyTrip(trip.status) && age >= STALE_TRIP_MS) {
      changed = true;
      return {
        ...trip,
        status: "cancelled" as const,
        cancelReason: "timeout" as const,
        completedAt: new Date(now).toISOString(),
      };
    }
    return trip;
  });
  return changed ? { ...state, trips } : state;
}

function reconcileDrivers(state: MockState): MockState {
  const busy = busyDriverIds(state);
  let changed = false;
  const drivers = state.drivers.map((driver) => {
    if (!busy.has(driver.id) || driver.online) return driver;
    changed = true;
    return { ...driver, online: true };
  });
  return changed ? { ...state, drivers } : state;
}

function hydrateLoadedState(state: MockState): MockState {
  const next = reconcileOffers(reconcileDrivers(expireStaleRequests(state)));
  if (next !== state && isBrowser()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

function timerKey(trip: MockTrip) {
  return `${trip.id}:${trip.status}:${trip.driverId ?? ""}:${trip.offeredDriverId ?? ""}:${trip.offeredAt ?? ""}`;
}

function scheduleTripTimers(trip: MockTrip) {
  if (!isBrowser()) return;
  const key = timerKey(trip);
  if (scheduledTimers.has(key)) return;
  const now = Date.now();
  if (trip.status === "scheduled" && !trip.driverId) {
    const due = dispatchAtMs(trip.quote.departAt);
    if (!Number.isFinite(due)) return;
    scheduledTimers.add(key);
    window.setTimeout(
      () => {
        scheduledTimers.delete(key);
        promoteScheduled(trip.id);
      },
      Math.max(0, due - now),
    );
    return;
  }
  if (trip.status !== "requested") return;
  scheduledTimers.add(key);
  const startedAt = Date.parse(trip.offeredAt ?? trip.createdAt);
  const age = now - startedAt;
  if (!Number.isFinite(age)) return;
  window.setTimeout(() => {
    scheduledTimers.delete(key);
    if (trip.offeredDriverId) advanceOffer(trip.id);
    else expireRequest(trip.id);
  }, Math.max(0, SEARCH_TIMEOUT_MS - age));
}

function syncTripTimers(state: MockState) {
  if (!isBrowser()) return;
  for (const trip of state.trips) scheduleTripTimers(trip);
}

function mutate(updater: (state: MockState) => MockState) {
  persist(updater(structuredClone(getMockState())));
}

function connectChannel() {
  if (!isBrowser() || channel) return;
  try {
    channel = new BroadcastChannel(CHANNEL_NAME);
    channel.onmessage = () => {
      memory = hydrateLoadedState(loadState());
      syncTripTimers(memory);
      for (const listener of listeners) listener();
    };
  } catch {
    channel = null;
  }
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY) return;
    memory = hydrateLoadedState(loadState());
    syncTripTimers(memory);
    for (const listener of listeners) listener();
  });
}

export function getMockState(): MockState {
  if (!memory) {
    memory = hydrateLoadedState(loadState());
    if (isBrowser()) syncTripTimers(memory);
  }
  return memory;
}

export function subscribeMockStore(listener: () => void) {
  connectChannel();
  startLocationPoll();
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0) stopLocationPoll();
  };
}

export function getPassengerId() {
  if (!isBrowser()) return "ssr";
  const existing = window.sessionStorage.getItem(PASSENGER_KEY);
  if (existing) return existing;
  const id = crypto.randomUUID();
  window.sessionStorage.setItem(PASSENGER_KEY, id);
  return id;
}

export function getSelectedDriverId() {
  if (!isBrowser()) return null;
  return window.localStorage.getItem(DRIVER_KEY);
}

export function setSelectedDriverId(id: string | null) {
  if (!isBrowser()) return;
  if (id) window.localStorage.setItem(DRIVER_KEY, id);
  else window.localStorage.removeItem(DRIVER_KEY);
}

export function getSavedPassengerContact() {
  if (!isBrowser()) return { name: "", phone: "" };
  try {
    const raw = window.localStorage.getItem(PASSENGER_CONTACT_KEY);
    if (!raw) return { name: "", phone: "" };
    const parsed = JSON.parse(raw) as { name?: string; phone?: string };
    return {
      name: typeof parsed.name === "string" ? parsed.name : "",
      phone: typeof parsed.phone === "string" ? parsed.phone : "",
    };
  } catch {
    return { name: "", phone: "" };
  }
}

export function savePassengerContact(input: { name: string; phone: string }) {
  if (!isBrowser()) return;
  window.localStorage.setItem(PASSENGER_CONTACT_KEY, JSON.stringify(input));
}

export function isBusyTrip(status: TripStatus) {
  return status === "accepted" || status === "arrived" || status === "onboard";
}

export function isActiveTrip(status: TripStatus) {
  return status === "scheduled" || status === "requested" || isBusyTrip(status);
}

function busyDriverIds(state: MockState) {
  return new Set(
    state.trips
      .filter((trip) => trip.driverId && isBusyTrip(trip.status))
      .map((trip) => trip.driverId),
  );
}

function eligibleDriversForTrip(state: MockState, trip: MockTrip) {
  const pickup = pointFromPlace(trip.pickup);
  if (!pickup) return [];
  const busy = busyDriverIds(state);
  return rankEligibleTaxis(
    state.drivers.map((driver) => ({
      ...driver,
      busy: busy.has(driver.id),
    })),
    pickup,
    trip.requirements,
    trip.declinedBy,
  ).map((candidate) => ({
    driver: candidate,
    distanceKm: candidate.distanceKm,
  }));
}

function activeOfferIsFresh(trip: MockTrip, now = Date.now()) {
  if (!trip.offeredDriverId || !trip.offeredAt) return false;
  const offeredAt = Date.parse(trip.offeredAt);
  return Number.isFinite(offeredAt) && now - offeredAt < OFFER_RESPONSE_MS;
}

function assignNextOffer(state: MockState, trip: MockTrip, now = Date.now()) {
  if (activeOfferIsFresh(trip, now)) return trip;
  const timedOutDriver = trip.offeredDriverId;
  const declinedBy =
    timedOutDriver && !trip.declinedBy.includes(timedOutDriver)
      ? [...trip.declinedBy, timedOutDriver]
      : trip.declinedBy;
  const prepared = {
    ...trip,
    declinedBy,
    offeredDriverId: null,
    offeredAt: null,
  };
  const next = eligibleDriversForTrip(state, prepared)[0]?.driver ?? null;
  if (!next) return prepared;
  return {
    ...prepared,
    offeredDriverId: next.id,
    offeredAt: new Date(now).toISOString(),
  };
}

function reconcileOffers(state: MockState, now = Date.now()): MockState {
  let changed = false;
  const trips = state.trips.map((trip) => {
    if (
      (trip.status !== "requested" && trip.status !== "scheduled") ||
      trip.driverId
    ) {
      return trip;
    }
    const next = assignNextOffer(state, trip, now);
    if (
      next.offeredDriverId !== trip.offeredDriverId ||
      next.offeredAt !== trip.offeredAt ||
      next.declinedBy.length !== trip.declinedBy.length
    ) {
      changed = true;
    }
    return next;
  });
  return changed ? { ...state, trips } : state;
}

export function driverTripView(trip: MockTrip): DriverTripView {
  const { destination: _destination, refusals: _refusals, ...safe } = trip;
  const { route: _route, ...quote } = trip.quote;
  void _destination;
  void _refusals;
  void _route;
  return {
    ...safe,
    destinationZone: trip.quote.zoneTo,
    quote,
  };
}

export function passengerTrip(
  state: MockState,
  passengerId = getPassengerId(),
) {
  return (
    state.trips.find(
      (trip) => trip.passengerId === passengerId && isActiveTrip(trip.status),
    ) ?? null
  );
}

export function incomingTrips(state: MockState, driverId?: string) {
  return state.trips
    .filter((trip) => {
      if (trip.status !== "requested") return false;
      if (!driverId || trip.offeredDriverId !== driverId) return false;
      return true;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(driverTripView);
}

export function scheduledInbox(state: MockState, driverId?: string) {
  return state.trips
    .filter((trip) => {
      if (trip.status !== "scheduled") return false;
      if (trip.driverId && trip.driverId !== driverId) return false;
      if (!trip.driverId && (!driverId || trip.offeredDriverId !== driverId)) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.quote.departAt.localeCompare(b.quote.departAt))
    .map(driverTripView);
}

export function hotelTrips(state: MockState, hotelId: string) {
  return state.trips
    .filter((trip) => trip.hotelId === hotelId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function tripStatusLabel(
  trip: Pick<MockTrip, "status" | "driverId">,
) {
  if (trip.status === "scheduled") {
    return trip.driverId ? "Réservée" : "Planifiée";
  }
  if (trip.status === "requested") return "Recherche";
  if (trip.status === "accepted") return "En route";
  if (trip.status === "arrived") return "Arrivé";
  if (trip.status === "onboard") return "En course";
  if (trip.status === "completed") return "Terminée";
  return "Annulée";
}

export function tripClientLabel(
  trip: Pick<
    MockTrip,
    "guestName" | "guestRoom" | "passengerName"
  >,
) {
  if (trip.guestName && trip.guestRoom) {
    return `${trip.guestName} · ${trip.guestRoom}`;
  }
  if (trip.guestName) return trip.guestName;
  if (trip.passengerName) return trip.passengerName;
  return "Passager";
}

export function tripPhone(
  trip: Pick<MockTrip, "guestPhone" | "passengerPhone">,
) {
  return trip.guestPhone || trip.passengerPhone;
}

function rawDriverTrip(state: MockState, driverId: string) {
  return (
    state.trips.find(
      (trip) => trip.driverId === driverId && isBusyTrip(trip.status),
    ) ?? null
  );
}

export function driverTrip(state: MockState, driverId: string) {
  const trip = rawDriverTrip(state, driverId);
  return trip ? driverTripView(trip) : null;
}

export function driverTrips(state: MockState, driverId: string) {
  return state.trips
    .filter((trip) => trip.driverId === driverId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .map(driverTripView);
}

export function selectedDriver(state: MockState, driverId?: string | null) {
  const id = driverId === undefined ? getSelectedDriverId() : driverId;
  if (!id) return null;
  return state.drivers.find((driver) => driver.id === id) ?? null;
}

export function hasOnlineDriver(state: MockState) {
  return state.drivers.some(
    (driver) => driver.online && isFreshGps(driver.locationUpdatedAt),
  );
}

export function onlineDriverCount(state: MockState) {
  return state.drivers.filter(
    (driver) => driver.online && isFreshGps(driver.locationUpdatedAt),
  ).length;
}

export function searchRemainingMs(trip: MockTrip, now = Date.now()) {
  if (trip.status !== "requested") return null;
  const created = Date.parse(trip.offeredAt ?? trip.createdAt);
  if (!Number.isFinite(created)) return null;
  return Math.max(0, SEARCH_TIMEOUT_MS - (now - created));
}

export function dispatchRemainingMs(trip: MockTrip, now = Date.now()) {
  if (trip.status !== "scheduled" || trip.driverId) return null;
  const due = dispatchAtMs(trip.quote.departAt);
  if (!Number.isFinite(due)) return null;
  return Math.max(0, due - now);
}

export function driverById(state: MockState, id: string | null) {
  if (!id) return null;
  return state.drivers.find((driver) => driver.id === id) ?? null;
}

export function taxiPositionForTrip(
  trip: MockTrip,
  driver: MockDriver | null,
): (LatLng & { heading: number | null }) | null {
  if (!driver) return null;
  const pickup = pointFromPlace(trip.pickup);
  const destination = pointFromPlace(trip.destination);
  const heading =
    driver.heading ??
    (trip.status === "onboard"
      ? pickup && destination
        ? bearingDegrees(pickup, destination)
        : null
      : pickup
        ? bearingDegrees(driver.location, pickup)
        : null);
  return { ...driver.location, heading };
}

export function pickupEtaMinutes(trip: MockTrip, driver: MockDriver | null) {
  if (!driver || trip.status !== "accepted") return null;
  const pickup = pointFromPlace(trip.pickup);
  if (!pickup) return null;
  return Math.max(
    1,
    Math.round(mockRouteEstimate(driver.location, pickup).durationMinutes),
  );
}

function samePing(driver: MockDriver, ping: DriverLocationPing) {
  return (
    driver.locationUpdatedAt === ping.updatedAt &&
    Math.abs(driver.location.lat - ping.lat) < 1e-7 &&
    Math.abs(driver.location.lng - ping.lng) < 1e-7
  );
}

export function setDriverLocation(ping: DriverLocationPing) {
  const state = getMockState();
  const current = state.drivers.find((driver) => driver.id === ping.driverId);
  if (!current || samePing(current, ping)) return;
  if (
    current.locationUpdatedAt &&
    ping.updatedAt < current.locationUpdatedAt
  ) {
    return;
  }
  mutate((next) => ({
    ...next,
    drivers: next.drivers.map((driver) =>
      driver.id === ping.driverId
        ? {
            ...driver,
            location: { lat: ping.lat, lng: ping.lng },
            heading: ping.heading,
            accuracy: ping.accuracy,
            locationUpdatedAt: ping.updatedAt,
          }
        : driver,
    ),
  }));
}

export function applyDriverLocations(locations: DriverLocationPing[]) {
  if (locations.length === 0) return;
  const byId = new Map(locations.map((ping) => [ping.driverId, ping]));
  const state = getMockState();
  let changed = false;
  const drivers = state.drivers.map((driver) => {
    const ping = byId.get(driver.id);
    if (!ping || samePing(driver, ping)) return driver;
    if (
      driver.locationUpdatedAt &&
      ping.updatedAt <= driver.locationUpdatedAt
    ) {
      return driver;
    }
    changed = true;
    return {
      ...driver,
      location: { lat: ping.lat, lng: ping.lng },
      heading: ping.heading,
      accuracy: ping.accuracy,
      locationUpdatedAt: ping.updatedAt,
    };
  });
  if (!changed) return;
  persist({ ...state, drivers });
}

export function setDriverOnline(driverId: string, online: boolean) {
  const state = getMockState();
  if (!online && rawDriverTrip(state, driverId)) return;
  mutate((next) => ({
    ...next,
    drivers: next.drivers.map((driver) =>
      driver.id === driverId ? { ...driver, online } : driver,
    ),
  }));
}

export function requestTrip(input: {
  pickup: Place;
  destination: Place;
  quote: QuoteResult;
  passengerId?: string;
  source?: TripSource;
  hotelId?: string | null;
  passengerName?: string | null;
  passengerPhone?: string | null;
  guestName?: string | null;
  guestPhone?: string | null;
  guestRoom?: string | null;
  guestCount?: number;
  notes?: string | null;
  requirements?: TripRequirements;
}) {
  const source = input.source ?? "passenger";
  const passengerId =
    input.passengerId ??
    (source === "concierge" ? crypto.randomUUID() : getPassengerId());
  const scheduled = isFutureDepart(input.quote.departAt);
  const trip: MockTrip = {
    id: crypto.randomUUID(),
    passengerId,
    driverId: null,
    pickup: input.pickup,
    destination: input.destination,
    quote: input.quote,
    status: scheduled ? "scheduled" : "requested",
    source,
    hotelId: input.hotelId ?? null,
    passengerName: input.passengerName?.trim() || null,
    passengerPhone: input.passengerPhone?.trim() || null,
    guestName: input.guestName?.trim() || null,
    guestPhone: input.guestPhone?.trim() || null,
    guestRoom: input.guestRoom?.trim() || null,
    guestCount: input.guestCount ?? 1,
    notes: input.notes?.trim() || null,
    declinedBy: [],
    refusals: [],
    requirements: input.requirements ?? { ...EMPTY_TRIP_REQUIREMENTS },
    offeredDriverId: null,
    offeredAt: null,
    cancelReason: null,
    createdAt: new Date().toISOString(),
    acceptedAt: null,
    arrivedAt: null,
    onboardAt: null,
    completedAt: null,
  };

  mutate((state) => ({
    ...state,
    trips: [
      ...state.trips.filter((existing) => {
        if (source === "concierge") return true;
        return (
          existing.passengerId !== passengerId || !isActiveTrip(existing.status)
        );
      }),
      trip,
    ],
  }));

  return trip;
}

export function tripNeedsZoneAssignment(trip: MockTrip) {
  return (
    (trip.pickup.source === "custom" && !trip.pickup.fareZone) ||
    (trip.destination.source === "custom" && !trip.destination.fareZone)
  );
}

export function assignTripFareZone(
  tripId: string,
  side: "pickup" | "destination",
  zone: FareZoneId,
) {
  mutate((state) => ({
    ...state,
    trips: state.trips.map((trip) => {
      if (
        trip.id !== tripId ||
        (trip.status !== "requested" && trip.status !== "scheduled")
      ) {
        return trip;
      }
      const location = trip[side];
      if (location.source !== "custom") return trip;
      const nextLocation = { ...location, fareZone: zone };
      const pickup = side === "pickup" ? nextLocation : trip.pickup;
      const destination =
        side === "destination" ? nextLocation : trip.destination;
      return {
        ...trip,
        pickup,
        destination,
        quote: buildOfficialQuote(
          pickup,
          destination,
          new Date(trip.quote.departAt),
        ),
      };
    }),
  }));
}

export function acceptTrip(tripId: string, driverId: string) {
  const state = getMockState();
  const requested = state.trips.find((trip) => trip.id === tripId);
  if (!requested || tripNeedsZoneAssignment(requested)) return;
  if (requested.status !== "requested" && requested.status !== "scheduled") {
    return;
  }
  if (requested.status === "requested" && rawDriverTrip(state, driverId)) return;
  if (requested.offeredDriverId !== driverId) return;
  if (requested.driverId && requested.driverId !== driverId) return;
  const now = new Date().toISOString();
  const nextStatus: TripStatus =
    requested.status === "scheduled" ? "scheduled" : "accepted";
  mutate((next) => ({
    ...next,
    drivers: next.drivers.map((driver) =>
      driver.id === driverId ? { ...driver, online: true } : driver,
    ),
    trips: next.trips.map((trip) =>
      trip.id === tripId &&
      (trip.status === "requested" || trip.status === "scheduled")
        ? {
            ...trip,
            driverId,
            status: nextStatus,
            acceptedAt: trip.acceptedAt ?? now,
            offeredDriverId: null,
            offeredAt: null,
          }
        : trip,
    ),
  }));
}

export function startTowardClient(tripId: string) {
  const state = getMockState();
  const trip = state.trips.find((item) => item.id === tripId);
  if (!trip?.driverId || rawDriverTrip(state, trip.driverId)) return;
  const now = new Date().toISOString();
  mutate((next) => ({
    ...next,
    trips: next.trips.map((item) =>
      item.id === tripId && item.status === "scheduled" && item.driverId
        ? { ...item, status: "accepted", acceptedAt: item.acceptedAt ?? now }
        : item,
    ),
  }));
}

export function refuseTrip(
  tripId: string,
  driverId: string,
  ground: RefusalGround,
) {
  mutate((state) => {
    const now = new Date().toISOString();
    const trips = state.trips.map((trip) => {
      if (
        trip.id !== tripId ||
        (trip.status !== "requested" && trip.status !== "scheduled")
      ) {
        return trip;
      }
      if (
        (trip.driverId && trip.driverId !== driverId) ||
        (!trip.driverId && trip.offeredDriverId !== driverId)
      ) {
        return trip;
      }
      const declinedBy = trip.declinedBy.includes(driverId)
        ? trip.declinedBy
        : [...trip.declinedBy, driverId];
      const refusal: TripRefusal = {
        driverId,
        ground,
        offeredAt: trip.offeredAt ?? now,
        refusedAt: now,
        reportedAt: now,
      };
      return {
        ...trip,
        driverId: trip.driverId === driverId ? null : trip.driverId,
        acceptedAt: trip.driverId === driverId ? null : trip.acceptedAt,
        declinedBy,
        refusals: [...trip.refusals, refusal],
        offeredDriverId: null,
        offeredAt: null,
      };
    });
    return { ...state, trips };
  });
}

export function advanceOffer(tripId: string) {
  mutate((state) => ({
    ...state,
    trips: state.trips.map((trip) => {
      if (
        trip.id !== tripId ||
        (trip.status !== "requested" && trip.status !== "scheduled") ||
        trip.driverId
      ) {
        return trip;
      }
      const declinedBy =
        trip.offeredDriverId &&
        !trip.declinedBy.includes(trip.offeredDriverId)
          ? [...trip.declinedBy, trip.offeredDriverId]
          : trip.declinedBy;
      return {
        ...trip,
        declinedBy,
        offeredDriverId: null,
        offeredAt: null,
      };
    }),
  }));
}

export function promoteScheduled(tripId: string) {
  mutate((next) => ({
    ...next,
    trips: next.trips.map((item) =>
      item.id === tripId && item.status === "scheduled" && !item.driverId
        ? { ...item, status: "requested", createdAt: new Date().toISOString() }
        : item,
    ),
  }));
}

export function expireRequest(tripId: string) {
  const state = getMockState();
  const trip = state.trips.find((item) => item.id === tripId);
  if (!trip || trip.status !== "requested") return;
  const now = new Date().toISOString();
  mutate((next) => ({
    ...next,
    trips: next.trips.map((item) =>
      item.id === tripId && item.status === "requested"
        ? {
            ...item,
            status: "cancelled",
            cancelReason: "timeout",
            completedAt: now,
          }
        : item,
    ),
  }));
}

export function markArrived(tripId: string) {
  const now = new Date().toISOString();
  mutate((state) => ({
    ...state,
    trips: state.trips.map((trip) =>
      trip.id === tripId && trip.status === "accepted"
        ? { ...trip, status: "arrived", arrivedAt: now }
        : trip,
    ),
  }));
}

export function startTrip(tripId: string) {
  const now = new Date().toISOString();
  mutate((state) => ({
    ...state,
    trips: state.trips.map((trip) =>
      trip.id === tripId &&
      (trip.status === "arrived" || trip.status === "accepted")
        ? { ...trip, status: "onboard", onboardAt: now }
        : trip,
    ),
  }));
}

export function completeTrip(tripId: string) {
  const now = new Date().toISOString();
  mutate((state) => ({
    ...state,
    trips: state.trips.map((trip) =>
      trip.id === tripId && isBusyTrip(trip.status)
        ? { ...trip, status: "completed", completedAt: now }
        : trip,
    ),
  }));
}

export function markNoShow(tripId: string) {
  const now = new Date().toISOString();
  mutate((state) => ({
    ...state,
    trips: state.trips.map((trip) =>
      trip.id === tripId && trip.status === "arrived"
        ? {
            ...trip,
            status: "cancelled",
            cancelReason: "no_show",
            completedAt: now,
          }
        : trip,
    ),
  }));
}

export function releaseTrip(tripId: string, driverId: string) {
  const now = new Date().toISOString();
  mutate((state) => ({
    ...state,
    trips: state.trips.map((trip) => {
      if (trip.id !== tripId || trip.driverId !== driverId) return trip;
      if (trip.status === "scheduled") {
        return {
          ...trip,
          driverId: null,
          acceptedAt: null,
          declinedBy: trip.declinedBy.includes(driverId)
            ? trip.declinedBy
            : [...trip.declinedBy, driverId],
        };
      }
      if (trip.status === "accepted") {
        return {
          ...trip,
          driverId: null,
          status: "requested",
          acceptedAt: null,
          createdAt: now,
          declinedBy: trip.declinedBy.includes(driverId)
            ? trip.declinedBy
            : [...trip.declinedBy, driverId],
        };
      }
      return trip;
    }),
  }));
}

export function cancelTrip(tripId: string, reason: CancelReason = "user") {
  const now = new Date().toISOString();
  mutate((state) => ({
    ...state,
    trips: state.trips.map((trip) =>
      trip.id === tripId && isActiveTrip(trip.status)
        ? {
            ...trip,
            status: "cancelled",
            cancelReason: reason,
            completedAt: now,
          }
        : trip,
    ),
  }));
}

export function resetDemo() {
  persist(seedState());
}
