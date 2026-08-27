import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  GEOLOCATION_RETENTION_MS,
  REGULATORY_AUDIT_RETENTION_MS,
} from "./regulation";
import type {
  FunnelEventName,
  RidePatch,
  SmokeTestEvent,
  SmokeTestRide,
} from "./types";

export type StoreShape = {
  rides: SmokeTestRide[];
  events: SmokeTestEvent[];
};

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "rides.json");
const REUSE_WINDOW_MS = 2 * 60 * 60 * 1000;

let fileStoreQueue: Promise<unknown> = Promise.resolve();

export class InvalidRideTransitionError extends Error {}

function nowIso() {
  return new Date().toISOString();
}

function createId() {
  return crypto.randomUUID();
}

function emptyStore(): StoreShape {
  return { rides: [], events: [] };
}

export function sanitizeLocalStore(
  store: StoreShape,
  now = Date.now(),
): StoreShape {
  const auditCutoff = now - REGULATORY_AUDIT_RETENTION_MS;
  const geoCutoff = now - GEOLOCATION_RETENTION_MS;
  const rides = (store.rides ?? [])
    .filter((ride) => Date.parse(ride.created_at) >= auditCutoff)
    .map((ride) => {
      const redactPickup = Date.parse(ride.created_at) < geoCutoff;
      return {
        ...ride,
        pickup_lat: redactPickup ? null : ride.pickup_lat,
        pickup_lng: redactPickup ? null : ride.pickup_lng,
        destination_lat: null,
        destination_lng: null,
        destination_address: null,
      };
    });
  const events = (store.events ?? []).filter(
    (event) => Date.parse(event.created_at) >= auditCutoff,
  );
  return { rides, events };
}

function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function readFileStore(): Promise<StoreShape> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    return sanitizeLocalStore(parsed);
  } catch {
    return emptyStore();
  }
}

async function writeFileStore(data: StoreShape) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function withFileStore<T>(fn: (store: StoreShape) => Promise<T>): Promise<T> {
  const run = fileStoreQueue.then(async () => {
    const store = await readFileStore();
    return fn(store);
  });
  fileStoreQueue = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function isReusableRide(
  ride: SmokeTestRide,
  sessionId: string,
  acquisitionSource: string | null,
) {
  if (ride.session_id !== sessionId) return false;
  if (ride.acquisition_source !== acquisitionSource) return false;
  if (ride.status !== "started") return false;
  const created = Date.parse(ride.created_at);
  return Number.isFinite(created) && Date.now() - created < REUSE_WINDOW_MS;
}

function applyPatch(ride: SmokeTestRide, patch: RidePatch): SmokeTestRide {
  const { event, eventMeta, ...fields } = patch;
  const next: SmokeTestRide = { ...ride, ...fields };
  if (event) {
    next.events = [...ride.events, { name: event, at: nowIso(), meta: eventMeta }];
  }
  return next;
}

function canTransition(
  current: SmokeTestRide["status"],
  next: SmokeTestRide["status"] | undefined,
) {
  if (!next || next === current) return true;
  const allowed: Record<
    SmokeTestRide["status"],
    SmokeTestRide["status"][]
  > = {
    started: ["quote_viewed", "cancelled"],
    quote_viewed: ["requested", "confirmed", "cancelled"],
    requested: ["quote_viewed", "cancelled"],
    confirmed: ["searching", "cancelled"],
    searching: ["no_driver", "cancelled"],
    no_driver: [],
    cancelled: [],
  };
  return allowed[current].includes(next);
}

export async function createRide(
  input: Pick<SmokeTestRide, "session_id"> & Partial<SmokeTestRide>,
): Promise<SmokeTestRide> {
  const timestamp = nowIso();
  const ride: SmokeTestRide = {
    id: createId(),
    session_id: input.session_id,
    created_at: timestamp,
    pickup_lat: input.pickup_lat ?? null,
    pickup_lng: input.pickup_lng ?? null,
    pickup_address: input.pickup_address ?? null,
    destination_lat: null,
    destination_lng: null,
    destination_address: null,
    distance_km: input.distance_km ?? null,
    estimated_duration_minutes: input.estimated_duration_minutes ?? null,
    quoted_price: input.quoted_price ?? null,
    fare_zone_from: input.fare_zone_from ?? null,
    fare_zone_to: input.fare_zone_to ?? null,
    fare_band: input.fare_band ?? null,
    pricing_variant: input.pricing_variant ?? null,
    status: input.status ?? "started",
    started_at: input.started_at ?? timestamp,
    quote_viewed_at: input.quote_viewed_at ?? null,
    pickup_confirmed_at: input.pickup_confirmed_at ?? null,
    requested_at: input.requested_at ?? null,
    search_started_at: input.search_started_at ?? null,
    completed_at: input.completed_at ?? null,
    contact: input.contact ?? null,
    first_name: input.first_name ?? null,
    user_type: input.user_type ?? null,
    acquisition_source: input.acquisition_source ?? null,
    events: input.events ?? [
      { name: "ride_started", at: timestamp },
    ],
  };

  const supabase = getSupabase();
  if (supabase) {
    const { data: existing, error: existingError } = await supabase
      .from("smoke_test_rides")
      .select("*")
      .eq("session_id", ride.session_id)
      .eq("status", "started")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (existingError) throw existingError;
    if (
      existing &&
      isReusableRide(
        existing as SmokeTestRide,
        ride.session_id,
        ride.acquisition_source,
      )
    ) {
      return existing as SmokeTestRide;
    }

    const { data, error } = await supabase
      .from("smoke_test_rides")
      .insert(ride)
      .select()
      .single();
    if (error) throw error;
    await supabase.from("smoke_test_events").insert({
      id: createId(),
      session_id: ride.session_id,
      ride_id: ride.id,
      name: "ride_started",
      created_at: timestamp,
    });
    return data as SmokeTestRide;
  }

  return withFileStore(async (store) => {
    const existing = store.rides.find((item) =>
      isReusableRide(
        item,
        ride.session_id,
        ride.acquisition_source,
      ),
    );
    if (existing) return existing;

    store.rides.unshift(ride);
    store.events.unshift({
      id: createId(),
      session_id: ride.session_id,
      ride_id: ride.id,
      name: "ride_started",
      created_at: timestamp,
    });
    await writeFileStore(store);
    return ride;
  });
}

export async function getRide(
  id: string,
  sessionId: string,
): Promise<SmokeTestRide | null> {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("smoke_test_rides")
      .select("*")
      .eq("id", id)
      .eq("session_id", sessionId)
      .maybeSingle();
    if (error) throw error;
    return (data as SmokeTestRide | null) ?? null;
  }

  return withFileStore(async (store) => {
    return (
      store.rides.find(
        (ride) => ride.id === id && ride.session_id === sessionId,
      ) ?? null
    );
  });
}

export async function updateRide(
  id: string,
  sessionId: string,
  patch: RidePatch,
): Promise<SmokeTestRide | null> {
  const supabase = getSupabase();
  if (supabase) {
    const { data: existing, error: readError } = await supabase
      .from("smoke_test_rides")
      .select("*")
      .eq("id", id)
      .eq("session_id", sessionId)
      .maybeSingle();
    if (readError) throw readError;
    if (!existing) return null;
    if (!canTransition((existing as SmokeTestRide).status, patch.status)) {
      throw new InvalidRideTransitionError();
    }

    const next = applyPatch(existing as SmokeTestRide, patch);
    const { data, error } = await supabase
      .from("smoke_test_rides")
      .update(next)
      .eq("id", id)
      .eq("session_id", sessionId)
      .select()
      .single();
    if (error) throw error;

    if (patch.event) {
      await supabase.from("smoke_test_events").insert({
        id: createId(),
        session_id: next.session_id,
        ride_id: id,
        name: patch.event,
        created_at: nowIso(),
        meta: patch.eventMeta ?? null,
      });
    }
    return data as SmokeTestRide;
  }

  return withFileStore(async (store) => {
    const index = store.rides.findIndex(
      (item) => item.id === id && item.session_id === sessionId,
    );
    if (index === -1) return null;
    if (!canTransition(store.rides[index].status, patch.status)) {
      throw new InvalidRideTransitionError();
    }
    const next = applyPatch(store.rides[index], patch);
    store.rides[index] = next;
    if (patch.event) {
      store.events.unshift({
        id: createId(),
        session_id: next.session_id,
        ride_id: id,
        name: patch.event,
        created_at: nowIso(),
        meta: patch.eventMeta,
      });
    }
    await writeFileStore(store);
    return next;
  });
}

export async function recordEvent(input: {
  sessionId: string;
  rideId?: string | null;
  name: FunnelEventName;
  meta?: Record<string, unknown>;
}) {
  const event: SmokeTestEvent = {
    id: createId(),
    session_id: input.sessionId,
    ride_id: input.rideId ?? null,
    name: input.name,
    created_at: nowIso(),
    meta: input.meta,
  };

  const supabase = getSupabase();
  if (supabase) {
    if (input.rideId) {
      const { data: ownedRide, error: ownershipError } = await supabase
        .from("smoke_test_rides")
        .select("id")
        .eq("id", input.rideId)
        .eq("session_id", input.sessionId)
        .maybeSingle();
      if (ownershipError) throw ownershipError;
      if (!ownedRide) return null;
    }

    const { error } = await supabase.from("smoke_test_events").insert(event);
    if (error) throw error;
    if (input.rideId) {
      const { data } = await supabase
        .from("smoke_test_rides")
        .select("events")
        .eq("id", input.rideId)
        .eq("session_id", input.sessionId)
        .maybeSingle();
      if (data) {
        const events = [
          ...((data.events as SmokeTestRide["events"]) ?? []),
          { name: input.name, at: event.created_at, meta: input.meta },
        ];
        await supabase
          .from("smoke_test_rides")
          .update({ events })
          .eq("id", input.rideId)
          .eq("session_id", input.sessionId);
      }
    }
    return event;
  }

  return withFileStore(async (store) => {
    if (
      input.rideId &&
      !store.rides.some(
        (ride) =>
          ride.id === input.rideId && ride.session_id === input.sessionId,
      )
    ) {
      return null;
    }
    store.events.unshift(event);
    if (input.rideId) {
      const ride = store.rides.find((item) => item.id === input.rideId);
      if (ride) {
        ride.events.push({
          name: input.name,
          at: event.created_at,
          meta: input.meta,
        });
      }
    }
    await writeFileStore(store);
    return event;
  });
}

export async function listRides(): Promise<SmokeTestRide[]> {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("smoke_test_rides")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw error;
    return (data ?? []) as SmokeTestRide[];
  }
  return withFileStore(async (store) => store.rides);
}

export async function listEvents(): Promise<SmokeTestEvent[]> {
  const supabase = getSupabase();
  if (supabase) {
    const { data, error } = await supabase
      .from("smoke_test_events")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw error;
    return (data ?? []) as SmokeTestEvent[];
  }
  return withFileStore(async (store) => store.events);
}

export function persistenceMode() {
  return getSupabase() ? "supabase" : "local-file";
}
