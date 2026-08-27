import type { InboundMessage } from "../dispatch/types";

type WhatsAppText = { body?: string };
type WhatsAppLocation = { latitude?: number; longitude?: number };
type WhatsAppInteractive = {
  type?: string;
  button_reply?: { id?: string; title?: string };
  list_reply?: { id?: string; title?: string };
};
type WhatsAppContact = {
  name?: { formatted_name?: string; first_name?: string };
  phones?: { phone?: string; wa_id?: string }[];
};
type WhatsAppButton = { payload?: string; text?: string };

export type WhatsAppIncomingMessage = {
  from?: string;
  type?: string;
  text?: WhatsAppText;
  location?: WhatsAppLocation;
  interactive?: WhatsAppInteractive;
  contacts?: WhatsAppContact[];
  button?: WhatsAppButton;
};

export type WhatsAppWebhook = {
  entry?: {
    changes?: {
      value?: {
        messages?: WhatsAppIncomingMessage[];
      };
    }[];
  }[];
};

function chatIdFrom(from: string) {
  return from.replace(/\D/g, "") || from;
}

export function inboundFromWhatsAppMessage(
  message: WhatsAppIncomingMessage,
): InboundMessage | null {
  const from = message.from?.trim();
  if (!from) return null;
  const chatId = chatIdFrom(from);
  const base: InboundMessage = {
    channel: "whatsapp",
    chatId,
    fromId: chatId,
  };

  if (message.type === "interactive") {
    const id =
      message.interactive?.button_reply?.id ??
      message.interactive?.list_reply?.id;
    if (!id) return null;
    return { ...base, buttonId: id };
  }

  if (message.type === "button" && message.button?.payload) {
    return { ...base, buttonId: message.button.payload };
  }

  if (message.location?.latitude != null && message.location.longitude != null) {
    return {
      ...base,
      location: {
        lat: message.location.latitude,
        lng: message.location.longitude,
      },
    };
  }

  if (message.contacts?.[0]) {
    const card = message.contacts[0];
    const phone = card.phones?.[0]?.phone ?? card.phones?.[0]?.wa_id;
    if (!phone) return null;
    return {
      ...base,
      contact: {
        phone,
        name: card.name?.formatted_name ?? card.name?.first_name,
      },
    };
  }

  const text = message.text?.body?.trim();
  if (text) return { ...base, text };
  return null;
}

export function inboundsFromWhatsApp(body: WhatsAppWebhook): InboundMessage[] {
  const inbound: InboundMessage[] = [];
  for (const entry of body.entry ?? []) {
    for (const change of entry.changes ?? []) {
      for (const message of change.value?.messages ?? []) {
        const mapped = inboundFromWhatsAppMessage(message);
        if (mapped) inbound.push(mapped);
      }
    }
  }
  return inbound;
}
