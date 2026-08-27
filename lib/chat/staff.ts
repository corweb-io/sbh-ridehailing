import { companyBySlug } from "../dispatch/companies";
import {
  COURSES_BOOK_ID,
  COURSES_BUTTON,
  COURSES_DRIVE_ID,
  assignedDriverText,
  bookerJobButtons,
  bookerJobRecapText,
  bookerRideButton,
  bookerRidesText,
  coursesBookButton,
  coursesButton,
  coursesDriveButton,
  driverJobButtons,
  ridesChooserText,
  upcomingRideButton,
  upcomingRidesText,
} from "../dispatch/copy";
import { upcomingAssignedJobs, upcomingBookerJobs } from "../dispatch/engine";
import { staffIdentityFromChatId, staffIdentityFromInbound } from "../dispatch/identity";
import { isStaffOnDuty } from "../dispatch/staff-session";
import {
  bindStaff,
  getSession,
  listAssignedJobs,
  listBookerJobs,
  setStaffDuty,
  staffForChat,
  unbindStaff,
} from "../dispatch/store";
import { LICENSED_TAXIS, taxiCaption } from "../licensed-taxis";
import type {
  ChatButton,
  ChatChannel,
  ChatLocale,
  DispatchJob,
  InboundMessage,
  StaffBinding,
} from "../dispatch/types";
import { DUTY_OFF_ID, DUTY_ON_ID, isActiveBooking, menuButtons, sendRoleMenu } from "./menu";
import { t } from "./messages";
import { parseLocale, resolveLocale } from "./locale";

export { DUTY_OFF_ID, DUTY_ON_ID };

export function staffButtons(locale: ChatLocale, onDuty = true): ChatButton[][] {
  const copy = t(locale);
  return [
    [
      { id: "go", label: copy.bookTaxi },
      coursesButton(locale),
      onDuty
        ? { id: DUTY_OFF_ID, label: copy.offDutyBtn }
        : { id: DUTY_ON_ID, label: copy.onDutyBtn },
    ],
  ];
}

function findTaxi(query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return (
    LICENSED_TAXIS.find((taxi) => {
      const digits = q.replace(/\D/g, "");
      return (
        taxi.id.toLowerCase() === q ||
        taxi.id.toLowerCase() === `taxi-${q}` ||
        taxi.number === q ||
        taxi.number === digits.replace(/^0+/, "") ||
        taxi.ads.toLowerCase() === q ||
        taxi.ads.toLowerCase() === `ads ${q}`
      );
    }) ?? null
  );
}

async function staffLocale(inbound: InboundMessage): Promise<ChatLocale> {
  const session = await getSession(inbound.channel, inbound.chatId);
  return session?.locale ?? parseLocale(inbound.locale) ?? resolveLocale(null);
}

async function sendWithMenu(
  channel: ChatChannel,
  inbound: InboundMessage,
  locale: ChatLocale,
  text: string,
  staff: StaffBinding | null,
) {
  const session = await getSession(inbound.channel, inbound.chatId);
  await channel.send({
    chatId: inbound.chatId,
    locale,
    text,
    buttons: menuButtons(locale, {
      staff,
      booking: isActiveBooking(session),
    }),
  });
}

function isPauseDuty(inbound: InboundMessage, text: string) {
  return (
    inbound.buttonId === DUTY_OFF_ID ||
    /^hors service$/i.test(text) ||
    /^off duty$/i.test(text)
  );
}

function isQuitRole(text: string) {
  return /^\/off$/i.test(text) || /^quitter$/i.test(text);
}

export async function ensureStaffForChat(
  inbound: Pick<InboundMessage, "channel" | "chatId" | "fromId" | "contact" | "text">,
  ignoreContact = false,
): Promise<StaffBinding | null> {
  const identity = staffIdentityFromInbound(inbound, ignoreContact);
  if (!identity) return staffForChat(inbound.channel, inbound.chatId);
  const existing = await staffForChat(inbound.channel, inbound.chatId);
  if (
    existing &&
    existing.kind === identity.kind &&
    existing.supplierId === identity.supplierId
  ) {
    return existing;
  }
  const now = new Date().toISOString();
  return bindStaff({
    channel: inbound.channel,
    chatId: inbound.chatId,
    kind: identity.kind,
    supplierId: identity.supplierId,
    boundAt: existing?.boundAt ?? now,
    lastInboundAt: existing?.lastInboundAt ?? now,
    onDuty: existing?.onDuty ?? true,
    sessionNudgedAt: existing?.sessionNudgedAt ?? null,
  });
}

export async function handleStaffCommand(
  channel: ChatChannel,
  inbound: InboundMessage,
) {
  const text = inbound.text?.trim() ?? "";
  const phoneIdentity = staffIdentityFromChatId(inbound.chatId);
  const driver = text.match(/^\/?driver(?:\s+(.+))?$/i);
  if (driver) {
    if (phoneIdentity || inbound.channel === "whatsapp") {
      const locale = await staffLocale(inbound);
      if (phoneIdentity) return false;
      await channel.send({
        chatId: inbound.chatId,
        locale,
        text: t(locale).unknownTaxiPhone,
      });
      return true;
    }
    const taxi = findTaxi(driver[1] ?? "");
    if (!taxi) {
      const locale = await staffLocale(inbound);
      await channel.send({
        chatId: inbound.chatId,
        locale,
        text: t(locale).driverUsage,
      });
      return true;
    }
    const now = new Date().toISOString();
    await bindStaff({
      channel: inbound.channel,
      chatId: inbound.chatId,
      kind: "taxi",
      supplierId: taxi.id,
      boundAt: now,
      lastInboundAt: now,
      onDuty: true,
    });
    const locale = await staffLocale(inbound);
    await sendWithMenu(
      channel,
      inbound,
      locale,
      t(locale).staffBound(`${taxiCaption(taxi)} · ${taxi.name}`, "taxi"),
      {
        channel: inbound.channel,
        chatId: inbound.chatId,
        kind: "taxi",
        supplierId: taxi.id,
        boundAt: now,
        lastInboundAt: now,
        onDuty: true,
      },
    );
    return true;
  }

  const companyMatch = text.match(/^\/?company(?:\s+(.+))?$/i);
  if (companyMatch) {
    if (phoneIdentity || inbound.channel === "whatsapp") {
      const locale = await staffLocale(inbound);
      if (phoneIdentity) return false;
      await channel.send({
        chatId: inbound.chatId,
        locale,
        text: t(locale).unknownTaxiPhone,
      });
      return true;
    }
    const company = companyBySlug(companyMatch[1] ?? "");
    if (!company) {
      const locale = await staffLocale(inbound);
      await channel.send({
        chatId: inbound.chatId,
        locale,
        text: t(locale).companyUsage,
      });
      return true;
    }
    const now = new Date().toISOString();
    await bindStaff({
      channel: inbound.channel,
      chatId: inbound.chatId,
      kind: "company",
      supplierId: company.id,
      boundAt: now,
      lastInboundAt: now,
      onDuty: true,
    });
    const locale = await staffLocale(inbound);
    await sendWithMenu(
      channel,
      inbound,
      locale,
      t(locale).staffBound(company.name, "company"),
      {
        channel: inbound.channel,
        chatId: inbound.chatId,
        kind: "company",
        supplierId: company.id,
        boundAt: now,
        lastInboundAt: now,
        onDuty: true,
      },
    );
    return true;
  }

  if (
    inbound.buttonId === DUTY_ON_ID ||
    /^\/?(on|en service)$/i.test(text)
  ) {
    const locale = await staffLocale(inbound);
    const staff = await setStaffDuty(inbound.channel, inbound.chatId, true);
    if (!staff) {
      await channel.send({
        chatId: inbound.chatId,
        locale,
        text: t(locale).unknownTaxiPhone,
      });
      return true;
    }
    await sendWithMenu(channel, inbound, locale, t(locale).staffOnDuty, staff);
    return true;
  }

  if (isPauseDuty(inbound, text) || (isQuitRole(text) && phoneIdentity)) {
    const locale = await staffLocale(inbound);
    const staff = await setStaffDuty(inbound.channel, inbound.chatId, false);
    if (!staff) {
      await channel.send({
        chatId: inbound.chatId,
        locale,
        text: t(locale).unknownTaxiPhone,
      });
      return true;
    }
    await sendWithMenu(channel, inbound, locale, t(locale).staffOffDuty, staff);
    return true;
  }

  if (isQuitRole(text)) {
    await unbindStaff(inbound.channel, inbound.chatId);
    const locale = await staffLocale(inbound);
    await sendWithMenu(channel, inbound, locale, t(locale).staffOff, null);
    return true;
  }

  if (
    inbound.buttonId === COURSES_DRIVE_ID ||
    /^au volant$/i.test(text) ||
    /^driving$/i.test(text)
  ) {
    const staff = await staffForChat(inbound.channel, inbound.chatId);
    await sendDriverRides(channel, inbound, staff);
    return true;
  }

  if (
    inbound.buttonId === COURSES_BOOK_ID ||
    /^r[ée]servations$/i.test(text) ||
    /^booked$/i.test(text) ||
    /^mes r[ée]servations$/i.test(text) ||
    /^my bookings$/i.test(text)
  ) {
    await sendBookerRides(channel, inbound);
    return true;
  }

  if (
    inbound.buttonId === COURSES_BUTTON.id ||
    /^\/?(courses|rides)$/i.test(text) ||
    /^mes courses$/i.test(text) ||
    /^my rides$/i.test(text)
  ) {
    const staff = await staffForChat(inbound.channel, inbound.chatId);
    await sendCoursesHome(channel, inbound, staff);
    return true;
  }

  return false;
}

export async function sendStaffHome(
  channel: ChatChannel,
  inbound: InboundMessage,
  staff: StaffBinding,
) {
  const locale = await staffLocale(inbound);
  await sendRoleMenu(channel, inbound, staff, locale);
}

async function loadDriverJobs(
  inbound: InboundMessage,
  staff: StaffBinding | null,
) {
  return upcomingAssignedJobs(await listAssignedJobs(), {
    chatId: inbound.chatId,
    kind: staff?.kind,
    supplierId: staff?.supplierId,
  });
}

async function loadBookerJobs(inbound: InboundMessage) {
  return upcomingBookerJobs(
    await listBookerJobs(inbound.channel, inbound.chatId),
    { channel: inbound.channel, chatId: inbound.chatId },
  );
}

async function sendCoursesHome(
  channel: ChatChannel,
  inbound: InboundMessage,
  staff: StaffBinding | null,
) {
  const [driving, booked] = await Promise.all([
    loadDriverJobs(inbound, staff),
    loadBookerJobs(inbound),
  ]);
  if (driving.length > 0 && booked.length === 0) {
    await sendDriverRides(channel, inbound, staff, driving);
    return;
  }
  if (booked.length > 0 && driving.length === 0) {
    await sendBookerRides(channel, inbound, booked);
    return;
  }
  const locale = await staffLocale(inbound);
  if (driving.length === 0 && booked.length === 0) {
    await channel.send({
      chatId: inbound.chatId,
      locale,
      text: t(locale).noUpcoming,
      buttons: staff
        ? staffButtons(locale, isStaffOnDuty(staff))
        : [[{ id: "go", label: t(locale).bookTaxi }]],
    });
    return;
  }
  await channel.send({
    chatId: inbound.chatId,
    locale,
    text: ridesChooserText(driving.length, booked.length, locale),
    buttons: [[coursesDriveButton(locale), coursesBookButton(locale)]],
  });
}

async function sendDriverRides(
  channel: ChatChannel,
  inbound: InboundMessage,
  staff: StaffBinding | null,
  jobs?: DispatchJob[],
) {
  const locale = await staffLocale(inbound);
  const list = jobs ?? (await loadDriverJobs(inbound, staff));
  if (list.length === 1) {
    await channel.send({
      chatId: inbound.chatId,
      locale,
      text: assignedDriverText(list[0], locale),
      buttons: driverJobButtons(list[0], locale),
    });
    return;
  }
  const booked = list.length === 0 ? await loadBookerJobs(inbound) : [];
  await channel.send({
    chatId: inbound.chatId,
    locale,
    text: upcomingRidesText(list, locale),
    buttons:
      list.length === 0
        ? booked.length > 0
          ? [[coursesBookButton(locale)], [{ id: "go", label: t(locale).bookTaxi }]]
          : staff
            ? staffButtons(locale, isStaffOnDuty(staff))
            : [[{ id: "go", label: t(locale).bookTaxi }]]
        : [
            ...list.slice(0, 8).map((job) => [upcomingRideButton(job, locale)]),
            [{ id: "go", label: t(locale).bookTaxi }],
          ],
  });
}

async function sendBookerRides(
  channel: ChatChannel,
  inbound: InboundMessage,
  jobs?: DispatchJob[],
) {
  const locale = await staffLocale(inbound);
  const list = jobs ?? (await loadBookerJobs(inbound));
  if (list.length === 1) {
    await channel.send({
      chatId: inbound.chatId,
      locale,
      text: bookerJobRecapText(list[0], locale),
      buttons: bookerJobButtons(list[0], locale),
    });
    return;
  }
  const staff = await staffForChat(inbound.channel, inbound.chatId);
  await channel.send({
    chatId: inbound.chatId,
    locale,
    text: bookerRidesText(list, locale),
    buttons:
      list.length === 0
        ? staff
          ? staffButtons(locale, isStaffOnDuty(staff))
          : [[{ id: "go", label: t(locale).bookTaxi }]]
        : [
            ...list.slice(0, 8).map((job) => [bookerRideButton(job, locale)]),
            [{ id: "go", label: t(locale).bookTaxi }],
          ],
  });
}
