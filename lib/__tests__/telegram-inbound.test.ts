import { describe, expect, it } from "vitest";
import { inboundFromTelegram } from "../chat/telegram-update";
import { dayButtonLabel, parseDepartTime, parseTimeOnDay } from "../chat/booker";
import { datetimeLocalInStBarth } from "../format";

describe("telegram updates", () => {
  it("maps a location pin", () => {
    const inbound = inboundFromTelegram({
      message: {
        chat: { id: 99 },
        from: { id: 1 },
        location: { latitude: 17.9, longitude: -62.85 },
      },
    });
    expect(inbound?.location).toEqual({ lat: 17.9, lng: -62.85 });
  });

  it("maps a shared contact with the Telegram user id", () => {
    const inbound = inboundFromTelegram({
      message: {
        chat: { id: 99 },
        from: { id: 99 },
        contact: {
          phone_number: "+14385437295",
          first_name: "Mathis",
          user_id: 99,
        },
      },
    });
    expect(inbound?.contact).toEqual({
      phone: "+14385437295",
      name: "Mathis",
      userId: "99",
    });
  });

  it("maps an inline button", () => {
    const inbound = inboundFromTelegram({
      callback_query: {
        id: "cb",
        from: { id: 1 },
        data: "a:aaaaaaaa:any-taxi",
        message: { chat: { id: 99 } },
      },
    });
    expect(inbound?.buttonId).toBe("a:aaaaaaaa:any-taxi");
    expect(inbound?.callbackId).toBe("cb");
    expect(inbound?.locale).toBeUndefined();
  });
});

describe("depart time", () => {
  const now = new Date("2026-08-26T12:00:00.000Z");

  it("parses 21h00 in Saint-Barth", () => {
    const at = parseDepartTime("21h00", now);
    expect(at).not.toBeNull();
    expect(at!.getTime()).toBeGreaterThan(now.getTime());
  });

  it("parses tomorrow and a later calendar day", () => {
    const tomorrow = parseDepartTime("demain 10h", now);
    expect(datetimeLocalInStBarth(tomorrow!).slice(0, 16)).toBe(
      "2026-08-27T10:00",
    );
    const dated = parseDepartTime("28/08 14:30", now);
    expect(datetimeLocalInStBarth(dated!).slice(0, 16)).toBe("2026-08-28T14:30");
    const named = parseDepartTime("28 août 9h", now);
    expect(datetimeLocalInStBarth(named!).slice(0, 16)).toBe("2026-08-28T09:00");
  });

  it("labels today and tomorrow for the date picker", () => {
    expect(dayButtonLabel("2026-08-26", "2026-08-26")).toBe("Aujourd’hui");
    expect(dayButtonLabel("2026-08-27", "2026-08-26")).toBe("Demain");
    expect(dayButtonLabel("2026-08-26", "2026-08-26", "en")).toBe("Today");
  });

  it("applies a typed time to a chosen day", () => {
    const at = parseTimeOnDay("14:30", "2026-08-28", now);
    expect(datetimeLocalInStBarth(at!).slice(0, 16)).toBe("2026-08-28T14:30");
    expect(
      datetimeLocalInStBarth(parseTimeOnDay("21", "2026-08-28", now)!).slice(
        0,
        16,
      ),
    ).toBe("2026-08-28T21:00");
    expect(parseTimeOnDay("7h00", "2026-08-26", now)).toBeNull();
    expect(parseTimeOnDay("demain 10h", "2026-08-28", now)).toBeNull();
  });
});
