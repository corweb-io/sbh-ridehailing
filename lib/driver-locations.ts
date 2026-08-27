import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { GPS_FRESH_MS, type DriverLocationPing } from "./driver-gps";
import { GEOLOCATION_RETENTION_MS } from "./regulation";

const DATA_DIR = path.join(process.cwd(), ".data");
const DATA_FILE = path.join(DATA_DIR, "driver-locations.json");
const STALE_MS = GPS_FRESH_MS;
let supabaseUnavailableUntil = 0;

type StoreShape = { locations: DriverLocationPing[] };

const globalStore = globalThis as typeof globalThis & {
  __driverLocationQueue?: Promise<unknown>;
};

let fileStoreQueue = globalStore.__driverLocationQueue ?? Promise.resolve();
globalStore.__driverLocationQueue = fileStoreQueue;

function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function isFresh(ping: DriverLocationPing, now = Date.now()) {
  const at = Date.parse(ping.updatedAt);
  return Number.isFinite(at) && now - at < STALE_MS;
}

function fromRow(row: {
  driver_id: string;
  lat: number;
  lng: number;
  heading: number | null;
  accuracy: number | null;
  updated_at: string;
}): DriverLocationPing {
  return {
    driverId: row.driver_id,
    lat: row.lat,
    lng: row.lng,
    heading: row.heading,
    accuracy: row.accuracy,
    updatedAt: row.updated_at,
  };
}

async function readFileStore(): Promise<StoreShape> {
  try {
    const raw = await readFile(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw) as Partial<StoreShape>;
    const cutoff = Date.now() - GEOLOCATION_RETENTION_MS;
    return {
      locations: Array.isArray(parsed.locations)
        ? parsed.locations.filter((item) => Date.parse(item.updatedAt) >= cutoff)
        : [],
    };
  } catch {
    return { locations: [] };
  }
}

async function writeFileStore(data: StoreShape) {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(DATA_FILE, JSON.stringify(data, null, 2));
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
  globalStore.__driverLocationQueue = fileStoreQueue;
  return run;
}

export async function upsertDriverLocation(ping: DriverLocationPing) {
  const supabase = getSupabase();
  if (supabase && Date.now() >= supabaseUnavailableUntil) {
    const { error } = await supabase.from("driver_locations").upsert({
      driver_id: ping.driverId,
      lat: ping.lat,
      lng: ping.lng,
      heading: ping.heading,
      accuracy: ping.accuracy,
      updated_at: ping.updatedAt,
    });
    if (!error) return ping;
    if (error.code === "PGRST205") {
      supabaseUnavailableUntil = Date.now() + 15_000;
    } else {
      console.error("driver_location_supabase_failed", { error });
    }
  }

  return withFileStore(async (store) => {
    const next = store.locations.filter((item) => item.driverId !== ping.driverId);
    next.unshift(ping);
    store.locations = next;
    await writeFileStore(store);
    return ping;
  });
}

export async function listDriverLocations(): Promise<DriverLocationPing[]> {
  const supabase = getSupabase();
  if (supabase && Date.now() >= supabaseUnavailableUntil) {
    await supabase
      .from("driver_locations")
      .delete()
      .lt(
        "updated_at",
        new Date(Date.now() - GEOLOCATION_RETENTION_MS).toISOString(),
      );
    const { data, error } = await supabase
      .from("driver_locations")
      .select("driver_id, lat, lng, heading, accuracy, updated_at")
      .gte("updated_at", new Date(Date.now() - STALE_MS).toISOString())
      .order("updated_at", { ascending: false });
    if (!error) return (data ?? []).map(fromRow);
    if (error.code === "PGRST205") {
      supabaseUnavailableUntil = Date.now() + 15_000;
    } else {
      console.error("driver_location_list_failed", { error });
    }
  }

  return withFileStore(async (store) => store.locations.filter((item) => isFresh(item)));
}
