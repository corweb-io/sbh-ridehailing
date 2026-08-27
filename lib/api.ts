import { isInsideSbh } from "./config";
import { FARE_ZONE_IDS } from "./fares";
import type {
  FareBand,
  FareZoneId,
  FunnelEventName,
  RidePatch,
  RideStatus,
  UserType,
} from "./types";

type RateBucket = { count: number; resetAt: number };

const globalRateStore = globalThis as typeof globalThis & {
  __sbhRateLimits?: Map<string, RateBucket>;
};

const rateLimits =
  globalRateStore.__sbhRateLimits ?? new Map<string, RateBucket>();
globalRateStore.__sbhRateLimits = rateLimits;

const FUNNEL_EVENTS = new Set<FunnelEventName>([
  "landing_view",
  "ride_started",
  "pickup_selected",
  "destination_selected",
  "quote_generated",
  "taxi_requested",
  "whatsapp_clicked",
  "stand_called",
  "pickup_confirmation_started",
  "pickup_confirmed",
  "driver_search_started",
  "no_driver_shown",
  "contact_submitted",
  "app_install_clicked",
  "pwa_install_accepted",
  "pwa_install_dismissed",
  "ios_install_instructions_shown",
  "bookmark_instructions_shown",
  "pwa_opened",
  "cancelled",
]);

const RIDE_STATUSES = new Set<RideStatus>([
  "started",
  "quote_viewed",
  "requested",
  "confirmed",
  "searching",
  "no_driver",
  "cancelled",
]);

const USER_TYPES = new Set<UserType>(["resident", "worker", "visitor"]);
const FARE_BANDS = new Set<FareBand>(["day", "evening", "night"]);
const FARE_ZONES = new Set<FareZoneId>(FARE_ZONE_IDS);

function clientAddress(request: Request) {
  return (
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("cf-connecting-ip") ||
    request.headers.get("x-real-ip") ||
    "local"
  );
}

export function rateLimit(
  request: Request,
  scope: string,
  limit: number,
  windowMs: number,
): Response | null {
  const now = Date.now();
  const key = `${scope}:${clientAddress(request)}`;
  const current = rateLimits.get(key);
  const bucket =
    !current || current.resetAt <= now
      ? { count: 0, resetAt: now + windowMs }
      : current;

  bucket.count += 1;
  rateLimits.set(key, bucket);

  if (rateLimits.size > 5_000) {
    for (const [storedKey, stored] of rateLimits) {
      if (stored.resetAt <= now) rateLimits.delete(storedKey);
    }
  }

  if (bucket.count <= limit) return null;

  return Response.json(
    { error: "Trop de demandes. Réessayez dans quelques instants." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.ceil((bucket.resetAt - now) / 1_000)),
        "Cache-Control": "no-store",
      },
    },
  );
}

export async function parseJson<T>(request: Request): Promise<T | null> {
  try {
    return (await request.json()) as T;
  } catch {
    return null;
  }
}

export function noStoreJson(data: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store");
  return Response.json(data, { ...init, headers });
}

export function normalizeSessionId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  if (
    normalized.length < 8 ||
    normalized.length > 128 ||
    !/^[A-Za-z0-9_-]+$/.test(normalized)
  ) {
    return null;
  }
  return normalized;
}

export function cleanText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().replace(/\s+/g, " ");
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function validIslandPoint(
  value: unknown,
): value is { lat: number; lng: number } {
  if (!value || typeof value !== "object") return false;
  const point = value as { lat?: unknown; lng?: unknown };
  return (
    typeof point.lat === "number" &&
    Number.isFinite(point.lat) &&
    typeof point.lng === "number" &&
    Number.isFinite(point.lng) &&
    isInsideSbh(point.lat, point.lng)
  );
}

export function validContact(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const contact = value.trim();
  const email = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
  const phone = /^\+?[0-9][0-9\s().-]{6,20}$/;
  return email.test(contact) || phone.test(contact);
}

export function validFunnelEvent(
  value: unknown,
): value is FunnelEventName {
  return typeof value === "string" && FUNNEL_EVENTS.has(value as FunnelEventName);
}

export function parseRidePatch(value: unknown): RidePatch | null {
  if (!value || typeof value !== "object") return null;
  const input = value as Record<string, unknown>;
  const patch: RidePatch = {};

  if (input.status !== undefined) {
    if (
      typeof input.status !== "string" ||
      !RIDE_STATUSES.has(input.status as RideStatus)
    ) {
      return null;
    }
    patch.status = input.status as RideStatus;
  }

  const nullableTextFields = [
    "pickup_address",
    "first_name",
  ] as const;
  for (const field of nullableTextFields) {
    if (input[field] !== undefined) {
      patch[field] = cleanText(input[field], field === "first_name" ? 80 : 240);
    }
  }

  const coordinateFields = [
    "pickup_lat",
    "pickup_lng",
  ] as const;
  for (const field of coordinateFields) {
    if (input[field] !== undefined) {
      if (typeof input[field] !== "number" || !Number.isFinite(input[field])) {
        return null;
      }
      patch[field] = input[field];
    }
  }

  if (
    (input.pickup_lat !== undefined || input.pickup_lng !== undefined) &&
    !validIslandPoint({ lat: input.pickup_lat, lng: input.pickup_lng })
  ) {
    return null;
  }
  if (
    input.destination_address !== undefined ||
    input.destination_lat !== undefined ||
    input.destination_lng !== undefined
  ) {
    return null;
  }

  const timestampFields = [
    "pickup_confirmed_at",
    "requested_at",
    "search_started_at",
    "completed_at",
  ] as const;
  for (const field of timestampFields) {
    if (input[field] !== undefined) {
      if (
        typeof input[field] !== "string" ||
        !Number.isFinite(Date.parse(input[field]))
      ) {
        return null;
      }
      patch[field] = input[field];
    }
  }

  if (input.quoted_price !== undefined) {
    if (
      input.quoted_price !== null &&
      (typeof input.quoted_price !== "number" ||
        !Number.isFinite(input.quoted_price))
    ) {
      return null;
    }
    patch.quoted_price = input.quoted_price;
  }

  if (input.fare_zone_from !== undefined) {
    if (
      input.fare_zone_from !== null &&
      (typeof input.fare_zone_from !== "string" ||
        !FARE_ZONES.has(input.fare_zone_from as FareZoneId))
    ) {
      return null;
    }
    patch.fare_zone_from = input.fare_zone_from as FareZoneId | null;
  }

  if (input.fare_zone_to !== undefined) {
    if (
      input.fare_zone_to !== null &&
      (typeof input.fare_zone_to !== "string" ||
        !FARE_ZONES.has(input.fare_zone_to as FareZoneId))
    ) {
      return null;
    }
    patch.fare_zone_to = input.fare_zone_to as FareZoneId | null;
  }

  if (input.fare_band !== undefined) {
    if (
      input.fare_band !== null &&
      (typeof input.fare_band !== "string" ||
        !FARE_BANDS.has(input.fare_band as FareBand))
    ) {
      return null;
    }
    patch.fare_band = input.fare_band as FareBand | null;
  }
  for (const field of timestampFields) {
    if (input[field] !== undefined) {
      if (
        typeof input[field] !== "string" ||
        !Number.isFinite(Date.parse(input[field]))
      ) {
        return null;
      }
      patch[field] = input[field];
    }
  }

  if (input.contact !== undefined) {
    if (input.contact !== null && !validContact(input.contact)) return null;
    patch.contact = input.contact === null ? null : input.contact.trim().slice(0, 160);
  }

  if (input.user_type !== undefined) {
    if (
      input.user_type !== null &&
      (typeof input.user_type !== "string" ||
        !USER_TYPES.has(input.user_type as UserType))
    ) {
      return null;
    }
    patch.user_type = input.user_type as UserType | null;
  }

  if (input.event !== undefined) {
    if (!validFunnelEvent(input.event)) return null;
    patch.event = input.event;
  }

  if (input.eventMeta !== undefined) {
    if (
      !input.eventMeta ||
      typeof input.eventMeta !== "object" ||
      Array.isArray(input.eventMeta) ||
      JSON.stringify(input.eventMeta).length > 2_000
    ) {
      return null;
    }
    patch.eventMeta = input.eventMeta as Record<string, unknown>;
  }

  return Object.keys(patch).length > 0 ? patch : null;
}
