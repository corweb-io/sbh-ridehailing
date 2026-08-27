import { describe, expect, it } from "vitest";
import {
  canOfferToSupplier,
  isStaffSessionOpen,
  sessionNudgeDue,
  sessionNudgeWaitMs,
  SESSION_NUDGE_LEAD_MS,
  WHATSAPP_SESSION_MS,
} from "../dispatch/staff-session";
import type { StaffBinding } from "../dispatch/types";

function staff(overrides: Partial<StaffBinding> = {}): StaffBinding {
  return {
    channel: "whatsapp",
    chatId: "590690000001",
    kind: "taxi",
    supplierId: "taxi-01",
    boundAt: "2026-08-26T08:00:00.000Z",
    lastInboundAt: "2026-08-26T08:00:00.000Z",
    onDuty: true,
    ...overrides,
  };
}

describe("staff WhatsApp session", () => {
  const now = new Date("2026-08-27T07:00:00.000Z");

  it("stays open inside 23 hours of last inbound", () => {
    expect(
      isStaffSessionOpen(staff({ lastInboundAt: "2026-08-26T09:00:00.000Z" }), now),
    ).toBe(true);
  });

  it("closes after 23 hours so we never send outside Meta’s window", () => {
    expect(
      isStaffSessionOpen(
        staff({ lastInboundAt: "2026-08-26T07:00:00.000Z" }),
        now,
      ),
    ).toBe(false);
    expect(WHATSAPP_SESSION_MS).toBe(23 * 60 * 60 * 1000);
  });

  it("does not gate Telegram drivers", () => {
    expect(
      isStaffSessionOpen(
        staff({
          channel: "telegram",
          lastInboundAt: "2026-08-01T00:00:00.000Z",
        }),
        now,
      ),
    ).toBe(true);
  });

  it("skips a bound WhatsApp driver with a closed session", () => {
    const bindings = [
      staff({ lastInboundAt: "2026-08-25T00:00:00.000Z" }),
    ];
    expect(canOfferToSupplier(bindings, "taxi", "taxi-01", now)).toBe(false);
    expect(canOfferToSupplier(bindings, "taxi", "taxi-02", now)).toBe(true);
  });

  it("skips a bound driver who is off duty", () => {
    const bindings = [staff({ onDuty: false })];
    expect(canOfferToSupplier(bindings, "taxi", "taxi-01", now)).toBe(false);
    expect(canOfferToSupplier(bindings, "taxi", "taxi-02", now)).toBe(true);
  });

  it("nudges an on-duty WhatsApp driver a few hours before the window closes", () => {
    const lastInboundAt = new Date(
      now.getTime() - (WHATSAPP_SESSION_MS - SESSION_NUDGE_LEAD_MS),
    ).toISOString();
    const due = staff({ lastInboundAt });
    expect(sessionNudgeDue(due, now)).toBe(true);
    expect(sessionNudgeWaitMs(due, now.getTime())).toBe(0);
    expect(
      sessionNudgeDue(staff({ lastInboundAt, onDuty: false }), now),
    ).toBe(false);
    expect(
      sessionNudgeDue(staff({ lastInboundAt, sessionNudgedAt: now.toISOString() }), now),
    ).toBe(false);
    expect(
      sessionNudgeDue(
        staff({ lastInboundAt, channel: "telegram" }),
        now,
      ),
    ).toBe(false);
  });

  it("does not nudge after the WhatsApp window has already closed", () => {
    expect(
      sessionNudgeDue(staff({ lastInboundAt: "2026-08-26T07:00:00.000Z" }), now),
    ).toBe(false);
    expect(
      sessionNudgeWaitMs(
        staff({ lastInboundAt: "2026-08-26T07:00:00.000Z" }),
        now.getTime(),
      ),
    ).toBeNull();
  });
});
