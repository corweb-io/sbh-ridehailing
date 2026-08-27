import { companyOfferText, taxiOfferText } from "../dispatch/copy";
import { jobCallbackId, localeForChat } from "../dispatch/store";
import type { ChatChannel, DispatchJob, OfferTarget } from "../dispatch/types";
import { t } from "./messages";
import { resolveLocale } from "./locale";

function chunkByChat(offers: OfferTarget[]) {
  const groups = new Map<string, OfferTarget[]>();
  for (const offer of offers) {
    const chatId = offer.chatId ?? "";
    const list = groups.get(chatId) ?? [];
    list.push(offer);
    groups.set(chatId, list);
  }
  return groups;
}

export async function notifyRing(
  channel: ChatChannel,
  job: DispatchJob,
  onlyChatId?: string,
) {
  const kind = job.status === "ring_taxis" ? "taxi" : "company";
  const pending = job.offers.filter(
    (offer) =>
      offer.kind === kind &&
      offer.status === "pending" &&
      offer.chatId &&
      (onlyChatId == null || offer.chatId === onlyChatId),
  );
  const shortId = jobCallbackId(job.id);
  const loopback =
    pending.length > 0 &&
    pending.every((offer) => offer.chatId === job.bookerChatId);
  const outgoing = loopback ? pending.slice(0, 1) : pending;
  const bookerLocale = resolveLocale(job.bookerLocale);

  for (const [chatId, offers] of chunkByChat(outgoing)) {
    const offer = offers[0];
    const locale =
      chatId === job.bookerChatId
        ? bookerLocale
        : await localeForChat(channel.name, chatId);
    const copy = t(locale);
    const text =
      kind === "taxi"
        ? taxiOfferText(job, offer.supplierId, locale)
        : companyOfferText(job, offer.supplierId, locale);
    const remaining = loopback ? pending.length : offers.length;
    const extra = loopback ? copy.loopbackExtra(remaining, kind) : "";
    await channel.send({
      chatId,
      locale,
      text: text + extra,
      buttons: [
        [
          { id: `a:${shortId}:${offer.supplierId}`, label: copy.accept },
          { id: `n:${shortId}:${offer.supplierId}`, label: copy.decline },
        ],
      ],
    });
  }
}

export async function notifyTaken(
  channel: ChatChannel,
  job: DispatchJob,
  exceptChatId?: string,
) {
  const chats = new Set(
    job.offers
      .filter((offer) => offer.status === "taken" && offer.chatId)
      .map((offer) => offer.chatId as string),
  );
  chats.delete(job.bookerChatId);
  if (exceptChatId) chats.delete(exceptChatId);
  await Promise.all(
    [...chats].map(async (chatId) => {
      const locale = await localeForChat(channel.name, chatId);
      await channel.send({
        chatId,
        locale,
        text: t(locale).rideTaken,
      });
    }),
  );
}
