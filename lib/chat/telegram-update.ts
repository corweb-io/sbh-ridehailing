import type { InboundMessage } from "../dispatch/types";

type TelegramChat = { id: number | string };
type TelegramUser = { id: number | string; language_code?: string };

export type TelegramUpdate = {
  message?: {
    chat: TelegramChat;
    from?: TelegramUser;
    text?: string;
    location?: { latitude: number; longitude: number };
    contact?: { phone_number: string; first_name?: string; user_id?: number | string };
  };
  callback_query?: {
    id: string;
    from: TelegramUser;
    data?: string;
    message?: { chat: TelegramChat };
  };
};

export function inboundFromTelegram(update: TelegramUpdate): InboundMessage | null {
  if (update.callback_query?.message) {
    const chatId = String(update.callback_query.message.chat.id);
    return {
      channel: "telegram",
      chatId,
      fromId: String(update.callback_query.from.id),
      buttonId: update.callback_query.data,
      callbackId: update.callback_query.id,
      locale: update.callback_query.from.language_code,
    };
  }
  const message = update.message;
  if (!message) return null;
  return {
    channel: "telegram",
    chatId: String(message.chat.id),
    fromId: String(message.from?.id ?? message.chat.id),
    text: message.text,
    locale: message.from?.language_code,
    location: message.location
      ? { lat: message.location.latitude, lng: message.location.longitude }
      : undefined,
    contact: message.contact
      ? {
          phone: message.contact.phone_number,
          name: message.contact.first_name,
          userId:
            message.contact.user_id != null
              ? String(message.contact.user_id)
              : undefined,
        }
      : undefined,
  };
}
