import { describe, expect, it } from "vitest";
import { inboundFromTelegram } from "../chat/telegram-update";
import {
  isLangMenuRequest,
  isStartIntent,
  parseLangChoice,
  parseLocale,
  resolveLocale,
} from "../chat/locale";
import { t } from "../chat/messages";
import {
  DUTY_OFF_ID,
  MENU_LANG_ID,
  isMenuIntent,
  isUnknownSlashCommand,
  menuButtons,
  menuText,
} from "../chat/menu";
import { outboundToWhatsApp } from "../chat/whatsapp";
import { dayButtonLabel, parseDepartTime } from "../chat/booker";
import { bookerQuoteText } from "../dispatch/copy";
import { datetimeLocalInStBarth } from "../format";
import type { DispatchJob, StaffBinding } from "../dispatch/types";
import type { QuoteResult } from "../types";

describe("chat locale", () => {
  it("maps language tags to fr or en", () => {
    expect(parseLocale("en-US")).toBe("en");
    expect(parseLocale("fr_FR")).toBe("fr");
    expect(parseLocale("de")).toBeNull();
    expect(resolveLocale("de")).toBe("fr");
  });

  it("reads /en, /fr and lang buttons", () => {
    expect(
      parseLangChoice({
        channel: "whatsapp",
        chatId: "1",
        fromId: "1",
        buttonId: "lang:en",
      }),
    ).toBe("en");
    expect(
      parseLangChoice({
        channel: "telegram",
        chatId: "1",
        fromId: "1",
        text: "/fr",
      }),
    ).toBe("fr");
    expect(
      isLangMenuRequest({
        channel: "whatsapp",
        chatId: "1",
        fromId: "1",
        text: "/lang",
      }),
    ).toBe(true);
  });
});

describe("telegram language_code", () => {
  it("forwards the device language on messages and buttons", () => {
    expect(
      inboundFromTelegram({
        message: {
          chat: { id: 99 },
          from: { id: 1, language_code: "en" },
          text: "/start",
        },
      })?.locale,
    ).toBe("en");
    expect(
      inboundFromTelegram({
        callback_query: {
          id: "cb",
          from: { id: 1, language_code: "fr" },
          data: "go",
          message: { chat: { id: 99 } },
        },
      })?.locale,
    ).toBe("fr");
  });
});

describe("english booker copy", () => {
  it("labels today/tomorrow in English", () => {
    expect(dayButtonLabel("2026-08-26", "2026-08-26", "en")).toBe("Today");
    expect(dayButtonLabel("2026-08-27", "2026-08-26", "en")).toBe("Tomorrow");
  });

  it("parses tomorrow in English", () => {
    const now = new Date("2026-08-26T12:00:00.000Z");
    const at = parseDepartTime("tomorrow 10h", now);
    expect(datetimeLocalInStBarth(at!).slice(0, 16)).toBe("2026-08-27T10:00");
  });

  it("renders the quote recap in English", () => {
    const quote: QuoteResult = {
      zoneFrom: "gustavia",
      zoneTo: "saint-jean",
      fareBand: "day",
      daytimeFare: 45,
      surcharge: 0,
      fare: 45,
      distanceKm: 3,
      durationMinutes: 10,
      route: [],
      departAt: "2026-08-26T16:00:00.000Z",
    };
    const job = {
      pickup: { name: "Gustavia", address: "Gustavia", lat: 17.9, lng: -62.85 },
      dropoff: { name: "Eden Rock", address: "Saint-Jean", lat: 17.9, lng: -62.83 },
      departAt: "2026-08-26T16:00:00.000Z",
      pax: 2,
      passengerPhone: "+590690000000",
      quote,
    } as Pick<
      DispatchJob,
      "pickup" | "dropoff" | "departAt" | "pax" | "quote" | "passengerPhone"
    >;
    const text = bookerQuoteText(job, "en");
    expect(text).toContain("Summary");
    expect(text).toContain("Pickup");
    expect(text).toContain("Tap Confirm");
    expect(text).not.toContain("Récapitulatif");
  });
});

describe("whatsapp outbound locale", () => {
  it("uses Choose on English list messages", () => {
    const payload = outboundToWhatsApp({
      chatId: "590690000000",
      locale: "en",
      text: "Where to?",
      buttons: [
        [
          { id: "d:0", label: "Gustavia" },
          { id: "d:1", label: "Saint-Jean" },
        ],
        [
          { id: "d:2", label: "Lorient" },
          { id: "d:3", label: "Flamands" },
        ],
      ],
    });
    const interactive = (
      payload as {
        interactive: { action: { button: string; sections: { title: string }[] } };
      }
    ).interactive;
    expect(interactive.action.button).toBe(t("en").choose);
    expect(interactive.action.sections[0].title).toBe(t("en").options);
  });
});

const baseInbound = {
  channel: "telegram" as const,
  chatId: "1",
  fromId: "1",
};

describe("role menu", () => {
  it("treats /aide, /start and unknown slash commands as menu", () => {
    expect(isMenuIntent({ ...baseInbound, text: "/aide" })).toBe(true);
    expect(isMenuIntent({ ...baseInbound, text: "/aide@ride_sbh_bot" })).toBe(
      true,
    );
    expect(isMenuIntent({ ...baseInbound, text: "help" })).toBe(true);
    expect(isMenuIntent({ ...baseInbound, text: "/start" })).toBe(true);
    expect(isStartIntent({ ...baseInbound, text: "/start" })).toBe(false);
    expect(isStartIntent({ ...baseInbound, buttonId: "go" })).toBe(true);
    expect(isUnknownSlashCommand({ ...baseInbound, text: "/asdf" })).toBe(true);
    expect(isUnknownSlashCommand({ ...baseInbound, text: "/taxi" })).toBe(false);
    expect(isLangMenuRequest({ ...baseInbound, buttonId: MENU_LANG_ID })).toBe(
      true,
    );
  });

  it("shows book, rides and language for a guest", () => {
    const ids = menuButtons("fr", { staff: null, booking: false })
      .flat()
      .map((button) => button.id);
    expect(ids).toEqual(["go", "courses", MENU_LANG_ID]);
    expect(menuText("fr", { channel: "telegram", staff: null, booking: false }))
      .toContain("Choisissez une action");
  });

  it("adds duty for a driver and cancel while a booking is open", () => {
    const staff: StaffBinding = {
      channel: "telegram",
      chatId: "1",
      kind: "taxi",
      supplierId: "taxi-test",
      boundAt: "2026-08-27T00:00:00.000Z",
      onDuty: true,
    };
    const ids = menuButtons("fr", { staff, booking: true })
      .flat()
      .map((button) => button.id);
    expect(ids).toEqual(["go", "courses", DUTY_OFF_ID, MENU_LANG_ID, "x"]);
    expect(
      menuText("fr", { channel: "telegram", staff, booking: true }),
    ).toContain("Annuler pour en sortir");
  });

  it("uses a WhatsApp list when the driver menu has more than three actions", () => {
    const staff: StaffBinding = {
      channel: "whatsapp",
      chatId: "14385437295",
      kind: "taxi",
      supplierId: "taxi-test",
      boundAt: "2026-08-27T00:00:00.000Z",
      onDuty: true,
    };
    const payload = outboundToWhatsApp({
      chatId: staff.chatId,
      locale: "fr",
      text: "Menu",
      buttons: menuButtons("fr", { staff, booking: false }),
    });
    expect(
      (payload as { interactive: { type: string } }).interactive.type,
    ).toBe("list");
  });
});
