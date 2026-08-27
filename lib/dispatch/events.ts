import { createHash } from "node:crypto";
import type { FareZoneId } from "../types";
import type {
  BookerSession,
  BookerStep,
  ChatChannel,
  DispatchChannel,
  DispatchJob,
  DispatchStatus,
  InboundMessage,
  OutboundMessage,
  SupplierKind,
} from "./types";

export const DISPATCH_EVENT_NAMES = [
  "inbound",
  "outbound",
  "booking_started",
  "booking_step",
  "job_created",
  "job_status",
  "offer_accepted",
  "offer_declined",
  "staff_bound",
  "staff_unbound",
  "duty_on",
  "duty_off",
] as const;

export type DispatchEventName = (typeof DISPATCH_EVENT_NAMES)[number];

export type DispatchActorRole = "booker" | "staff" | "system";

export type InboundKind = "text" | "button" | "location" | "contact";
export type OutboundKind = "text" | "buttons" | "template";

export type DispatchEventMeta = {
  locale?: string;
  step?: BookerStep;
  statusFrom?: DispatchStatus;
  statusTo?: DispatchStatus;
  inboundKind?: InboundKind;
  outboundKind?: OutboundKind;
  supplierKind?: SupplierKind;
  supplierId?: string;
  fareZoneFrom?: FareZoneId | null;
  fareZoneTo?: FareZoneId | null;
  pax?: number;
  fare?: number;
  backfill?: boolean;
  buttonFamily?: string;
};

export type DispatchEvent = {
  id: string;
  createdAt: string;
  channel: DispatchChannel;
  name: DispatchEventName;
  actorRole: DispatchActorRole;
  actorHash: string | null;
  jobId: string | null;
  meta: DispatchEventMeta;
};

export type DispatchEventDraft = {
  createdAt?: string;
  channel: DispatchChannel;
  name: DispatchEventName;
  actorRole: DispatchActorRole;
  chatId?: string | null;
  jobId?: string | null;
  meta?: DispatchEventMeta;
};

const BOOKING_FLOW_STEPS = new Set<BookerStep>([
  "pickup",
  "pickup_text",
  "dropoff",
  "dropoff_text",
  "place_pick",
  "zone",
  "when",
  "when_day",
  "when_time",
  "pax",
  "phone",
  "confirm",
  "dispatching",
]);

const META_KEYS = [
  "locale",
  "step",
  "statusFrom",
  "statusTo",
  "inboundKind",
  "outboundKind",
  "supplierKind",
  "supplierId",
  "fareZoneFrom",
  "fareZoneTo",
  "pax",
  "fare",
  "backfill",
  "buttonFamily",
] as const satisfies readonly (keyof DispatchEventMeta)[];

const PHONE_LIKE = /\+?\d[\d\s().-]{6,}/;
const BLOCKED_META_KEYS = new Set([
  "chatId",
  "text",
  "phone",
  "passengerPhone",
  "lat",
  "lng",
  "location",
  "contact",
  "address",
  "name",
]);

export function isDispatchEventName(value: unknown): value is DispatchEventName {
  return (
    typeof value === "string" &&
    (DISPATCH_EVENT_NAMES as readonly string[]).includes(value)
  );
}

export function hashActor(
  channel: DispatchChannel | string,
  chatId: string,
): string {
  return createHash("sha256")
    .update(`${channel}:${chatId}`)
    .digest("hex")
    .slice(0, 16);
}

export function inboundKind(inbound: InboundMessage): InboundKind {
  if (inbound.location) return "location";
  if (inbound.contact) return "contact";
  if (inbound.buttonId) return "button";
  return "text";
}

export function outboundKind(message: OutboundMessage): OutboundKind {
  if (message.notice) return "template";
  if ((message.buttons ?? []).flat().length > 0) return "buttons";
  return "text";
}

export function buttonFamily(buttonId: string | undefined): string | undefined {
  if (!buttonId) return undefined;
  const prefix = buttonId.split(":")[0]?.trim();
  return prefix ? prefix.slice(0, 24) : undefined;
}

function isSafeMetaString(value: string) {
  if (value.length > 80) return false;
  if (PHONE_LIKE.test(value)) return false;
  return true;
}

export function sanitizeMeta(input: unknown): DispatchEventMeta {
  if (!input || typeof input !== "object" || Array.isArray(input)) return {};
  const raw = input as Record<string, unknown>;
  const meta: DispatchEventMeta = {};
  for (const key of Object.keys(raw)) {
    if (BLOCKED_META_KEYS.has(key)) continue;
    if (!(META_KEYS as readonly string[]).includes(key)) continue;
    const value = raw[key];
    if (value == null) {
      if (key === "fareZoneFrom" || key === "fareZoneTo") {
        meta[key] = null;
      }
      continue;
    }
    if (typeof value === "string") {
      if (!isSafeMetaString(value)) continue;
      (meta as Record<string, unknown>)[key] = value;
      continue;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
      if (key === "pax" || key === "fare") meta[key] = value;
      continue;
    }
    if (typeof value === "boolean" && key === "backfill") {
      meta.backfill = value;
    }
  }
  return meta;
}

export function eventFromDraft(
  draft: DispatchEventDraft,
  id = crypto.randomUUID(),
  now = new Date().toISOString(),
): DispatchEvent {
  return {
    id,
    createdAt: draft.createdAt ?? now,
    channel: draft.channel,
    name: draft.name,
    actorRole: draft.actorRole,
    actorHash: draft.chatId ? hashActor(draft.channel, draft.chatId) : null,
    jobId: draft.jobId ?? null,
    meta: sanitizeMeta(draft.meta),
  };
}

function jobMeta(job: DispatchJob): DispatchEventMeta {
  return {
    locale: job.bookerLocale,
    statusTo: job.status,
    fareZoneFrom: job.quote.zoneFrom,
    fareZoneTo: job.quote.zoneTo,
    pax: job.pax,
    fare: job.quote.fare ?? undefined,
  };
}

export function jobLifecycleEvents(
  previous: DispatchJob | null,
  next: DispatchJob,
): DispatchEventDraft[] {
  const drafts: DispatchEventDraft[] = [];
  const base = {
    channel: next.channel,
    jobId: next.id,
    chatId: next.bookerChatId,
  } as const;

  if (!previous) {
    drafts.push({
      ...base,
      name: "job_created",
      actorRole: "system",
      meta: jobMeta(next),
    });
  }

  if (!previous || previous.status !== next.status) {
    drafts.push({
      ...base,
      name: "job_status",
      actorRole: "system",
      meta: {
        ...jobMeta(next),
        statusFrom: previous?.status,
        statusTo: next.status,
      },
    });
  }

  const previousByOffer = new Map(
    (previous?.offers ?? []).map((offer) => [
      `${offer.kind}:${offer.supplierId}`,
      offer.status,
    ]),
  );
  for (const offer of next.offers) {
    const prior = previousByOffer.get(`${offer.kind}:${offer.supplierId}`);
    if (offer.status === "accepted" && prior !== "accepted") {
      drafts.push({
        ...base,
        name: "offer_accepted",
        actorRole: "staff",
        meta: { supplierKind: offer.kind, supplierId: offer.supplierId },
      });
    }
    if (offer.status === "declined" && prior !== "declined") {
      drafts.push({
        ...base,
        name: "offer_declined",
        actorRole: "staff",
        meta: { supplierKind: offer.kind, supplierId: offer.supplierId },
      });
    }
  }

  return drafts;
}

export function sessionLifecycleEvents(
  previous: BookerSession | null,
  next: BookerSession,
): DispatchEventDraft[] {
  const drafts: DispatchEventDraft[] = [];
  const base = {
    channel: next.channel,
    chatId: next.chatId,
    jobId: next.jobId,
    actorRole: "booker" as const,
  };

  if (
    next.step === "pickup" &&
    !next.pickup &&
    !next.dropoff &&
    !next.jobId &&
    (previous?.step !== "pickup" ||
      Boolean(
        previous.pickup || previous.dropoff || previous.jobId || previous.pax,
      ))
  ) {
    drafts.push({
      ...base,
      name: "booking_started",
      meta: { locale: next.locale ?? undefined, step: next.step },
    });
  }

  if (
    previous?.step !== next.step &&
    BOOKING_FLOW_STEPS.has(next.step)
  ) {
    drafts.push({
      ...base,
      name: "booking_step",
      meta: { locale: next.locale ?? undefined, step: next.step },
    });
  }

  return drafts;
}

export function backfillEventsForJob(job: DispatchJob): DispatchEventDraft[] {
  const createdAt = job.createdAt;
  const statusAt = job.acceptedBy?.at ?? createdAt;
  return [
    {
      createdAt,
      channel: job.channel,
      name: "job_created",
      actorRole: "system",
      chatId: job.bookerChatId,
      jobId: job.id,
      meta: { ...jobMeta(job), backfill: true },
    },
    {
      createdAt: statusAt,
      channel: job.channel,
      name: "job_status",
      actorRole: "system",
      chatId: job.bookerChatId,
      jobId: job.id,
      meta: {
        ...jobMeta(job),
        statusTo: job.status,
        backfill: true,
      },
    },
  ];
}

export function inboundEventDraft(
  inbound: InboundMessage,
  actorRole: DispatchActorRole,
): DispatchEventDraft {
  return {
    channel: inbound.channel,
    name: "inbound",
    actorRole,
    chatId: inbound.chatId,
    meta: {
      inboundKind: inboundKind(inbound),
      locale: inbound.locale,
      buttonFamily: buttonFamily(inbound.buttonId),
    },
  };
}

export function outboundEventDraft(
  channel: ChatChannel["name"],
  message: OutboundMessage,
  actorRole: DispatchActorRole,
  jobId?: string | null,
): DispatchEventDraft {
  return {
    channel,
    name: "outbound",
    actorRole,
    chatId: message.chatId,
    jobId: jobId ?? null,
    meta: {
      outboundKind: outboundKind(message),
      locale: message.locale,
    },
  };
}

export const DISPATCH_EVENT_LABELS: Record<DispatchEventName, string> = {
  inbound: "Message reçu",
  outbound: "Message envoyé",
  booking_started: "Réservation commencée",
  booking_step: "Étape de réservation",
  job_created: "Course créée",
  job_status: "Statut mis à jour",
  offer_accepted: "Offre acceptée",
  offer_declined: "Offre refusée",
  staff_bound: "Chauffeur lié",
  staff_unbound: "Chauffeur délié",
  duty_on: "Prise de service",
  duty_off: "Fin de service",
};

export const DISPATCH_STATUS_LABELS: Record<DispatchStatus, string> = {
  ring_taxis: "Appel taxis",
  ring_companies: "Appel sociétés",
  hold: "En attente client",
  assigned: "Assignée",
  en_route: "En route",
  arrived: "Arrivé",
  completed: "Terminée",
  unfilled: "Non pourvue",
  cancelled: "Annulée",
};

export function isBookingFlowStep(step: BookerStep) {
  return BOOKING_FLOW_STEPS.has(step);
}
