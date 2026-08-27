import { describe, expect, it } from "vitest";
import { staffIdentityFromChatId, staffIdentityFromInbound } from "../dispatch/identity";
import { LICENSED_TAXIS } from "../licensed-taxis";
import { phoneLabel, sameWhatsAppId } from "../phone";

describe("test driver phone", () => {
  const taxi = LICENSED_TAXIS.find((item) => item.id === "taxi-test");

  it("is on the roster with Mathis’s WhatsApp", () => {
    expect(taxi?.name).toBe("LEFRANC Mathis");
    expect(taxi?.phone).toBe("+14385437295");
    expect(phoneLabel(taxi!.phone)).toBe("+1 438 543 7295");
  });

  it("binds that WhatsApp chat as taxi-test", () => {
    expect(sameWhatsAppId("14385437295", "+1 438 543 7295")).toBe(true);
    expect(staffIdentityFromChatId("14385437295")).toEqual({
      kind: "taxi",
      supplierId: "taxi-test",
    });
    expect(staffIdentityFromChatId("4385437295")).toEqual({
      kind: "taxi",
      supplierId: "taxi-test",
    });
  });

  it("binds a Telegram chat after that number is shared as your contact", () => {
    expect(
      staffIdentityFromInbound({
        chatId: "999001",
        fromId: "999001",
        contact: { phone: "+1 438 543 7295", userId: "999001" },
      }),
    ).toEqual({ kind: "taxi", supplierId: "taxi-test" });
    expect(
      staffIdentityFromInbound({
        chatId: "999001",
        fromId: "999001",
        contact: { phone: "+1 438 543 7295", userId: "someone-else" },
      }),
    ).toBeNull();
  });

  it("binds a Telegram chat when that number is typed", () => {
    expect(
      staffIdentityFromInbound({
        chatId: "999001",
        fromId: "999001",
        text: "+1 438 543 7295",
      }),
    ).toEqual({ kind: "taxi", supplierId: "taxi-test" });
  });
});
