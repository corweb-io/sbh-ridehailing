import {
  noStoreJson,
  normalizeSessionId,
  parseJson,
  rateLimit,
  validFunnelEvent,
} from "@/lib/api";
import { recordEvent } from "@/lib/store";

export async function POST(request: Request) {
  const limited = rateLimit(request, "events:create", 80, 60_000);
  if (limited) return limited;

  const body = await parseJson<{
    sessionId?: string;
    rideId?: string | null;
    name?: string;
    meta?: Record<string, unknown>;
  }>(request);
  const sessionId = normalizeSessionId(body?.sessionId);
  const metaLength = body?.meta ? JSON.stringify(body.meta).length : 0;

  if (
    !body ||
    !sessionId ||
    !validFunnelEvent(body.name) ||
    metaLength > 2_000
  ) {
    return noStoreJson(
      { error: "Événement invalide." },
      { status: 400 },
    );
  }

  try {
    const event = await recordEvent({
      sessionId,
      rideId: body.rideId,
      name: body.name,
      meta: body.meta,
    });
    if (!event) {
      return noStoreJson({ error: "Course introuvable." }, { status: 404 });
    }

    return noStoreJson({ event });
  } catch (error) {
    console.error("event_record_failed", { eventName: body.name, error });
    return noStoreJson(
      { error: "Impossible d’enregistrer l’événement." },
      { status: 500 },
    );
  }
}
