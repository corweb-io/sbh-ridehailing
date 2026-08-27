import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

export const DRIVER_SESSION_COOKIE = "ride_driver_session";
export const DRIVER_SESSION_MAX_AGE_SECONDS = 12 * 60 * 60;

type DriverSessionPayload = {
  driverId: string;
  expiresAt: number;
};

function sessionSecret() {
  const configured = process.env.DRIVER_SESSION_SECRET?.trim();
  if (configured && configured.length >= 32) return configured;
  if (process.env.NODE_ENV !== "production") {
    return "ride-local-driver-session-secret-change-me";
  }
  return null;
}

export function demoDriverAccessCode() {
  const configured = process.env.DRIVER_ACCESS_CODE?.trim();
  if (configured) return configured;
  return process.env.NODE_ENV === "production" ? null : "ride";
}

function signature(encoded: string, secret: string) {
  return createHmac("sha256", secret).update(encoded).digest("base64url");
}

export function createDriverSessionToken(driverId: string) {
  const secret = sessionSecret();
  if (!secret) return null;
  const payload: DriverSessionPayload = {
    driverId,
    expiresAt: Date.now() + DRIVER_SESSION_MAX_AGE_SECONDS * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  return `${encoded}.${signature(encoded, secret)}`;
}

export function readDriverSessionToken(token: string | null | undefined) {
  const secret = sessionSecret();
  if (!secret || !token) return null;
  const [encoded, received] = token.split(".");
  if (!encoded || !received) return null;
  const expected = signature(encoded, secret);
  const expectedBuffer = Buffer.from(expected);
  const receivedBuffer = Buffer.from(received);
  if (
    expectedBuffer.length !== receivedBuffer.length ||
    !timingSafeEqual(expectedBuffer, receivedBuffer)
  ) {
    return null;
  }
  try {
    const payload = JSON.parse(
      Buffer.from(encoded, "base64url").toString("utf8"),
    ) as DriverSessionPayload;
    if (
      typeof payload.driverId !== "string" ||
      typeof payload.expiresAt !== "number" ||
      payload.expiresAt <= Date.now()
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}
