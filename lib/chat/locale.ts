import {
  DEFAULT_CHAT_LOCALE,
  type ChatChannel,
  type ChatLocale,
  type InboundMessage,
} from "../dispatch/types";

export { DEFAULT_CHAT_LOCALE, type ChatLocale };

export function parseLocale(input?: string | null): ChatLocale | null {
  if (!input) return null;
  const code = input.trim().toLowerCase().split(/[-_]/)[0];
  if (code === "en" || code === "fr") return code;
  return null;
}

export function resolveLocale(input?: string | null): ChatLocale {
  return parseLocale(input) ?? DEFAULT_CHAT_LOCALE;
}

export function intlTag(locale: ChatLocale) {
  return locale === "en" ? "en-GB" : "fr-FR";
}

export function parseLangChoice(inbound: InboundMessage): ChatLocale | null {
  const button = inbound.buttonId?.match(/^lang:(fr|en)$/i);
  if (button) return button[1].toLowerCase() as ChatLocale;
  const text = inbound.text?.trim() ?? "";
  if (/^\/en\b/i.test(text)) return "en";
  if (/^\/fr\b/i.test(text)) return "fr";
  const command = text.match(/^\/lang(?:uage)?(?:\s+(\S+))$/i);
  if (command) return parseLocale(command[1]);
  return null;
}

export function isLangMenuRequest(inbound: InboundMessage) {
  if (inbound.buttonId === "menu:lang") return true;
  const text = inbound.text?.trim() ?? "";
  return /^\/lang(?:uage)?(?:@[\w_]+)?$/i.test(text);
}

export function isStartIntent(inbound: InboundMessage) {
  const text = inbound.text?.trim() ?? "";
  if (inbound.buttonId === "go") return true;
  return /^\/taxi(?:@[\w_]+)?$/i.test(text);
}

export function withLocale(channel: ChatChannel, locale: ChatLocale): ChatChannel {
  return {
    name: channel.name,
    send(message) {
      return channel.send({ ...message, locale: message.locale ?? locale });
    },
    ack: channel.ack ? (callbackId) => channel.ack!(callbackId) : undefined,
  };
}
