import "server-only";

import { generateText, Output } from "ai";
import { z } from "zod";
import { datetimeLocalInStBarth } from "./format";
import {
  emptyRideRequestFields,
  knownPlaceNames,
  type RideRequestFields,
} from "./ride-request";

export const RIDE_REQUEST_MODEL = "anthropic/claude-haiku-4.5";

const ExtractionSchema = z.object({
  is_ride_request: z
    .boolean()
    .describe(
      "true if the author wants a taxi or ride now or later. false for greetings, questions about the service, driver messages, or anything that is not booking a trip.",
    ),
  pickup_raw: z
    .string()
    .nullable()
    .describe("Verbatim span naming the pickup. null if none."),
  destination_raw: z
    .string()
    .nullable()
    .describe("Verbatim span naming the drop-off. null if none."),
  datetime_raw: z
    .string()
    .nullable()
    .describe("Verbatim span describing when. null if none."),
  resolved_datetime_start: z
    .string()
    .nullable()
    .describe(
      "Best-guess start in Saint-Barth local time, ISO without offset, e.g. 2026-08-30T18:00. null if no time and not now.",
    ),
  depart_now: z
    .boolean()
    .describe("true if they want a taxi immediately / now / asap."),
  pax: z
    .number()
    .int()
    .nullable()
    .describe("Passenger count 1-8. null if unstated."),
  notes: z
    .string()
    .nullable()
    .describe("Bags, sign, wheelchair, or other driver note. null if none."),
  pmr: z.boolean().describe("true if they asked for wheelchair / PMR access."),
  hybrid_electric: z
    .boolean()
    .describe("true if they asked for a hybrid or electric taxi."),
  confidence: z.enum(["high", "medium", "low"]),
  needs_clarification: z
    .array(z.string())
    .describe(
      "Field names a human should confirm, e.g. pickup_raw. Empty if nothing is missing.",
    ),
});

export function canUseRideRequestAi() {
  return Boolean(
    process.env.AI_GATEWAY_API_KEY?.trim() || process.env.VERCEL_ENV,
  );
}

function stBarthCalendar(now: Date) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/St_Barthelemy",
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(fmt.formatToParts(now).map((p) => [p.type, p.value]));
  const today = `${parts.year}-${parts.month}-${parts.day}`;
  const calendar = Array.from({ length: 8 }, (_, i) => {
    const d = new Date(now.getTime() + i * 86_400_000);
    const p = Object.fromEntries(fmt.formatToParts(d).map((x) => [x.type, x.value]));
    return `${p.year}-${p.month}-${p.day} = ${p.weekday}${
      i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : ""
    }`;
  }).join("\n");
  return { today, weekday: parts.weekday, calendar };
}

export async function extractRideRequestWithAi(
  text: string,
  now = new Date(),
): Promise<RideRequestFields | null> {
  if (!canUseRideRequestAi()) return null;
  const { today, weekday, calendar } = stBarthCalendar(now);
  const clock = datetimeLocalInStBarth(now);
  try {
    const { output } = await generateText({
      model: RIDE_REQUEST_MODEL,
      maxOutputTokens: 400,
      output: Output.object({ schema: ExtractionSchema }),
      instructions: `You extract structured taxi bookings for Saint-Barthélemy. Messages are short, French or English, often typed the way people text a taxi stand.

The message was written on ${weekday}, ${today}, local time ${clock} (America/St_Barthelemy). Resolve "demain", "tonight", "ce soir", weekdays against this calendar:
${calendar}

Known places (prefer these names when the text matches): ${knownPlaceNames().join(", ")}.
Airport / SBH / aéroport = Aéroport.

Rules:
- Extract only what the message states or clearly implies. Never invent a place or time.
- If they name two places without "from/to", the first is pickup and the second is drop-off.
- depart_now is true for maintenant / now / asap / tout de suite, or when they only ask for a taxi with no later time.
- pax is 1-8. "two people" = 2. Unstated = null.
- If this is not a taxi booking, is_ride_request is false and location fields are null.`,
      prompt: text,
    });
    if (!output) return null;
    const fields = emptyRideRequestFields();
    fields.isRideRequest = output.is_ride_request;
    fields.pickupText = output.pickup_raw?.trim() || null;
    fields.destinationText = output.destination_raw?.trim() || null;
    fields.whenText = output.datetime_raw?.trim() || null;
    fields.resolvedDepartAt = output.resolved_datetime_start?.trim() || null;
    fields.departNow = output.depart_now === true;
    fields.pax =
      typeof output.pax === "number" && output.pax >= 1 && output.pax <= 8
        ? output.pax
        : null;
    fields.notes = output.notes?.trim() || null;
    fields.pmr = output.pmr === true;
    fields.hybridElectric = output.hybrid_electric === true;
    return fields;
  } catch (error) {
    console.error("ride_request_ai_failed", { error });
    return null;
  }
}
