import type { DispatchChannel, OfferTarget, StaffBinding } from "./types";

/** Meta’s customer-service window is 24h; leave a margin so we never send after it closed. */
export const WHATSAPP_SESSION_MS = 23 * 60 * 60 * 1000;
/** Nudge while the session is still open, a few hours before it closes. */
export const SESSION_NUDGE_LEAD_MS = 3 * 60 * 60 * 1000;

export function staffLastInboundAt(staff: Pick<StaffBinding, "boundAt" | "lastInboundAt">) {
  return staff.lastInboundAt ?? staff.boundAt;
}

export function isStaffOnDuty(staff: Pick<StaffBinding, "onDuty">) {
  return staff.onDuty !== false;
}

export function isWhatsAppWindowOpen(
  lastInboundAt: string | null | undefined,
  now: Date = new Date(),
) {
  const last = Date.parse(lastInboundAt ?? "");
  if (!Number.isFinite(last)) return false;
  return now.getTime() - last < WHATSAPP_SESSION_MS;
}

export function isStaffSessionOpen(
  staff: StaffBinding,
  now: Date = new Date(),
) {
  if (staff.channel !== "whatsapp") return true;
  return isWhatsAppWindowOpen(staffLastInboundAt(staff), now);
}

export function canOfferToSupplier(
  bindings: readonly StaffBinding[],
  kind: OfferTarget["kind"],
  supplierId: string,
  now: Date = new Date(),
  channel?: DispatchChannel,
) {
  const bound = bindings.find(
    (binding) =>
      binding.kind === kind &&
      binding.supplierId === supplierId &&
      (channel == null || binding.channel === channel),
  );
  if (!bound) return false;
  return isStaffOnDuty(bound);
}

export function sessionNudgeDue(staff: StaffBinding, now: Date = new Date()) {
  if (staff.channel !== "whatsapp" || !isStaffOnDuty(staff) || staff.sessionNudgedAt) {
    return false;
  }
  if (!isStaffSessionOpen(staff, now)) return false;
  const last = Date.parse(staffLastInboundAt(staff));
  if (!Number.isFinite(last)) return false;
  return now.getTime() >= last + (WHATSAPP_SESSION_MS - SESSION_NUDGE_LEAD_MS);
}

export function sessionNudgeWaitMs(staff: StaffBinding, now = Date.now()) {
  if (staff.channel !== "whatsapp" || !isStaffOnDuty(staff) || staff.sessionNudgedAt) {
    return null;
  }
  const last = Date.parse(staffLastInboundAt(staff));
  if (!Number.isFinite(last)) return null;
  const closesAt = last + WHATSAPP_SESSION_MS;
  if (now >= closesAt) return null;
  return last + (WHATSAPP_SESSION_MS - SESSION_NUDGE_LEAD_MS) - now;
}
