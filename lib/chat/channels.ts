import type { ChatChannel, DispatchChannel } from "../dispatch/types";
import { isTelegramConfigured, telegramChannel } from "./telegram";
import { isWhatsAppConfigured, whatsappChannel } from "./whatsapp";

export function isChannelConfigured(name: DispatchChannel) {
  if (name === "whatsapp") return isWhatsAppConfigured();
  return isTelegramConfigured();
}

export function channelFor(name: DispatchChannel): ChatChannel {
  return name === "whatsapp" ? whatsappChannel() : telegramChannel();
}

export function channelOrNull(name: DispatchChannel): ChatChannel | null {
  if (!isChannelConfigured(name)) return null;
  return channelFor(name);
}
