import type { ChatChannel, OutboundMessage } from "../dispatch/types";
import { t } from "./messages";
import { resolveLocale } from "./locale";

const API = "https://api.telegram.org";

type TelegramResponse = {
  ok: boolean;
  description?: string;
};

async function telegramCall(method: string, body: unknown) {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  if (!token) {
    throw new Error("TELEGRAM_BOT_TOKEN is not set.");
  }
  const response = await fetch(`${API}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = (await response.json()) as TelegramResponse;
  if (!json.ok) {
    throw new Error(json.description ?? `Telegram ${method} failed`);
  }
}

function replyMarkup(message: OutboundMessage) {
  const msg = t(resolveLocale(message.locale));
  if (message.buttons?.length) {
    return {
      inline_keyboard: message.buttons.map((row) =>
        row.map((button) => ({
          text: button.label.slice(0, 64),
          callback_data: button.id.slice(0, 64),
        })),
      ),
    };
  }
  if (message.requestLocation || message.requestContact) {
    const button = message.requestLocation
      ? { text: msg.shareLocation, request_location: true }
      : { text: msg.shareContact, request_contact: true };
    return {
      keyboard: [[button], [{ text: msg.cancel }]],
      one_time_keyboard: true,
      resize_keyboard: true,
    };
  }
  if (message.removeKeyboard) {
    return { remove_keyboard: true };
  }
  return undefined;
}

export function telegramChannel(): ChatChannel {
  return {
    name: "telegram",
    async send(message) {
      await telegramCall("sendMessage", {
        chat_id: message.chatId,
        text: message.text,
        reply_markup: replyMarkup(message),
      });
    },
    async ack(callbackId) {
      await telegramCall("answerCallbackQuery", { callback_query_id: callbackId });
    },
  };
}

export function isTelegramConfigured() {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN?.trim());
}
