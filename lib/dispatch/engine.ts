import { LICENSED_TAXIS, type LicensedTaxi } from "../licensed-taxis";
import { taxiFitsParty } from "./seats";
import { TRANSPORT_COMPANIES, type TransportCompany } from "./companies";
import { canOfferToSupplier, isStaffSessionOpen } from "./staff-session";
import {
  DEFAULT_HOLD_MS,
  DEFAULT_REOFFER_MS,
  DEFAULT_RING_MS,
  type DispatchJob,
  type OfferTarget,
  type StaffBinding,
} from "./types";

export function ringMs() {
  const raw = Number(process.env.DISPATCH_RING_MS);
  return Number.isFinite(raw) && raw >= 5_000 ? raw : DEFAULT_RING_MS;
}

export function reofferMs() {
  const raw = Number(process.env.DISPATCH_REOFFER_MS);
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_REOFFER_MS;
}

export function holdMs() {
  const raw = Number(process.env.DISPATCH_HOLD_MS);
  return Number.isFinite(raw) && raw >= 5_000 ? raw : DEFAULT_HOLD_MS;
}

export function eligibleTaxis(
  pax: number,
  taxis: readonly LicensedTaxi[] = LICENSED_TAXIS,
) {
  return taxis.filter((taxi) => taxiFitsParty(taxi, pax));
}

export function chatIdForSupplier(
  bindings: readonly StaffBinding[],
  kind: OfferTarget["kind"],
  supplierId: string,
  fallbackChatId: string,
  now: Date = new Date(),
) {
  const bound = bindings.find(
    (binding) => binding.kind === kind && binding.supplierId === supplierId,
  );
  if (!bound) return fallbackChatId;
  if (!isStaffSessionOpen(bound, now)) return null;
  return bound.chatId;
}

function ringSupplierIds(
  kind: OfferTarget["kind"],
  ids: string[],
  bindings: readonly StaffBinding[],
  now: Date,
) {
  return ids.filter((id) => canOfferToSupplier(bindings, kind, id, now));
}

function offerTargets(
  job: DispatchJob,
  kind: OfferTarget["kind"],
  ids: string[],
  bindings: readonly StaffBinding[],
  now: Date,
): OfferTarget[] {
  return ids.map((supplierId) => ({
    kind,
    supplierId,
    chatId: chatIdForSupplier(
      bindings,
      kind,
      supplierId,
      job.bookerChatId,
      now,
    ),
    status: "pending",
  }));
}

export function isLiveTrip(status: DispatchJob["status"]) {
  return (
    status === "assigned" || status === "en_route" || status === "arrived"
  );
}

export function isOngoingTrip(status: DispatchJob["status"]) {
  return status === "en_route" || status === "arrived";
}

export const PICKUP_BUFFER_MS = 20 * 60 * 1000;
export const REMINDER_LEAD_MS = 15 * 60 * 1000;

function occupancyWindow(job: Pick<DispatchJob, "departAt" | "quote">) {
  const start = Date.parse(job.departAt) - PICKUP_BUFFER_MS;
  const durationMs = Math.max(15, job.quote.durationMinutes ?? 30) * 60_000;
  return { start, end: Date.parse(job.departAt) + durationMs };
}

function windowsOverlap(
  a: { start: number; end: number },
  b: { start: number; end: number },
) {
  return a.start < b.end && b.start < a.end;
}

export function busySupplierIds(
  liveJobs: readonly DispatchJob[],
  around: Pick<DispatchJob, "id" | "departAt" | "quote">,
) {
  const target = occupancyWindow(around);
  const busy = new Set<string>();
  for (const job of liveJobs) {
    if (job.id === around.id || !isLiveTrip(job.status) || !job.acceptedBy) {
      continue;
    }
    if (
      isOngoingTrip(job.status) ||
      windowsOverlap(occupancyWindow(job), target)
    ) {
      busy.add(job.acceptedBy.supplierId);
    }
  }
  return busy;
}

export function acceptedChatId(job: DispatchJob) {
  return (
    job.offers.find((offer) => offer.status === "accepted")?.chatId ?? null
  );
}

export function heldChatId(job: DispatchJob) {
  return job.offers.find((offer) => offer.status === "held")?.chatId ?? null;
}

export function holdExpiresAtMs(job: DispatchJob) {
  if (job.status !== "hold" || !job.hold) return null;
  const explicit = job.hold.expiresAt ? Date.parse(job.hold.expiresAt) : NaN;
  if (Number.isFinite(explicit)) return explicit;
  const heldAt = Date.parse(job.hold.heldAt);
  return Number.isFinite(heldAt) ? heldAt + holdMs() : null;
}

export function isHoldExpired(job: DispatchJob, now: Date) {
  const expiresAt = holdExpiresAtMs(job);
  return expiresAt != null && now.getTime() >= expiresAt;
}

export function startTaxiRing(
  job: DispatchJob,
  now: Date,
  bindings: readonly StaffBinding[],
  taxis: readonly LicensedTaxi[] = LICENSED_TAXIS,
  windowMs = ringMs(),
  busyIds: ReadonlySet<string> = new Set(),
): DispatchJob {
  const ids = ringSupplierIds(
    "taxi",
    eligibleTaxis(job.pax, taxis)
      .map((taxi) => taxi.id)
      .filter((id) => !busyIds.has(id)),
    bindings,
    now,
  );
  if (ids.length === 0) {
    return startCompanyRing(
      job,
      now,
      bindings,
      TRANSPORT_COMPANIES,
      windowMs,
      busyIds,
    );
  }
  return {
    ...job,
    status: "ring_taxis",
    ringStartedAt: now.toISOString(),
    ringEndsAt: new Date(now.getTime() + windowMs).toISOString(),
    offers: offerTargets(job, "taxi", ids, bindings, now),
    hold: null,
    reofferAt: null,
  };
}

export function startCompanyRing(
  job: DispatchJob,
  now: Date,
  bindings: readonly StaffBinding[],
  companies: readonly TransportCompany[] = TRANSPORT_COMPANIES,
  windowMs = ringMs(),
  busyIds: ReadonlySet<string> = new Set(),
): DispatchJob {
  if (
    isLiveTrip(job.status) ||
    job.status === "cancelled" ||
    job.status === "completed"
  ) {
    return job;
  }
  const ids = ringSupplierIds(
    "company",
    companies.map((company) => company.id).filter((id) => !busyIds.has(id)),
    bindings,
    now,
  );
  if (ids.length === 0) {
    return { ...job, status: "unfilled", offers: job.offers, reofferAt: null };
  }
  return {
    ...job,
    status: "ring_companies",
    ringStartedAt: now.toISOString(),
    ringEndsAt: new Date(now.getTime() + windowMs).toISOString(),
    offers: [
      ...job.offers.map((offer) =>
        offer.status === "pending" ? { ...offer, status: "taken" as const } : offer,
      ),
      ...offerTargets(job, "company", ids, bindings, now),
    ],
    hold: null,
    reofferAt: null,
  };
}

export function pendingOffers(job: DispatchJob, kind?: OfferTarget["kind"]) {
  return job.offers.filter(
    (offer) =>
      offer.status === "pending" && (kind == null || offer.kind === kind),
  );
}

export function resolveSupplierId(job: DispatchJob, supplierId: string) {
  if (supplierId === "any-taxi") {
    return job.offers.find(
      (offer) => offer.kind === "taxi" && offer.status === "pending",
    )?.supplierId;
  }
  if (supplierId === "any-company") {
    return job.offers.find(
      (offer) => offer.kind === "company" && offer.status === "pending",
    )?.supplierId;
  }
  return supplierId;
}

export function hasLoopbackPending(job: DispatchJob) {
  return pendingOffers(job).some((offer) => offer.chatId === job.bookerChatId);
}

export function scheduleLoopbackReoffer(
  job: DispatchJob,
  now: Date,
  delayMs = reofferMs(),
): DispatchJob {
  return {
    ...job,
    reofferAt: new Date(now.getTime() + delayMs).toISOString(),
  };
}

export function isReofferDue(job: DispatchJob, now: Date) {
  if (!job.reofferAt) return false;
  if (job.status !== "ring_taxis" && job.status !== "ring_companies") {
    return false;
  }
  if (now.getTime() >= Date.parse(job.ringEndsAt)) return false;
  if (!hasLoopbackPending(job)) return false;
  return now.getTime() >= Date.parse(job.reofferAt);
}

export function placeHold(
  job: DispatchJob,
  supplierId: string,
  now: Date,
  windowMs = holdMs(),
): DispatchJob | null {
  if (job.status === "hold") return null;
  if (job.status !== "ring_taxis" && job.status !== "ring_companies") {
    return null;
  }
  const resolved = resolveSupplierId(job, supplierId);
  if (!resolved) return null;
  const match = job.offers.find(
    (offer) => offer.supplierId === resolved && offer.status === "pending",
  );
  if (!match) return null;
  const remaining = Math.max(0, Date.parse(job.ringEndsAt) - now.getTime());
  return {
    ...job,
    status: "hold",
    hold: {
      kind: match.kind,
      supplierId: match.supplierId,
      heldAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + windowMs).toISOString(),
      ringRemainingMs: remaining,
      resumeStatus: job.status,
    },
    offers: job.offers.map((offer) =>
      offer.supplierId === match.supplierId
        ? { ...offer, status: "held" as const }
        : offer,
    ),
    reofferAt: null,
  };
}

export function confirmHold(
  job: DispatchJob,
  now: Date,
  companyRate: number | null = null,
): DispatchJob | null {
  if (job.status !== "hold" || !job.hold) return null;
  const match = job.offers.find(
    (offer) =>
      offer.supplierId === job.hold?.supplierId && offer.status === "held",
  );
  if (!match) return null;
  return {
    ...job,
    status: "assigned",
    hold: null,
    reofferAt: null,
    acceptedBy: {
      kind: match.kind,
      supplierId: match.supplierId,
      at: now.toISOString(),
      companyRate,
    },
    offers: job.offers.map((offer) => {
      if (offer.supplierId === match.supplierId) {
        return { ...offer, status: "accepted" as const };
      }
      if (offer.status === "pending" || offer.status === "held") {
        return { ...offer, status: "taken" as const };
      }
      return offer;
    }),
  };
}

export function rejectHold(job: DispatchJob, now: Date): DispatchJob | null {
  if (job.status !== "hold" || !job.hold) return null;
  const supplierId = job.hold.supplierId;
  const resumeStatus = job.hold.resumeStatus;
  const remaining = job.hold.ringRemainingMs;
  return {
    ...job,
    status: resumeStatus,
    hold: null,
    ringEndsAt: new Date(now.getTime() + remaining).toISOString(),
    offers: job.offers.map((offer) =>
      offer.supplierId === supplierId && offer.status === "held"
        ? { ...offer, status: "declined" as const }
        : offer,
    ),
  };
}

export function acceptOffer(
  job: DispatchJob,
  supplierId: string,
  now: Date,
  companyRate: number | null = null,
): DispatchJob | null {
  const held = placeHold(job, supplierId, now);
  if (!held) return null;
  return confirmHold(held, now, companyRate);
}

export function declineOffer(job: DispatchJob, supplierId: string): DispatchJob | null {
  if (
    job.status !== "ring_taxis" &&
    job.status !== "ring_companies" &&
    job.status !== "hold"
  ) {
    return null;
  }
  const resolved = resolveSupplierId(job, supplierId);
  if (!resolved) return null;
  const match = job.offers.find(
    (offer) => offer.supplierId === resolved && offer.status === "pending",
  );
  if (!match) return null;
  return {
    ...job,
    offers: job.offers.map((offer) =>
      offer.supplierId === resolved && offer.status === "pending"
        ? { ...offer, status: "declined" as const }
        : offer,
    ),
  };
}

export function allPendingDeclined(job: DispatchJob) {
  const kind = job.status === "ring_taxis" ? "taxi" : "company";
  const inRing = job.offers.filter((offer) => offer.kind === kind);
  return (
    inRing.length > 0 &&
    inRing.every((offer) => offer.status === "declined")
  );
}

export function tickJob(
  job: DispatchJob,
  now: Date,
  bindings: readonly StaffBinding[],
  windowMs = ringMs(),
  busyIds: ReadonlySet<string> = new Set(),
): DispatchJob {
  if (
    isLiveTrip(job.status) ||
    job.status === "cancelled" ||
    job.status === "unfilled" ||
    job.status === "completed"
  ) {
    return job;
  }
  if (job.status === "hold") {
    return isHoldExpired(job, now) ? cancelJob(job) : job;
  }
  if (job.status === "ring_taxis") {
    const expired = now.getTime() >= Date.parse(job.ringEndsAt);
    if (expired || allPendingDeclined(job)) {
      return startCompanyRing(
        job,
        now,
        bindings,
        TRANSPORT_COMPANIES,
        windowMs,
        busyIds,
      );
    }
  }
  if (job.status === "ring_companies") {
    const expired = now.getTime() >= Date.parse(job.ringEndsAt);
    if (expired || allPendingDeclined(job)) {
      return { ...job, status: "unfilled", reofferAt: null };
    }
  }
  return job;
}

export function cancelJob(job: DispatchJob): DispatchJob {
  if (job.status === "completed" || job.status === "cancelled") return job;
  return {
    ...job,
    status: "cancelled",
    hold: null,
    reofferAt: null,
    offers: job.offers.map((offer) =>
      offer.status === "pending" || offer.status === "held"
        ? { ...offer, status: "taken" as const }
        : offer,
    ),
  };
}

export function markEnRoute(job: DispatchJob): DispatchJob | null {
  if (job.status !== "assigned" || !job.acceptedBy) return null;
  return { ...job, status: "en_route" };
}

export function markArrived(job: DispatchJob): DispatchJob | null {
  if (job.status !== "en_route" || !job.acceptedBy) return null;
  return { ...job, status: "arrived" };
}

export function markCompleted(job: DispatchJob): DispatchJob | null {
  if (job.status !== "arrived" || !job.acceptedBy) return null;
  return { ...job, status: "completed" };
}

export function releaseAssignment(
  job: DispatchJob,
  now: Date,
  bindings: readonly StaffBinding[],
  busyIds: ReadonlySet<string> = new Set(),
  taxis: readonly LicensedTaxi[] = LICENSED_TAXIS,
): DispatchJob | null {
  if (job.status !== "assigned" && job.status !== "en_route") return null;
  if (!job.acceptedBy) return null;
  const releasedId = job.acceptedBy.supplierId;
  const nextBusy = new Set(busyIds);
  nextBusy.add(releasedId);
  return startTaxiRing(
    {
      ...job,
      status: "ring_taxis",
      acceptedBy: null,
      remindedAt: null,
    },
    now,
    bindings,
    taxis,
    ringMs(),
    nextBusy,
  );
}

export function reminderDue(job: DispatchJob, now = new Date()) {
  if (job.status !== "assigned" || job.remindedAt || !job.acceptedBy) {
    return false;
  }
  const depart = Date.parse(job.departAt);
  const accepted = Date.parse(job.acceptedBy.at);
  if (!Number.isFinite(depart) || !Number.isFinite(accepted)) return false;
  if (depart - accepted <= REMINDER_LEAD_MS) return false;
  const nowMs = now.getTime();
  return (
    nowMs >= depart - REMINDER_LEAD_MS && nowMs < depart + 5 * 60 * 1000
  );
}

export function reminderWaitMs(job: DispatchJob, now = Date.now()) {
  if (job.status !== "assigned" || job.remindedAt || !job.acceptedBy) {
    return null;
  }
  const depart = Date.parse(job.departAt);
  const accepted = Date.parse(job.acceptedBy.at);
  if (!Number.isFinite(depart) || !Number.isFinite(accepted)) return null;
  if (depart - accepted <= REMINDER_LEAD_MS) return null;
  return depart - REMINDER_LEAD_MS - now;
}

export const UPCOMING_GRACE_MS = 3 * 60 * 60 * 1000;

export function upcomingAssignedJobs(
  jobs: readonly DispatchJob[],
  filter: {
    chatId?: string;
    kind?: OfferTarget["kind"];
    supplierId?: string;
  },
  now = new Date(),
) {
  const cutoff = now.getTime() - UPCOMING_GRACE_MS;
  return jobs
    .filter((job) => {
      if (!isLiveTrip(job.status) || !job.acceptedBy) return false;
      if (Date.parse(job.departAt) < cutoff) return false;
      const bySupplier =
        Boolean(filter.kind) &&
        Boolean(filter.supplierId) &&
        job.acceptedBy.kind === filter.kind &&
        job.acceptedBy.supplierId === filter.supplierId;
      const byChat =
        Boolean(filter.chatId) &&
        job.offers.some(
          (offer) =>
            offer.status === "accepted" && offer.chatId === filter.chatId,
        );
      return bySupplier || byChat;
    })
    .sort((a, b) => a.departAt.localeCompare(b.departAt));
}

export function isBookerActive(status: DispatchJob["status"]) {
  return (
    status === "ring_taxis" ||
    status === "ring_companies" ||
    status === "hold" ||
    isLiveTrip(status)
  );
}

export function upcomingBookerJobs(
  jobs: readonly DispatchJob[],
  filter: { chatId: string; channel?: DispatchJob["channel"] },
  now = new Date(),
) {
  const cutoff = now.getTime() - UPCOMING_GRACE_MS;
  return jobs
    .filter((job) => {
      if (job.bookerChatId !== filter.chatId) return false;
      if (filter.channel && job.channel !== filter.channel) return false;
      if (!isBookerActive(job.status)) return false;
      if (isLiveTrip(job.status) && Date.parse(job.departAt) < cutoff) {
        return false;
      }
      return true;
    })
    .sort((a, b) => a.departAt.localeCompare(b.departAt));
}
