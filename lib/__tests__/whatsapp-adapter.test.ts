import { describe, expect, it } from "vitest";
import { outboundNoticeToWhatsApp, outboundToWhatsApp } from "../chat/whatsapp";
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
});
