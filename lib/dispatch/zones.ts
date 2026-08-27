import { FARE_ZONE_IDS, FARE_ZONE_LABELS, fareZoneForPlace } from "../fares";
import { buildOfficialQuote } from "../quote";
import type { FareZoneId, Place } from "../types";
import type { ChatButton, ChatLocale, DispatchJob } from "./types";
import { t } from "../chat/messages";
import { resolveLocale } from "../chat/locale";

export const DRIVER_ZONE_PAGE_SIZE = 8;

export function missingFareSides(
  pickup: Place,
  dropoff: Place,
): Array<"pickup" | "dropoff"> {
  const sides: Array<"pickup" | "dropoff"> = [];
  if (!fareZoneForPlace(pickup)) sides.push("pickup");
  if (!fareZoneForPlace(dropoff)) sides.push("dropoff");
  return sides;
}

export function jobNeedsDriverZone(
  job: Pick<DispatchJob, "pickup" | "dropoff">,
) {
  return missingFareSides(job.pickup, job.dropoff).length > 0;
}

export function assignJobFareZone(
  job: DispatchJob,
  side: "pickup" | "dropoff",
  zone: FareZoneId,
): DispatchJob {
  const pickup =
    side === "pickup" ? { ...job.pickup, fareZone: zone } : job.pickup;
  const dropoff =
    side === "dropoff" ? { ...job.dropoff, fareZone: zone } : job.dropoff;
  return {
    ...job,
    pickup,
    dropoff,
    quote: buildOfficialQuote(pickup, dropoff, new Date(job.departAt)),
  };
}

export function parseDriverZoneButton(buttonId: string) {
  const match = buttonId.match(/^zd:([0-9a-f]{8}):([pd]):(.+):([^:]+)$/i);
  if (!match) return null;
  const pageMatch = match[4].match(/^m(\d+)$/i);
  const zone = match[4] as FareZoneId;
  return {
    jobPrefix: match[1],
    side: (match[2] === "d" ? "dropoff" : "pickup") as "pickup" | "dropoff",
    supplierId: match[3],
    page: pageMatch ? Number(pageMatch[1]) : null,
    zone: pageMatch || !FARE_ZONE_IDS.includes(zone) ? null : zone,
  };
}

export function driverZoneButtons(
  job: Pick<DispatchJob, "id">,
  side: "pickup" | "dropoff",
  supplierId: string,
  page: number,
  locale?: ChatLocale | null,
): ChatButton[][] {
  const copy = t(resolveLocale(locale));
  const prefix = job.id.slice(0, 8);
  const sideKey = side === "dropoff" ? "d" : "p";
  const idFor = (token: string) =>
    `zd:${prefix}:${sideKey}:${supplierId}:${token}`;
  const start = page * DRIVER_ZONE_PAGE_SIZE;
  const slice = FARE_ZONE_IDS.slice(start, start + DRIVER_ZONE_PAGE_SIZE);
  const rows: ChatButton[][] = [];
  for (let i = 0; i < slice.length; i += 2) {
    rows.push(
      slice.slice(i, i + 2).map((id) => ({
        id: idFor(id),
        label: FARE_ZONE_LABELS[id],
      })),
    );
  }
  if (start + DRIVER_ZONE_PAGE_SIZE < FARE_ZONE_IDS.length) {
    rows.push([
      { id: idFor(`m${page + 1}`), label: copy.otherNeighborhoods },
    ]);
  }
  rows.push([
    { id: `n:${prefix}:${supplierId}`, label: copy.decline },
  ]);
  return rows;
}
