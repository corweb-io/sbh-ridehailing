import { describe, expect, it } from "vitest";
import {
  outboundNoticeToWhatsApp,
  outboundToWhatsApp,
  shouldSendWhatsAppTemplate,
} from "../chat/whatsapp";
import { inboundFromWhatsAppMessage, inboundsFromWhatsApp } from "../chat/whatsapp-update";

describe("whatsapp inbound", () => {
  it("maps a location pin", () => {
    const inbound = inboundFromWhatsAppMessage({
      from: "+590690000000",
      type: "location",
      location: { latitude: 17.9, longitude: -62.85 },
    });
    expect(inbound?.channel).toBe("whatsapp");
    expect(inbound?.chatId).toBe("590690000000");
    expect(inbound?.location).toEqual({ lat: 17.9, lng: -62.85 });
  });

  it("maps reply and list buttons to the same buttonId the booker uses", () => {
    expect(
      inboundFromWhatsAppMessage({
        from: "590690000000",
        type: "interactive",
        interactive: {
          type: "button_reply",
          button_reply: { id: "a:aaaaaaaa:any-taxi", title: "Accepter" },
        },
      })?.buttonId,
    ).toBe("a:aaaaaaaa:any-taxi");
    expect(
      inboundFromWhatsAppMessage({
        from: "590690000000",
        type: "interactive",
        interactive: {
          type: "list_reply",
          list_reply: { id: "p:0", title: "Aéroport" },
        },
      })?.buttonId,
    ).toBe("p:0");
  });

  it("maps a shared contact", () => {
    const inbound = inboundFromWhatsAppMessage({
      from: "590690000000",
      type: "contacts",
      contacts: [
        {
          name: { formatted_name: "Client" },
          phones: [{ phone: "+590690111111" }],
        },
      ],
    });
    expect(inbound?.contact).toEqual({ phone: "+590690111111", name: "Client" });
  });

  it("maps a utility-template quick reply to the same buttonId", () => {
    expect(
      inboundFromWhatsAppMessage({
        from: "590690000000",
        type: "button",
        button: { payload: "a:aaaaaaaa:taxi-01", text: "Accepter" },
      })?.buttonId,
    ).toBe("a:aaaaaaaa:taxi-01");
  });

  it("ignores delivery receipts", () => {
    expect(inboundsFromWhatsApp({ entry: [{ changes: [{ value: {} }] }] })).toEqual(
      [],
    );
  });
});

describe("whatsapp outbound", () => {
  it("uses reply buttons when there are at most three choices", () => {
    const payload = outboundToWhatsApp({
      chatId: "+590690000000",
      text: "Quand ?",
      buttons: [
        [{ id: "when:now", label: "Maintenant" }],
        [{ id: "when:today", label: "Plus tard aujourd’hui" }],
        [{ id: "when:otherday", label: "Un autre jour" }],
      ],
    });
    expect(payload.type).toBe("interactive");
    expect(
      (payload as { interactive: { type: string } }).interactive.type,
    ).toBe("button");
  });

  it("uses a list when the booker sends more than three choices", () => {
    const payload = outboundToWhatsApp({
      chatId: "590690000000",
      text: "Où va-t-on ?",
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
    expect(
      (payload as { interactive: { type: string } }).interactive.type,
    ).toBe("list");
  });

  it("maps cancellations and reminders to utility templates", () => {
    const cancel = outboundNoticeToWhatsApp({
      chatId: "+590690000000",
      text: "Course annulée : Gustavia → Eden Rock.",
      locale: "fr",
      notice: "cancel",
      templateParams: ["Gustavia → Eden Rock"],
    });
    expect(cancel).toMatchObject({
      type: "template",
      template: {
        name: "ride_cancelled",
        language: { code: "fr" },
        components: [
          {
            type: "body",
            parameters: [{ type: "text", text: "Gustavia → Eden Rock" }],
          },
        ],
      },
    });
    const reminder = outboundNoticeToWhatsApp({
      chatId: "590690000000",
      text: "Rappel",
      locale: "en",
      notice: "reminder",
      templateParams: ["Gustavia → Eden Rock", "tomorrow 10:00", "+590690111"],
    });
    expect(reminder?.template.name).toBe("ride_reminder");
    expect(reminder?.template.language.code).toBe("en");
    expect(reminder?.template.components[0].parameters).toHaveLength(3);
  });

  it("maps a new offer to a utility template with accept/decline payloads", () => {
    const offer = outboundNoticeToWhatsApp({
      chatId: "590690000001",
      text: "Nouvelle course",
      locale: "fr",
      notice: "offer",
      templateParams: ["Gustavia → Aéroport", "2 passagers", "Maintenant"],
      buttons: [
        [
          { id: "a:aaaaaaaa:taxi-01", label: "Accepter" },
          { id: "n:aaaaaaaa:taxi-01", label: "Refuser" },
        ],
      ],
    });
    expect(offer?.template.name).toBe("ride_offer");
    expect(offer?.template.components).toEqual([
      {
        type: "body",
        parameters: [
          { type: "text", text: "Gustavia → Aéroport" },
          { type: "text", text: "2 passagers" },
          { type: "text", text: "Maintenant" },
        ],
      },
      {
        type: "button",
        sub_type: "quick_reply",
        index: "0",
        parameters: [{ type: "payload", payload: "a:aaaaaaaa:taxi-01" }],
      },
      {
        type: "button",
        sub_type: "quick_reply",
        index: "1",
        parameters: [{ type: "payload", payload: "n:aaaaaaaa:taxi-01" }],
      },
    ]);
  });

  it("maps booker trip updates to utility templates", () => {
    const assigned = outboundNoticeToWhatsApp({
      chatId: "590690000000",
      text: "Taxi confirmé",
      locale: "fr",
      notice: "assigned",
      templateParams: ["Gustavia → Eden Rock", "GUMBS Denis", "+590 690 65 88 85"],
    });
    expect(assigned?.template.name).toBe("ride_assigned");
    expect(assigned?.template.components[0].parameters).toHaveLength(3);
    const trip = outboundNoticeToWhatsApp({
      chatId: "590690000000",
      text: "En route",
      locale: "en",
      notice: "trip",
      templateParams: ["Gustavia → Eden Rock", "The taxi is on the way to pickup."],
    });
    expect(trip?.template.name).toBe("ride_update");
    const unfilled = outboundNoticeToWhatsApp({
      chatId: "590690000000",
      text: "Unfilled",
      notice: "unfilled",
      templateParams: ["Gustavia → Eden Rock"],
    });
    expect(unfilled?.template.name).toBe("ride_unfilled");
  });

  it("uses a template only when the WhatsApp customer window is closed", () => {
    const message = {
      chatId: "590690000000",
      text: "En route",
      notice: "trip" as const,
      customerAt: "2026-08-26T08:00:00.000Z",
    };
    const now = new Date("2026-08-26T10:00:00.000Z");
    expect(shouldSendWhatsAppTemplate(message, null, now)).toBe(false);
    expect(
      shouldSendWhatsAppTemplate(
        { ...message, customerAt: "2026-08-25T08:00:00.000Z" },
        null,
        now,
      ),
    ).toBe(true);
    expect(
      shouldSendWhatsAppTemplate(
        message,
        {
          channel: "whatsapp",
          chatId: "590690000000",
          kind: "taxi",
          supplierId: "taxi-01",
          boundAt: "2026-08-25T00:00:00.000Z",
          lastInboundAt: "2026-08-25T08:00:00.000Z",
          onDuty: true,
        },
        now,
      ),
    ).toBe(true);
  });
});
