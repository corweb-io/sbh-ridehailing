const SESSION_KEY = "sbh_session_id";
const INTERNAL_SESSION_KEY = "sbh_internal_session";

export function getSessionId() {
  let id = localStorage.getItem(SESSION_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(SESSION_KEY, id);
  }
  return id;
}

export function markInternalSession() {
  sessionStorage.setItem(INTERNAL_SESSION_KEY, "1");
}

export function isInternalSession() {
  return sessionStorage.getItem(INTERNAL_SESSION_KEY) === "1";
}

export async function trackEvent(
  name: string,
  extras?: { rideId?: string | null; meta?: Record<string, unknown> },
) {
  try {
    await fetch("/api/events", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sessionId: getSessionId(),
        rideId: extras?.rideId ?? null,
        name,
        meta: {
          ...(extras?.meta ?? {}),
          ...(isInternalSession() ? { internal: true } : {}),
        },
      }),
    });
  } catch {
    // Demand capture should never block the rider flow.
  }
}
