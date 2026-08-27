import type {
  ChatButton,
  ChatChannel,
  OutboundMessage,
  StaffBinding,
  WhatsAppNotice,
} from "../dispatch/types";
import { staffForChat } from "../dispatch/store";
import {
  isStaffSessionOpen,
  isWhatsAppWindowOpen,
} from "../dispatch/staff-session";
import { t } from "./messages";
import { resolveLocale } from "./locale";

const GRAPH = "https://graph.facebook.com";
const GRAPH_VERSION = process.env.WHATSAPP_GRAPH_VERSION?.trim() || "v21.0";
const REPLY_BUTTON_LIMIT = 3;
const REPLY_TITLE = 20;
const LIST_TITLE = 24;
const LIST_ROWS = 10;
const BODY_LIMIT = 1024;
const PARAM_LIMIT = 1024;
const BUTTON_PAYLOAD_LIMIT = 128;

const TEMPLATE_NAMES: Record<WhatsAppNotice, string> = {
  cancel: "ride_cancelled",
  reminder: "ride_reminder",
  offer: "ride_offer",
  assigned: "ride_assigned",
  unfilled: "ride_unfilled",
  trip: "ride_update",
};

const TEMPLATE_ENV: Record<WhatsAppNotice, string> = {
  cancel: "WHATSAPP_TEMPLATE_CANCEL",
  reminder: "WHATSAPP_TEMPLATE_REMINDER",
  offer: "WHATSAPP_TEMPLATE_OFFER",
  assigned: "WHATSAPP_TEMPLATE_ASSIGNED",
  unfilled: "WHATSAPP_TEMPLATE_UNFILLED",
  trip: "WHATSAPP_TEMPLATE_TRIP",
};

export function isWhatsAppConfigured() {
  return Boolean(
    process.env.WHATSAPP_ACCESS_TOKEN?.trim() &&
      process.env.WHATSAPP_PHONE_NUMBER_ID?.trim(),
  );
}

function clip(value: string, max: number) {
  const trimmed = value.trim();
  if (trimmed.length <= max) return trimmed;
  return `${trimmed.slice(0, max - 1)}…`;
}

function digits(chatId: string) {
  return chatId.replace(/\D/g, "") || chatId;
}

function templateParam(value: string) {
  return clip(value.replace(/\s+/g, " "), PARAM_LIMIT) || "-";
}

function withPrompt(message: OutboundMessage) {
  const msg = t(resolveLocale(message.locale));
  const extra = [
    message.requestLocation ? msg.sendLocation : "",
    message.requestContact ? msg.sendContact : "",
  ].filter(Boolean);
  if (!extra.length) return message.text;
  return `${message.text}\n\n${extra.join("\n")}`;
}

function replyButtons(buttons: ChatButton[]) {
  return buttons.map((button) => ({
    type: "reply" as const,
    reply: {
      id: button.id.slice(0, 256),
      title: clip(button.label, REPLY_TITLE),
    },
  }));
}

function listRows(buttons: ChatButton[]) {
  return buttons.slice(0, LIST_ROWS).map((button) => ({
    id: button.id.slice(0, 200),
    title: clip(button.label, LIST_TITLE),
  }));
}

export function outboundToWhatsApp(message: OutboundMessage) {
  const to = digits(message.chatId);
  const body = withPrompt(message).slice(0, BODY_LIMIT);
  const buttons = (message.buttons ?? []).flat();
  if (buttons.length === 0) {
    return {
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body },
    };
  }
  if (buttons.length <= REPLY_BUTTON_LIMIT) {
    return {
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: { buttons: replyButtons(buttons) },
      },
    };
  }
  return {
    messaging_product: "whatsapp",
    to,
    type: "interactive",
    interactive: {
      type: "list",
      body: { text: body },
      action: {
        button: t(resolveLocale(message.locale)).choose,
        sections: [
          {
            title: t(resolveLocale(message.locale)).options,
            rows: listRows(buttons),
          },
        ],
      },
    },
  };
}

export function noticeTemplateName(kind: WhatsAppNotice) {
  const fromEnv = process.env[TEMPLATE_ENV[kind]]?.trim();
  return fromEnv || TEMPLATE_NAMES[kind];
}

export function shouldSendWhatsAppTemplate(
  message: OutboundMessage,
  staff: StaffBinding | null,
  now: Date = new Date(),
) {
  if (!message.notice) return false;
  if (staff) return !isStaffSessionOpen(staff, now);
  return !isWhatsAppWindowOpen(message.customerAt, now);
}

export function outboundNoticeToWhatsApp(message: OutboundMessage) {
  if (!message.notice) return null;
  const params = (message.templateParams?.length
    ? message.templateParams
    : [message.text]
  ).map(templateParam);
  const components: {
    type: string;
    sub_type?: string;
    index?: string;
    parameters: { type: "text" | "payload"; text?: string; payload?: string }[];
  }[] = [
    {
      type: "body",
      parameters: params.map((text) => ({ type: "text" as const, text })),
    },
  ];
  if (message.notice === "offer") {
    const buttons = (message.buttons ?? []).flat().slice(0, REPLY_BUTTON_LIMIT);
    buttons.forEach((button, index) => {
      components.push({
        type: "button",
        sub_type: "quick_reply",
        index: String(index),
        parameters: [
          {
            type: "payload",
            payload: clip(button.id, BUTTON_PAYLOAD_LIMIT),
          },
        ],
      });
    });
  }
  return {
    messaging_product: "whatsapp",
    to: digits(message.chatId),
    type: "template",
    template: {
      name: noticeTemplateName(message.notice),
      language: { code: resolveLocale(message.locale) },
      components,
    },
  };
}

async function payloadFor(message: OutboundMessage) {
  if (message.notice) {
    const staff = await staffForChat("whatsapp", digits(message.chatId));
    if (shouldSendWhatsAppTemplate(message, staff)) {
      const template = outboundNoticeToWhatsApp(message);
      if (template) return template;
    }
  }
  return outboundToWhatsApp(message);
}

export function whatsappChannel(): ChatChannel {
  return {
    name: "whatsapp",
    async send(message) {
      const token = process.env.WHATSAPP_ACCESS_TOKEN?.trim();
      const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID?.trim();
      if (!token || !phoneNumberId) {
        throw new Error(
          "WhatsApp Cloud API is not configured (WHATSAPP_ACCESS_TOKEN, WHATSAPP_PHONE_NUMBER_ID).",
        );
      }
      const response = await fetch(
        `${GRAPH}/${GRAPH_VERSION}/${phoneNumberId}/messages`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(await payloadFor(message)),
        },
      );
      if (!response.ok) {
        const detail = await response.text();
        throw new Error(`WhatsApp send failed (${response.status}): ${detail}`);
      }
    },
  };
}

