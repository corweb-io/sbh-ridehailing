import { CONCIERGE_ORGS, orgById, type ConciergeOrg } from "./hotels";
import { LICENSED_TAXIS, type LicensedTaxi } from "./licensed-taxis";
import { digitsOnly } from "./phone";

const CONCIERGE_DEMO_ACCESS_CODE = "ride";

export const DRIVER_SESSION_KEY = "ride-driver-session";
export const CONCIERGE_SESSION_KEY = "ride-concierge-session";

function isBrowser() {
  return typeof window !== "undefined";
}

function fold(value: string) {
  return value
    .trim()
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function compact(value: string) {
  return fold(value).replace(/\s/g, "");
}

function readId(key: string) {
  if (!isBrowser()) return null;
  const value = window.localStorage.getItem(key)?.trim() ?? "";
  return value || null;
}

function writeId(key: string, id: string | null) {
  if (!isBrowser()) return;
  if (id) window.localStorage.setItem(key, id);
  else window.localStorage.removeItem(key);
}

export function getDriverSessionId() {
  return readId(DRIVER_SESSION_KEY);
}

export function getConciergeSessionId() {
  return readId(CONCIERGE_SESSION_KEY);
}

export function setDriverSessionId(id: string | null) {
  writeId(DRIVER_SESSION_KEY, id);
}

export function setConciergeSessionId(id: string | null) {
  writeId(CONCIERGE_SESSION_KEY, id);
}

function codeMatches(code: string) {
  return fold(code) === fold(CONCIERGE_DEMO_ACCESS_CODE);
}

function driverFamilyName(driver: LicensedTaxi) {
  return fold(driver.name).split(" ")[0] ?? "";
}

export function matchDrivers(identifier: string): LicensedTaxi[] {
  const raw = identifier.trim();
  if (!raw) return [];
  const folded = fold(raw);
  const packed = compact(raw);
  const digits = digitsOnly(raw);

  const exact = LICENSED_TAXIS.filter((driver) => {
    const number = compact(driver.ads.replace(/^ads\s+/i, ""));
    const idPacked = compact(driver.id);
    const phone = digitsOnly(driver.phone);
    if (packed === number || packed === idPacked || packed === `taxi${number}`) {
      return true;
    }
    if (folded === fold(driver.ads) || folded === fold(driver.name)) return true;
    if (digits.length >= 8 && (phone === digits || phone.endsWith(digits))) {
      return true;
    }
    return false;
  });
  if (exact.length > 0) return exact;

  const family = LICENSED_TAXIS.filter(
    (driver) => driverFamilyName(driver) === folded,
  );
  return family.length === 1 ? family : [];
}

export function matchOrgs(identifier: string): ConciergeOrg[] {
  const raw = identifier.trim();
  if (!raw) return [];
  const folded = fold(raw.replace(/@.*$/, ""));
  const packed = compact(raw.replace(/@.*$/, ""));
  if (!folded) return [];

  const exact = CONCIERGE_ORGS.filter((org) => {
    const name = fold(org.name);
    const id = fold(org.id.replace(/-/g, " "));
    const nameWithoutArticle = name.replace(/^le /, "");
    return (
      packed === compact(org.id) ||
      folded === name ||
      folded === id ||
      folded === nameWithoutArticle
    );
  });
  if (exact.length > 0) return exact;

  if (folded.length < 4) return [];
  const prefixed = CONCIERGE_ORGS.filter((org) => {
    const name = fold(org.name);
    const id = fold(org.id.replace(/-/g, " "));
    return name.startsWith(folded) || id.startsWith(folded);
  });
  return prefixed.length === 1 ? prefixed : [];
}

export type StaffSignInResult =
  | { ok: true; id: string }
  | { ok: false; error: string };

export async function signInDriver(
  identifier: string,
  code: string,
): Promise<StaffSignInResult> {
  try {
    const response = await fetch("/api/drivers/session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ identifier, code }),
    });
    const data = (await response.json()) as {
      driverId?: string;
      error?: string;
    };
    if (!response.ok || !data.driverId) {
      return {
        ok: false,
        error: data.error ?? "Connexion chauffeur impossible.",
      };
    }
    setDriverSessionId(data.driverId);
    return { ok: true, id: data.driverId };
  } catch {
    return { ok: false, error: "Connexion chauffeur impossible." };
  }
}

export function signInConcierge(
  identifier: string,
  code: string,
): StaffSignInResult {
  const matches = matchOrgs(identifier);
  if (matches.length === 0) {
    return {
      ok: false,
      error: "Aucun compte conciergerie pour cet établissement.",
    };
  }
  if (matches.length > 1) {
    return {
      ok: false,
      error: "Précisez le nom de l’hôtel ou de l’agence.",
    };
  }
  if (!codeMatches(code)) {
    return { ok: false, error: "Code d’accès incorrect." };
  }
  setConciergeSessionId(matches[0].id);
  return { ok: true, id: matches[0].id };
}

export function signInConciergeOrg(
  orgId: string,
  code: string,
): StaffSignInResult {
  const org = orgById(orgId);
  if (!org) {
    return { ok: false, error: "Établissement introuvable." };
  }
  return signInConcierge(org.id, code);
}

export async function signOutDriver() {
  await fetch("/api/drivers/session", { method: "DELETE" }).catch(
    () => undefined,
  );
  setDriverSessionId(null);
}

export function signOutConcierge() {
  setConciergeSessionId(null);
}
