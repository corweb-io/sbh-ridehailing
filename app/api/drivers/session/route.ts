import { NextRequest, NextResponse } from "next/server";
import {
  createDriverSessionToken,
  demoDriverAccessCode,
  DRIVER_SESSION_COOKIE,
  DRIVER_SESSION_MAX_AGE_SECONDS,
  readDriverSessionToken,
} from "@/lib/driver-session";
import { parseJson, rateLimit } from "@/lib/api";
import { matchDrivers } from "@/lib/staff-auth";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const session = readDriverSessionToken(
    request.cookies.get(DRIVER_SESSION_COOKIE)?.value,
  );
  return NextResponse.json(
    { driverId: session?.driverId ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

export async function POST(request: NextRequest) {
  const limited = rateLimit(request, "drivers:session", 10, 60_000);
  if (limited) return limited;
  const body = await parseJson<{ identifier?: string; code?: string }>(request);
  const identifier =
    typeof body?.identifier === "string" ? body.identifier.trim() : "";
  const code = typeof body?.code === "string" ? body.code.trim() : "";
  const accessCode = demoDriverAccessCode();
  const matches = matchDrivers(identifier);

  if (!accessCode) {
    return NextResponse.json(
      { error: "Connexion chauffeur non configurée." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
  if (matches.length !== 1 || code !== accessCode) {
    return NextResponse.json(
      { error: "Identifiant ou code d’accès incorrect." },
      { status: 401, headers: { "Cache-Control": "no-store" } },
    );
  }

  const token = createDriverSessionToken(matches[0].id);
  if (!token) {
    return NextResponse.json(
      { error: "Session chauffeur non configurée." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }

  const response = NextResponse.json(
    { driverId: matches[0].id },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set({
    name: DRIVER_SESSION_COOKIE,
    value: token,
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: DRIVER_SESSION_MAX_AGE_SECONDS,
  });
  return response;
}

export async function DELETE() {
  const response = NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } },
  );
  response.cookies.set({
    name: DRIVER_SESSION_COOKIE,
    value: "",
    httpOnly: true,
    sameSite: "strict",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}
