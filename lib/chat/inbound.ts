import { after } from "next/server";
import {
  assignedDriverText,
  bookerJobButtons,
  bookerJobRecapText,
  bookerNoticeFields,
  bookerTripStatusText,
  companyOfferText,
  coursesButton,
  driverJobButtons,
  holdBookerButtons,
  holdBookerText,
  holdDurationLabel,
  reminderText,
  driverNoticeParams,
  taxiOfferText,
} from "../dispatch/copy";
import {
  acceptedChatId,
  busySupplierIds,
  declineOffer,
  holdExpiresAtMs,
  isLiveTrip,
  isReofferDue,
  markArrived,
  markCompleted,
  markEnRoute,
  pendingOffers,
  placeHold,
  releaseAssignment,
  reminderDue,
  reminderWaitMs,
} from "../dispatch/engine";
import {
  clearSessionIfJob,
  getJobByPrefix,
  getSession,
  idleBookerSession,
  listAssignedJobs,
  listOpenJobs,
  listStaff,
  localeForChat,
  markStaffSessionNudged,
  rememberLocale,
  saveJob,
  saveSession,
  staffForChat,
  touchStaffInbound,
  recordInboundEvent,
  withDispatchAnalytics,
} from "../dispatch/store";
import {
  staffIdentityFromChatId,
  staffIdentityFromPhone,
} from "../dispatch/identity";
import { sessionNudgeDue, sessionNudgeWaitMs } from "../dispatch/staff-session";
import type {
  ChatChannel,
  ChatLocale,
  DispatchJob,
  InboundMessage,
  StaffBinding,
} from "../dispatch/types";
import { channelOrNull } from "./channels";
import { advanceJob, cancelOpenJob, handleBooker, settleHold, startBooking } from "./booker";
import {
  isLangMenuRequest,
  isStartIntent,
  parseLangChoice,
  parseLocale,
  resolveLocale,
  withLocale,
} from "./locale";
import { LANG_BUTTONS, t } from "./messages";
import { isMenuIntent, isUnknownSlashCommand, sendRoleMenu } from "./menu";
import { notifyRing, notifyTaken } from "./notify";
import {
  assignJobFareZone,
  driverZoneButtons,
  jobNeedsDriverZone,
  missingFareSides,
  parseDriverZoneButton,
} from "../dispatch/zones";
import { handleStaffCommand, sendStaffHome, ensureStaffForChat, DUTY_ON_ID } from "./staff";

function parseOfferButton(buttonId: string) {
  const match = buttonId.match(/^([an]):([0-9a-f]{8}):(.+)$/i);
  if (!match) return null;
  return {
    action: match[1] === "a" ? "accept" : "decline",
    jobPrefix: match[2],
    supplierId: match[3],
  } as const;
}

function ringStillOpen(job: DispatchJob, now: Date) {
  return (
    (job.status === "ring_taxis" || job.status === "ring_companies") &&
    now.getTime() < Date.parse(job.ringEndsAt)
  );
}

async function flushDueReoffer(channel: ChatChannel, job: DispatchJob) {
  const now = new Date();
  if (!isReofferDue(job, now)) return job;
  const live = { ...job, reofferAt: null };
  await saveJob(live);
  await notifyRing(channel, live);
  return live;
}

async function handleOffer(
  channel: ChatChannel,
  inbound: InboundMessage,
  buttonId: string,
) {
  const parsed = parseOfferButton(buttonId);
  if (!parsed) return false;
  const stored = await getSession(inbound.channel, inbound.chatId);
  const driverLocale =
    stored?.locale ?? parseLocale(inbound.locale) ?? resolveLocale(null);
  if (!stored?.locale && parseLocale(inbound.locale)) {
    await rememberLocale(
      inbound.channel,
      inbound.chatId,
      parseLocale(inbound.locale)!,
    );
  }
  const job = await getJobByPrefix(parsed.jobPrefix);
  if (!job) {
    await channel.send({
      chatId: inbound.chatId,
      locale: driverLocale,
      text: t(driverLocale).offerExpired,
    });
    return true;
  }
  const now = new Date();
  if (parsed.action === "accept") {
    if (jobNeedsDriverZone(job)) {
      if (!ringStillOpen(job, now)) {
        await channel.send({
          chatId: inbound.chatId,
          locale: driverLocale,
          text: t(driverLocale).offerGone,
        });
        return true;
      }
      const side = missingFareSides(job.pickup, job.dropoff)[0];
      if (side) {
        await askDriverZone(
          channel,
          inbound.chatId,
          job,
          parsed.supplierId,
          side,
          0,
          driverLocale,
        );
        return true;
      }
    }
    const held = placeHold(job, parsed.supplierId, now);
    if (!held) {
      await channel.send({
        chatId: inbound.chatId,
        locale: driverLocale,
        text: t(driverLocale).offerGone,
      });
      return true;
    }
    await saveJob(held);
    if (inbound.chatId !== held.bookerChatId) {
      await channel.send({
        chatId: inbound.chatId,
        locale: driverLocale,
        text: t(driverLocale).holdWait(holdDurationLabel()),
      });
    }
    const bookerLocale = resolveLocale(held.bookerLocale);
    await channel.send({
      chatId: held.bookerChatId,
      locale: bookerLocale,
      text: holdBookerText(held, bookerLocale),
      buttons: holdBookerButtons(held, bookerLocale),
    });
    return true;
  }
  const declined = declineOffer(job, parsed.supplierId);
  if (!declined) {
    await channel.send({
      chatId: inbound.chatId,
      locale: driverLocale,
      text: t(driverLocale).offerClosed,
    });
    return true;
  }
  await saveJob(declined);
  if (!ringStillOpen(declined, now) || pendingOffers(declined).length === 0) {
    await channel.send({
      chatId: inbound.chatId,
      locale: driverLocale,
      text: t(driverLocale).declineRecorded,
    });
    await advanceJob(channel, declined);
    return true;
  }
  await channel.send({
    chatId: inbound.chatId,
    locale: driverLocale,
    text: t(driverLocale).declineOthersRemain,
  });
  return true;
}

async function askDriverZone(
  channel: ChatChannel,
  chatId: string,
  job: DispatchJob,
  supplierId: string,
  side: "pickup" | "dropoff",
  page: number,
  locale: ChatLocale,
) {
  await channel.send({
    chatId,
    locale,
    text: t(locale).askDriverZone(side),
    buttons: driverZoneButtons(job, side, supplierId, page, locale),
  });
}

async function handleDriverZone(
  channel: ChatChannel,
  inbound: InboundMessage,
  buttonId: string,
) {
  const parsed = parseDriverZoneButton(buttonId);
  if (!parsed) return false;
  const stored = await getSession(inbound.channel, inbound.chatId);
  const locale =
    stored?.locale ?? parseLocale(inbound.locale) ?? resolveLocale(null);
  const job = await getJobByPrefix(parsed.jobPrefix);
  const now = new Date();
  if (!job || !ringStillOpen(job, now)) {
    await channel.send({
      chatId: inbound.chatId,
      locale,
      text: t(locale).offerGone,
    });
    return true;
  }
  const pending = job.offers.find(
    (offer) =>
      offer.supplierId === parsed.supplierId && offer.status === "pending",
  );
  if (!pending) {
    await channel.send({
      chatId: inbound.chatId,
      locale,
      text: t(locale).offerGone,
    });
    return true;
  }
  if (parsed.page != null) {
    await askDriverZone(
      channel,
      inbound.chatId,
      job,
      parsed.supplierId,
      parsed.side,
      parsed.page,
      locale,
    );
    return true;
  }
  if (!parsed.zone) return true;
  const updated = assignJobFareZone(job, parsed.side, parsed.zone);
  await saveJob(updated);
  const remaining = missingFareSides(updated.pickup, updated.dropoff);
  if (remaining[0]) {
    await askDriverZone(
      channel,
      inbound.chatId,
      updated,
      parsed.supplierId,
      remaining[0],
      0,
      locale,
    );
    return true;
  }
  const text =
    updated.status === "ring_companies"
      ? companyOfferText(updated, parsed.supplierId, locale)
      : taxiOfferText(updated, parsed.supplierId, locale);
  const shortId = updated.id.slice(0, 8);
  await channel.send({
    chatId: inbound.chatId,
    locale,
    text,
    buttons: [
      [
        { id: `a:${shortId}:${parsed.supplierId}`, label: t(locale).accept },
        { id: `n:${shortId}:${parsed.supplierId}`, label: t(locale).decline },
      ],
    ],
  });
  return true;
}

function parseHoldButton(buttonId: string) {
  const match = buttonId.match(/^h([yn]):([0-9a-f]{8})$/i);
  if (!match) return null;
  return {
    action: match[1].toLowerCase() === "y" ? "confirm" : "reject",
    jobPrefix: match[2],
  } as const;
}

async function handleHoldButton(
  channel: ChatChannel,
  inbound: InboundMessage,
  buttonId: string,
) {
  const parsed = parseHoldButton(buttonId);
  if (!parsed) return false;
  const locale = await inboundLocale(inbound);
  const job = await getJobByPrefix(parsed.jobPrefix);
  if (!job) {
    await channel.send({
      chatId: inbound.chatId,
      locale,
      text: t(locale).requestNotFound,
    });
    return true;
  }
  await settleHold(channel, inbound, job, parsed.action);
  return true;
}

function parseTripButton(buttonId: string) {
  const match = buttonId.match(/^([evrdjb]):([0-9a-f]{8})$/i);
  if (!match) return null;
  const key = match[1].toLowerCase();
  const action =
    key === "e"
      ? "en_route"
      : key === "v"
        ? "arrived"
        : key === "d"
          ? "done"
          : key === "r"
            ? "release"
            : key === "b"
              ? "booker_open"
              : "open";
  return { action, jobPrefix: match[2] } as const;
}

function driverOwnsJob(
  job: DispatchJob,
  chatId: string,
  staff: Awaited<ReturnType<typeof staffForChat>>,
) {
  if (
    job.offers.some(
      (offer) => offer.status === "accepted" && offer.chatId === chatId,
    )
  ) {
    return true;
  }
  return Boolean(
    staff &&
      job.acceptedBy?.kind === staff.kind &&
      job.acceptedBy.supplierId === staff.supplierId,
  );
}

async function inboundLocale(inbound: InboundMessage) {
  const stored = await getSession(inbound.channel, inbound.chatId);
  return stored?.locale ?? parseLocale(inbound.locale) ?? resolveLocale(null);
}

async function sendDriverRecap(
  channel: ChatChannel,
  chatId: string,
  job: DispatchJob,
  locale: ChatLocale,
) {
  await channel.send({
    chatId,
    locale,
    text: assignedDriverText(job, locale),
    buttons: driverJobButtons(job, locale),
  });
}

async function sendBookerRecap(
  channel: ChatChannel,
  chatId: string,
  job: DispatchJob,
  locale: ChatLocale,
) {
  await channel.send({
    chatId,
    locale,
    text: bookerJobRecapText(job, locale),
    buttons: bookerJobButtons(job, locale),
  });
}

async function handleTripAction(
  channel: ChatChannel,
  inbound: InboundMessage,
  buttonId: string,
) {
  const parsed = parseTripButton(buttonId);
  if (!parsed) return false;
  const locale = await inboundLocale(inbound);
  const job = await getJobByPrefix(parsed.jobPrefix);
  if (!job) {
    await channel.send({
      chatId: inbound.chatId,
      locale,
      text: t(locale).requestNotFound,
    });
    return true;
  }
  if (parsed.action === "booker_open") {
    if (job.bookerChatId !== inbound.chatId) {
      await channel.send({
        chatId: inbound.chatId,
        locale,
        text: t(locale).notYourRequest,
      });
      return true;
    }
    await sendBookerRecap(channel, inbound.chatId, job, locale);
    return true;
  }
  const staff = await staffForChat(inbound.channel, inbound.chatId);
  if (!driverOwnsJob(job, inbound.chatId, staff)) {
    await channel.send({
      chatId: inbound.chatId,
      locale,
      text: t(locale).notYourRide,
    });
    return true;
  }
  if (parsed.action === "open") {
    if (!isLiveTrip(job.status) && job.status !== "completed") {
      await channel.send({
        chatId: inbound.chatId,
        locale,
        text: t(locale).rideNotActive,
      });
      return true;
    }
    await sendDriverRecap(channel, inbound.chatId, job, locale);
    return true;
  }
  const now = new Date();
  let next: DispatchJob | null = null;
  if (parsed.action === "en_route") next = markEnRoute(job);
  if (parsed.action === "arrived") next = markArrived(job);
  if (parsed.action === "done") next = markCompleted(job);
  if (parsed.action === "release") {
    next = releaseAssignment(
      job,
      now,
      await listStaff(),
      busySupplierIds(await listAssignedJobs(), job),
    );
  }
  if (!next) {
    await channel.send({
      chatId: inbound.chatId,
      locale,
      text: t(locale).rideNotActive,
    });
    return true;
  }
  await saveJob(next);
  if (parsed.action === "release") {
    await channel.send({
      chatId: inbound.chatId,
      locale,
      text: t(locale).rideReleased,
      buttons: [[coursesButton(locale)]],
    });
    if (inbound.chatId !== next.bookerChatId) {
      const bookerLocale = resolveLocale(next.bookerLocale);
      await channel.send({
        chatId: next.bookerChatId,
        locale: bookerLocale,
        ...bookerNoticeFields("trip", next, bookerLocale, "released"),
        text: t(bookerLocale).bookerRideReleased,
      });
    }
    if (next.status === "ring_taxis" || next.status === "ring_companies") {
      await notifyRing(channel, next);
    }
    return true;
  }
  await sendDriverRecap(channel, inbound.chatId, next, locale);
  if (inbound.chatId !== next.bookerChatId) {
    const bookerLocale = resolveLocale(next.bookerLocale);
    await channel.send({
      chatId: next.bookerChatId,
      locale: bookerLocale,
      ...bookerNoticeFields("trip", next, bookerLocale),
      text: bookerTripStatusText(next, bookerLocale),
    });
  }
  return true;
}

async function sendLanguagePicker(channel: ChatChannel, chatId: string) {
  await channel.send({
    chatId,
    text: t("fr").picker,
    buttons: LANG_BUTTONS.map((row) => [...row]),
  });
}

async function sendWelcome(
  channel: ChatChannel,
  inbound: InboundMessage,
  locale: ChatLocale,
) {
  const staff = await staffForChat(inbound.channel, inbound.chatId);
  await sendRoleMenu(channel, inbound, staff, locale);
}

export async function handleInbound(
  channel: ChatChannel,
  inbound: InboundMessage,
) {
  if (inbound.callbackId) {
    await channel.ack?.(inbound.callbackId);
  }

  await ensureStaffForChat(inbound);
  await touchStaffInbound(inbound.channel, inbound.chatId);

  if (inbound.buttonId && (await handleOffer(channel, inbound, inbound.buttonId))) {
    return;
  }

  if (inbound.buttonId && (await handleDriverZone(channel, inbound, inbound.buttonId))) {
    return;
  }

  if (inbound.buttonId && (await handleHoldButton(channel, inbound, inbound.buttonId))) {
    return;
  }

  if (inbound.buttonId && (await handleTripAction(channel, inbound, inbound.buttonId))) {
    return;
  }

  const session = await getSession(inbound.channel, inbound.chatId);
  const picked = parseLangChoice(inbound);

  if (isLangMenuRequest(inbound) && !picked) {
    await saveSession({
      ...(session ?? idleBookerSession(inbound.channel, inbound.chatId)),
      step: "lang",
      afterLang: isStartIntent(inbound) ? "book" : "menu",
    });
    await sendLanguagePicker(channel, inbound.chatId);
    return;
  }

  if (picked) {
    const switching =
      session != null && session.step !== "lang" && session.step !== "idle";
    const after =
      session?.step === "lang"
        ? (session.afterLang ?? "menu")
        : isStartIntent(inbound)
          ? "book"
          : "menu";
    await rememberLocale(inbound.channel, inbound.chatId, picked);
    const chat = withLocale(channel, picked);
    if (switching) {
      await chat.send({
        chatId: inbound.chatId,
        text: t(picked).languageUpdated,
      });
      return;
    }
    if (after === "book") {
      await startBooking(chat, inbound, {
        ...(session ?? idleBookerSession(inbound.channel, inbound.chatId)),
        locale: picked,
      });
      return;
    }
    await sendWelcome(chat, inbound, picked);
    return;
  }

  if (session?.step === "lang") {
    await sendLanguagePicker(channel, inbound.chatId);
    return;
  }

  if (inbound.buttonId?.startsWith("x:")) {
    const job = await getJobByPrefix(inbound.buttonId.slice(2));
    const fallback = session?.locale ?? parseLocale(inbound.locale);
    if (!job) {
      await channel.send({
        chatId: inbound.chatId,
        locale: resolveLocale(fallback),
        text: t(resolveLocale(fallback)).requestNotFound,
      });
      return;
    }
    await cancelOpenJob(channel, inbound, job);
    return;
  }

  const locale =
    session?.locale ?? parseLocale(inbound.locale) ?? null;
  if (!locale) {
    await saveSession({
      ...(session ?? idleBookerSession(inbound.channel, inbound.chatId)),
      step: "lang",
      afterLang: isStartIntent(inbound) ? "book" : "menu",
    });
    await sendLanguagePicker(channel, inbound.chatId);
    return;
  }

  if (!session?.locale) {
    await rememberLocale(inbound.channel, inbound.chatId, locale);
  }

  const chat = withLocale(channel, locale);

  const claimedDriver =
    !staffIdentityFromChatId(inbound.chatId) &&
    Boolean(
      staffIdentityFromPhone(inbound.contact?.phone) ||
        staffIdentityFromPhone(inbound.text?.trim()),
    );
  if (claimedDriver) {
    const staff = await staffForChat(inbound.channel, inbound.chatId);
    if (staff) {
      await sendStaffHome(chat, inbound, staff);
      return;
    }
  }

  if (await handleStaffCommand(chat, inbound)) return;

  if (isMenuIntent(inbound) || isUnknownSlashCommand(inbound)) {
    const staff = await staffForChat(inbound.channel, inbound.chatId);
    await sendRoleMenu(chat, inbound, staff, locale);
    return;
  }

  if (isStartIntent(inbound)) {
    await startBooking(chat, inbound, session);
    return;
  }

  if (session) {
    const handled = await handleBooker(chat, inbound, session);
    if (handled) return;
  }

  const staff = await staffForChat(inbound.channel, inbound.chatId);
  await sendRoleMenu(chat, inbound, staff, locale);
}

function followupDelayMs(
  jobs: DispatchJob[],
  assigned: DispatchJob[],
  staff: StaffBinding[],
  now = Date.now(),
) {
  let wait = Number.POSITIVE_INFINITY;
  for (const job of jobs) {
    if (job.status === "hold") {
      const holdWait = holdExpiresAtMs(job);
      if (holdWait != null) wait = Math.min(wait, holdWait - now);
      continue;
    }
    const ringWait = Date.parse(job.ringEndsAt) - now;
    const reofferWait = job.reofferAt
      ? Date.parse(job.reofferAt) - now
      : Number.POSITIVE_INFINITY;
    wait = Math.min(wait, ringWait, reofferWait);
  }
  for (const job of assigned) {
    const reminderWait = reminderWaitMs(job, now);
    if (reminderWait != null) wait = Math.min(wait, reminderWait);
  }
  for (const member of staff) {
    const nudgeWait = sessionNudgeWaitMs(member, now);
    if (nudgeWait != null) wait = Math.min(wait, nudgeWait);
  }
  if (!Number.isFinite(wait)) return null;
  return Math.min(Math.max(wait + 400, 400), 120_000);
}

const FOLLOWUP_BUDGET_MS = 270_000;

function scheduleDispatchFollowup() {
  after(async () => {
    const deadline = Date.now() + FOLLOWUP_BUDGET_MS;
    while (Date.now() < deadline) {
      const jobs = await listOpenJobs();
      const assigned = await listAssignedJobs();
      const delay = followupDelayMs(jobs, assigned, await listStaff());
      if (delay == null) return;
      const wait = Math.min(delay, deadline - Date.now());
      if (wait <= 0) return;
      await new Promise((resolve) => setTimeout(resolve, wait));
      await tickOpenJobs();
    }
  });
}

export async function serveInbound(
  channel: ChatChannel,
  inbound: InboundMessage | null,
) {
  const tracked = withDispatchAnalytics(channel);
  if (inbound) {
    await recordInboundEvent(inbound);
    await handleInbound(tracked, inbound);
  }
  await runDispatchTick();
}

export async function runDispatchTick(options?: { followup?: boolean }) {
  await tickOpenJobs();
  if (options?.followup === false) return;
  scheduleDispatchFollowup();
}

export async function tickOpenJobs() {
  const jobs = await listOpenJobs();
  for (const job of jobs) {
    const channel = channelOrNull(job.channel);
    if (!channel) continue;
    const tracked = withDispatchAnalytics(channel);
    const next = await advanceJob(tracked, job);
    await flushDueReoffer(tracked, next);
  }
  const assigned = await listAssignedJobs();
  for (const job of assigned) {
    if (!reminderDue(job)) continue;
    const channel = channelOrNull(job.channel);
    const chatId = acceptedChatId(job);
    if (!channel || !chatId) continue;
    const tracked = withDispatchAnalytics(channel);
    const locale = await localeForChat(job.channel, chatId);
    await saveJob({ ...job, remindedAt: new Date().toISOString() });
    await tracked.send({
      chatId,
      locale,
      notice: "reminder",
      templateParams: driverNoticeParams("reminder", job, locale),
      text: reminderText(job, locale),
      buttons: driverJobButtons(job, locale),
    });
  }
  for (const staff of await listStaff()) {
    if (!sessionNudgeDue(staff)) continue;
    const channel = channelOrNull(staff.channel);
    if (!channel) continue;
    const tracked = withDispatchAnalytics(channel);
    await markStaffSessionNudged(staff.channel, staff.chatId);
    const locale = await localeForChat(staff.channel, staff.chatId);
    await tracked.send({
      chatId: staff.chatId,
      locale,
      text: t(locale).sessionNudge,
      buttons: [[{ id: DUTY_ON_ID, label: t(locale).onDutyBtn }]],
    });
  }
}
