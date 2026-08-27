import {
  companyOfferText,
  offerNoticeParams,
  taxiOfferText,
  tripNoticeParams,
} from "../dispatch/copy";
import { jobCallbackId, localeForChat } from "../dispatch/store";
import type { ChatChannel, DispatchJob, OfferTarget } from "../dispatch/types";
import { t } from "./messages";

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
      offer.chatId !== job.bookerChatId &&
      (onlyChatId == null || offer.chatId === onlyChatId),
  );
  const shortId = jobCallbackId(job.id);

  for (const [chatId, offers] of chunkByChat(pending)) {
    const offer = offers[0];
    const locale = await localeForChat(channel.name, chatId);
    const copy = t(locale);
    const text =
      kind === "taxi"
        ? taxiOfferText(job, offer.supplierId, locale)
        : companyOfferText(job, offer.supplierId, locale);
    await channel.send({
      chatId,
      locale,
      notice: "offer",
      templateParams: offerNoticeParams(job, locale),
      text,
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
        notice: "trip",
        templateParams: tripNoticeParams(job, locale, "taken"),
        customerAt: job.createdAt,
        text: t(locale).rideTaken,
      });
    }),
  );
}
