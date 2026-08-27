import { isInsideSbh } from "../config";
import { FARE_ZONE_IDS, FARE_ZONE_LABELS, fareZoneForPlace, SBH_TIME_ZONE } from "../fares";
import { datetimeLocalInStBarth, stBarthIsoFromLocalInput } from "../format";
import {
  findPlaceByName,
  nearestPlace,
  POPULAR_DESTINATIONS,
} from "../places";
import {
  customPlace,
  hydratePlaceSuggestion,
  newPlacesSessionToken,
  resolveTypedPlaceQuery,
} from "../places-search";
import { isValidPhone } from "../phone";
import { buildOfficialQuote } from "../quote";
import type { FareZoneId, Place, PlaceSuggestion } from "../types";
import {
  assignedBookerText,
  assignedDriverText,
  bookerQuoteText,
  driverJobButtons,
  driverNoticeParams,
  jobLabel,
  ringDurationLabel,
} from "../dispatch/copy";
import {
  acceptedChatId,
  busySupplierIds,
  cancelJob,
  confirmHold,
  heldChatId,
  isHoldExpired,
  rejectHold,
  startTaxiRing,
  tickJob,
} from "../dispatch/engine";
import {
  clearSession,
  clearSessionIfJob,
  getJob,
  idleBookerSession,
  lastJobForChat,
  listAssignedJobs,
  listStaff,
  localeForChat,
  saveJob,
  saveSession,
  jobCallbackId,
} from "../dispatch/store";
import type {
  BookerSession,
  ChatChannel,
  ChatLocale,
  DispatchJob,
  InboundMessage,
} from "../dispatch/types";
import { t } from "./messages";
import { intlTag, parseLocale, resolveLocale } from "./locale";
import { notifyRing, notifyTaken } from "./notify";

const PICKUP_CHOICES = [
  ...new Set(["Aéroport", "Gustavia", "Saint-Jean", ...POPULAR_DESTINATIONS]),
].slice(0, 8);

function emptySession(
  channel: BookerSession["channel"],
  chatId: string,
  locale: ChatLocale | null = null,
): BookerSession {
  return idleBookerSession(channel, chatId, locale);
}

function msg(session: Pick<BookerSession, "locale"> | ChatLocale | null | undefined) {
  const locale =
    session && typeof session === "object" ? session.locale : session;
  return t(resolveLocale(locale));
}

function placeButtons(prefix: "p" | "d", locale: ChatLocale | null) {
  const copy = msg(locale);
  const names = prefix === "p" ? PICKUP_CHOICES.slice(0, 8) : [...POPULAR_DESTINATIONS];
  const rows: { id: string; label: string }[][] = [];
  for (let i = 0; i < names.length; i += 2) {
    const row = names.slice(i, i + 2).map((name, offset) => ({
      id: `${prefix}:${i + offset}`,
      label: name,
    }));
    rows.push(row);
  }
  rows.push([{ id: `${prefix}:other`, label: copy.other }]);
  return rows;
}

export function placeChoiceButtons(
  choices: PlaceSuggestion[],
  query: string,
  locale: ChatLocale | null,
) {
  const copy = msg(locale);
  const rows = choices.map((place, index) => [
    { id: `pick:${index}`, label: place.name },
  ]);
  rows.push([{ id: "pick:custom", label: copy.useTypedPlace(query) }]);
  return rows;
}

function zoneButtons(page = 0, locale: ChatLocale | null = null) {
  const start = page * 8;
  const slice = FARE_ZONE_IDS.slice(start, start + 8);
  const rows: { id: string; label: string }[][] = [];
  for (let i = 0; i < slice.length; i += 2) {
    rows.push(
      slice.slice(i, i + 2).map((id) => ({
        id: `z:${id}`,
        label: FARE_ZONE_LABELS[id],
      })),
    );
  }
  if (start + 8 < FARE_ZONE_IDS.length) {
    rows.push([{ id: `zpage:${page + 1}`, label: msg(locale).otherNeighborhoods }]);
  }
  return rows;
}

function catalogPlace(name: string): Place | null {
  const found = findPlaceByName(name);
  if (!found) return null;
  return { ...found, source: found.source ?? "catalog" };
}

function fromLocation(lat: number, lng: number): Place | null {
  if (!isInsideSbh(lat, lng)) return null;
  const nearby = nearestPlace(lat, lng);
  return {
    name: nearby.name,
    address: nearby.address,
    lat,
    lng,
    source: "gps",
    fareZone: fareZoneForPlace({
      name: nearby.name,
      address: nearby.address,
      lat,
      lng,
      source: "gps",
    }),
  };
}

const WEEKDAY_INDEX: Record<string, number> = {
  dimanche: 0,
  sunday: 0,
  lundi: 1,
  monday: 1,
  mardi: 2,
  tuesday: 2,
  mercredi: 3,
  wednesday: 3,
  jeudi: 4,
  thursday: 4,
  vendredi: 5,
  friday: 5,
  samedi: 6,
  saturday: 6,
};

const MONTHS: Record<string, number> = {
  janvier: 1,
  janv: 1,
  jan: 1,
  january: 1,
  fevrier: 2,
  fevr: 2,
  february: 2,
  feb: 2,
  mars: 3,
  march: 3,
  mar: 3,
  avril: 4,
  avr: 4,
  april: 4,
  apr: 4,
  mai: 5,
  may: 5,
  juin: 6,
  june: 6,
  jun: 6,
  juillet: 7,
  juil: 7,
  july: 7,
  jul: 7,
  aout: 8,
  august: 8,
  aug: 8,
  septembre: 9,
  sept: 9,
  sep: 9,
  september: 9,
  octobre: 10,
  oct: 10,
  october: 10,
  novembre: 11,
  nov: 11,
  november: 11,
  decembre: 12,
  dec: 12,
  december: 12,
};

function foldFr(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[.,]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function pad2(value: number) {
  return value.toString().padStart(2, "0");
}

function localYmd(date: Date) {
  return datetimeLocalInStBarth(date).slice(0, 10);
}

function addLocalDays(ymd: string, days: number) {
  const noon = Date.parse(`${ymd}T12:00:00-04:00`) + days * 24 * 60 * 60 * 1000;
  return localYmd(new Date(noon));
}

function atLocal(ymd: string, hour: number, minute: number) {
  return stBarthIsoFromLocalInput(`${ymd}T${pad2(hour)}:${pad2(minute)}`);
}

function isPast(iso: string, now: Date) {
  return Date.parse(iso) <= now.getTime() + 4 * 60 * 1000;
}

function dayStillOpen(ymd: string, now = new Date()) {
  return !isPast(atLocal(ymd, 23, 30), now);
}

export function dayButtonLabel(
  ymd: string,
  today: string,
  locale: ChatLocale | null = null,
) {
  const copy = msg(locale);
  if (ymd === today) return copy.today;
  if (ymd === addLocalDays(today, 1)) return copy.tomorrow;
  return new Intl.DateTimeFormat(intlTag(resolveLocale(locale)), {
    timeZone: SBH_TIME_ZONE,
    weekday: "short",
    day: "numeric",
    month: "short",
  }).format(new Date(`${ymd}T12:00:00-04:00`));
}

function whenHomeButtons(locale: ChatLocale | null) {
  const copy = msg(locale);
  return [
    [{ id: "when:now", label: copy.now }],
    [{ id: "when:today", label: copy.laterToday }],
    [{ id: "when:otherday", label: copy.anotherDay }],
  ];
}

function dayButtons(page: number, now = new Date(), locale: ChatLocale | null = null) {
  const copy = msg(locale);
  const today = localYmd(now);
  const start = page * 6 + 1;
  const rows: { id: string; label: string }[][] = [];
  const days: { id: string; label: string }[] = [];
  for (let offset = start; offset < start + 6; offset += 1) {
    days.push({
      id: `day:${addLocalDays(today, offset)}`,
      label: dayButtonLabel(addLocalDays(today, offset), today, locale),
    });
  }
  for (let i = 0; i < days.length; i += 2) {
    rows.push(days.slice(i, i + 2));
  }
  const nav: { id: string; label: string }[] = [];
  if (page > 0) nav.push({ id: `dpage:${page - 1}`, label: copy.earlier });
  if (start + 6 < 21) nav.push({ id: `dpage:${page + 1}`, label: copy.laterDays });
  if (nav.length) rows.push(nav);
  rows.push([{ id: "when:backhome", label: copy.backWhen }]);
  return rows;
}

function parseClock(raw: string) {
  const match =
    raw.match(/(\d{1,2})\s*(?:h|:)\s*(\d{2})?\s*$/i) ?? raw.match(/^(\d{1,2})$/);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2] ?? "0");
  if (hour > 23 || minute > 59) return null;
  return {
    hour,
    minute,
    datePart: foldFr(raw.slice(0, match.index).replace(/\s+(a|le|pour|at|on|for)$/i, "")),
  };
}

function parseDatePart(
  datePart: string,
  today: string,
): { ymd: string; hasYear: boolean; kind: "none" | "relative" | "weekday" | "calendar" } | null {
  const cleaned = datePart
    .replace(/^(le|pour|a|du|the|on|for|at)\s+/, "")
    .replace(/\s+(prochain|prochaine)$/, "")
    .trim();
  if (!cleaned) return { ymd: today, hasYear: true, kind: "none" };
  if (
    cleaned === "demain" ||
    cleaned === "tomorrow"
  ) {
    return { ymd: addLocalDays(today, 1), hasYear: true, kind: "relative" };
  }
  if (
    cleaned === "today" ||
    cleaned === "aujourd hui" ||
    cleaned === "aujourdhui" ||
    cleaned === "aujourd'hui"
  ) {
    return { ymd: today, hasYear: true, kind: "relative" };
  }
  if (
    cleaned === "apres-demain" ||
    cleaned === "apres demain" ||
    cleaned === "day after tomorrow"
  ) {
    return { ymd: addLocalDays(today, 2), hasYear: true, kind: "relative" };
  }
  const weekday = WEEKDAY_INDEX[cleaned];
  if (weekday != null) {
    const todayWeekday = new Date(`${today}T12:00:00-04:00`).getUTCDay();
    const delta = (weekday - todayWeekday + 7) % 7;
    return { ymd: addLocalDays(today, delta), hasYear: true, kind: "weekday" };
  }
  const iso = cleaned.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (iso) {
    return {
      ymd: `${iso[1]}-${pad2(Number(iso[2]))}-${pad2(Number(iso[3]))}`,
      hasYear: true,
      kind: "calendar",
    };
  }
  const slash = cleaned.match(/^(\d{1,2})[/-](\d{1,2})(?:[/-](\d{2,4}))?$/);
  if (slash) {
    const year = slash[3]
      ? Number(slash[3].length === 2 ? `20${slash[3]}` : slash[3])
      : Number(today.slice(0, 4));
    return {
      ymd: `${year}-${pad2(Number(slash[2]))}-${pad2(Number(slash[1]))}`,
      hasYear: Boolean(slash[3]),
      kind: "calendar",
    };
  }
  const named = cleaned.match(/^(\d{1,2})\s+([a-z]+)(?:\s+(\d{4}))?$/);
  if (named) {
    const month = MONTHS[named[2]];
    if (!month) return null;
    const year = named[3] ? Number(named[3]) : Number(today.slice(0, 4));
    return {
      ymd: `${year}-${pad2(month)}-${pad2(Number(named[1]))}`,
      hasYear: Boolean(named[3]),
      kind: "calendar",
    };
  }
  return null;
}

export function parseDepartTime(text: string, now = new Date()) {
  const clock = parseClock(foldFr(text));
  if (!clock) return null;
  const today = localYmd(now);
  const parsed = parseDatePart(clock.datePart, today);
  if (!parsed || !/^\d{4}-\d{2}-\d{2}$/.test(parsed.ymd)) return null;
  let ymd = parsed.ymd;
  let iso = atLocal(ymd, clock.hour, clock.minute);
  if (isPast(iso, now)) {
    if (parsed.kind === "none") {
      ymd = addLocalDays(today, 1);
    } else if (parsed.kind === "weekday") {
      ymd = addLocalDays(ymd, 7);
    } else if (parsed.kind === "calendar" && !parsed.hasYear) {
      ymd = `${Number(ymd.slice(0, 4)) + 1}${ymd.slice(4)}`;
    } else {
      return null;
    }
    iso = atLocal(ymd, clock.hour, clock.minute);
  }
  if (isPast(iso, now)) return null;
  if (Date.parse(iso) > now.getTime() + 366 * 24 * 60 * 60 * 1000) return null;
  return new Date(iso);
}

export function parseTimeOnDay(text: string, ymd: string, now = new Date()) {
  const clock = parseClock(foldFr(text));
  if (!clock || clock.datePart) return null;
  const iso = atLocal(ymd, clock.hour, clock.minute);
  if (isPast(iso, now)) return null;
  return new Date(iso);
}

async function promptPickup(
  channel: ChatChannel,
  chatId: string,
  lastPickup: Place | null = null,
  locale: ChatLocale | null = null,
) {
  const copy = msg(locale);
  const buttons = placeButtons("p", locale);
  if (lastPickup) {
    const label =
      lastPickup.name.length > 28
        ? `${lastPickup.name.slice(0, 27)}…`
        : lastPickup.name;
    buttons.unshift([{ id: "p:last", label: copy.samePickup(label) }]);
  }
  await channel.send({
    chatId,
    text: copy.askPickup,
    requestLocation: true,
  });
  await channel.send({
    chatId,
    text: lastPickup ? copy.askPickupRepeat : copy.choosePlace,
    buttons,
  });
}

export async function startBooking(
  channel: ChatChannel,
  inbound: InboundMessage,
  _existing: BookerSession | null,
) {
  const last = await lastJobForChat(inbound.channel, inbound.chatId);
  const session = emptySession(
    inbound.channel,
    inbound.chatId,
    _existing?.locale ?? parseLocale(inbound.locale) ?? null,
  );
  session.step = "pickup";
  await saveSession(session);
  await promptPickup(
    channel,
    inbound.chatId,
    last?.pickup ?? null,
    session.locale,
  );
}

async function askDropoff(channel: ChatChannel, session: BookerSession) {
  session.step = "dropoff";
  await saveSession(session);
  const copy = msg(session);
  const noted = session.pickup ? `${copy.placeNoted("pickup", session.pickup)}\n\n` : "";
  await channel.send({
    chatId: session.chatId,
    text: `${noted}${copy.askDropoff}`,
    buttons: placeButtons("d", session.locale),
  });
}

async function askWhen(channel: ChatChannel, session: BookerSession) {
  session.step = "when";
  session.departDay = null;
  await saveSession(session);
  const copy = msg(session);
  const noted = session.dropoff
    ? `${copy.placeNoted("dropoff", session.dropoff)}\n\n`
    : "";
  await channel.send({
    chatId: session.chatId,
    text: `${noted}${copy.askWhen}`,
    buttons: whenHomeButtons(session.locale),
  });
}

async function askWhenDay(
  channel: ChatChannel,
  session: BookerSession,
  page = 0,
) {
  session.step = "when_day";
  session.departDay = null;
  await saveSession(session);
  await channel.send({
    chatId: session.chatId,
    text: msg(session).askDay,
    buttons: dayButtons(page, new Date(), session.locale),
  });
}

async function askWhenTime(channel: ChatChannel, session: BookerSession) {
  const ymd = session.departDay;
  if (!ymd) {
    await askWhen(channel, session);
    return;
  }
  session.step = "when_time";
  await saveSession(session);
  const today = localYmd(new Date());
  const copy = msg(session);
  const back =
    ymd === today
      ? [{ id: "when:backhome", label: copy.backWhen }]
      : [{ id: "when:backday", label: copy.backDay }];
  await channel.send({
    chatId: session.chatId,
    text: copy.askTime(dayButtonLabel(ymd, today, session.locale)),
    buttons: [back],
  });
}

async function askPax(channel: ChatChannel, session: BookerSession) {
  session.step = "pax";
  await saveSession(session);
  await channel.send({
    chatId: session.chatId,
    text: msg(session).askPax,
    buttons: [
      [1, 2, 3, 4].map((n) => ({ id: `pax:${n}`, label: String(n) })),
      [5, 6, 7, 8].map((n) => ({ id: `pax:${n}`, label: String(n) })),
    ],
  });
}

async function askPhone(channel: ChatChannel, session: BookerSession) {
  session.step = "phone";
  await saveSession(session);
  await channel.send({
    chatId: session.chatId,
    text: msg(session).askPhone,
    requestContact: true,
  });
}

async function askZone(
  channel: ChatChannel,
  session: BookerSession,
  side: "pickup" | "dropoff",
  page = 0,
) {
  session.step = "zone";
  session.zoneSide = side;
  await saveSession(session);
  await channel.send({
    chatId: session.chatId,
    text: msg(session).askZone(side),
    buttons: zoneButtons(page, session.locale),
  });
}

async function showQuote(channel: ChatChannel, session: BookerSession) {
  if (!session.pickup || !session.dropoff || !session.departAt || !session.pax || !session.passengerPhone) {
    return;
  }
  const quote = buildOfficialQuote(
    session.pickup,
    session.dropoff,
    new Date(session.departAt),
  );
  session.step = "confirm";
  await saveSession(session);
  await channel.send({
    chatId: session.chatId,
    text: msg(session).keyboardRemoved,
    removeKeyboard: true,
  });
  await channel.send({
    chatId: session.chatId,
    text: bookerQuoteText({
      pickup: session.pickup,
      dropoff: session.dropoff,
      departAt: session.departAt,
      pax: session.pax,
      passengerPhone: session.passengerPhone,
      quote,
    }, session.locale),
    buttons: [
      [
        { id: "ok", label: msg(session).confirm },
        { id: "edit", label: msg(session).edit },
        { id: "x", label: msg(session).cancel },
      ],
    ],
  });
}

function resetPlaceSearch(session: BookerSession) {
  session.placePickSide = null;
  session.placeQuery = null;
  session.placeCandidates = null;
  session.placesToken = null;
}

async function applyPlace(
  channel: ChatChannel,
  session: BookerSession,
  place: Place,
  side: "pickup" | "dropoff",
) {
  resetPlaceSearch(session);
  if (side === "pickup") {
    session.pickup = place;
    await askDropoff(channel, session);
    return;
  }
  session.dropoff = place;
  await askWhen(channel, session);
}

async function offerTypedPlace(
  channel: ChatChannel,
  session: BookerSession,
  query: string,
  side: "pickup" | "dropoff",
) {
  const token = session.placesToken ?? newPlacesSessionToken();
  session.placesToken = token;
  const result = await resolveTypedPlaceQuery(query, {
    sessionToken: token,
    language: resolveLocale(session.locale),
  });
  if (result.kind === "place") {
    await applyPlace(channel, session, result.place, side);
    return;
  }
  session.step = "place_pick";
  session.placePickSide = side;
  session.placeQuery = result.query;
  session.placeCandidates = result.choices;
  await saveSession(session);
  await channel.send({
    chatId: session.chatId,
    text: msg(session).pickPlace(result.query),
    buttons: placeChoiceButtons(result.choices, result.query, session.locale),
  });
}

function typedPlaceQuery(inbound: InboundMessage) {
  const text = inbound.text?.trim() ?? "";
  if (!text || text.startsWith("/")) return null;
  return text;
}

function isOpenDispatch(job: DispatchJob) {
  return (
    job.status === "ring_taxis" ||
    job.status === "ring_companies" ||
    job.status === "hold"
  );
}

function canBookerCancel(job: DispatchJob) {
  return (
    isOpenDispatch(job) ||
    job.status === "assigned" ||
    job.status === "en_route" ||
    job.status === "arrived"
  );
}

export async function cancelOpenJob(
  channel: ChatChannel,
  inbound: InboundMessage,
  job: DispatchJob,
) {
  if (job.bookerChatId !== inbound.chatId) {
    await channel.send({
      chatId: inbound.chatId,
      text: msg(job.bookerLocale).notYourRequest,
    });
    return;
  }
  if (!canBookerCancel(job)) {
    await channel.send({
      chatId: inbound.chatId,
      text: msg(job.bookerLocale).requestInactive,
    });
    return;
  }
  const ringing = isOpenDispatch(job);
  const driverChat = acceptedChatId(job) ?? heldChatId(job);
  await saveJob(cancelJob(job));
  if (driverChat && driverChat !== inbound.chatId) {
    const driverLocale = await localeForChat(job.channel, driverChat);
    await channel.send({
      chatId: driverChat,
      locale: driverLocale,
      notice: "cancel",
      templateParams: driverNoticeParams("cancel", job, driverLocale),
      text: t(driverLocale).requestCancelled(jobLabel(job)),
    });
  }
  if (ringing) {
    await notifyTaken(channel, { ...job, status: "cancelled" });
  }
  await channel.send({
    chatId: inbound.chatId,
    text: msg(job.bookerLocale).requestCancelled(jobLabel(job)),
  });
  await clearSessionIfJob(job.channel, job.bookerChatId, job.id);
}

export async function handleBooker(
  channel: ChatChannel,
  inbound: InboundMessage,
  session: BookerSession,
): Promise<boolean> {
  const button = inbound.buttonId ?? "";
  const text = inbound.text?.trim() ?? "";

  if (button === "x" || /^\/?(annuler|cancel)$/i.test(text)) {
    const current = session.jobId
      ? await getJob(session.jobId)
      : await lastJobForChat(session.channel, session.chatId);
    if (
      current &&
      canBookerCancel(current) &&
      current.bookerChatId === inbound.chatId
    ) {
      await cancelOpenJob(channel, inbound, current);
      return true;
    }
    await clearSession(session.channel, session.chatId);
    await channel.send({
      chatId: session.chatId,
      text: msg(session).draftCancelled,
      removeKeyboard: true,
    });
    return true;
  }

  if (button === "go" || text === "/taxi") {
    await startBooking(channel, inbound, session);
    return true;
  }
  if (session.step === "idle" || session.step === "lang") {
    return false;
  }

  if (session.step === "place_pick") {
    const side = session.placePickSide ?? "pickup";
    if (button === "pick:custom") {
      await applyPlace(
        channel,
        session,
        customPlace(session.placeQuery ?? ""),
        side,
      );
      return true;
    }
    if (button.startsWith("pick:")) {
      const index = Number(button.slice(5));
      const candidate = session.placeCandidates?.[index];
      if (!candidate) {
        await channel.send({
          chatId: session.chatId,
          text: msg(session).placeNotFound,
          buttons: placeChoiceButtons(
            session.placeCandidates ?? [],
            session.placeQuery ?? "",
            session.locale,
          ),
        });
        return true;
      }
      const place = await hydratePlaceSuggestion(candidate, {
        sessionToken: session.placesToken,
        language: resolveLocale(session.locale),
      });
      await applyPlace(channel, session, place, side);
      return true;
    }
    const shortcut = await resolvePlace(inbound, side === "pickup" ? "p" : "d");
    if (shortcut) {
      await applyPlace(channel, session, shortcut, side);
      return true;
    }
    const typed = typedPlaceQuery(inbound);
    if (typed) {
      await offerTypedPlace(channel, session, typed, side);
      return true;
    }
    await channel.send({
      chatId: session.chatId,
      text: msg(session).pickPlace(session.placeQuery ?? ""),
      buttons: placeChoiceButtons(
        session.placeCandidates ?? [],
        session.placeQuery ?? "",
        session.locale,
      ),
    });
    return true;
  }

  if (session.step === "pickup" || session.step === "pickup_text") {
    if (button === "p:other") {
      session.step = "pickup_text";
      await saveSession(session);
      await channel.send({
        chatId: session.chatId,
        text: msg(session).typePickup,
      });
      return true;
    }
    const place = await resolvePlace(inbound, "p");
    if (place) {
      await applyPlace(channel, session, place, "pickup");
      return true;
    }
    const typed = typedPlaceQuery(inbound);
    if (typed) {
      await offerTypedPlace(channel, session, typed, "pickup");
      return true;
    }
    await channel.send({
      chatId: session.chatId,
      text: msg(session).placeNotFound,
      buttons: placeButtons("p", session.locale),
    });
    return true;
  }

  if (session.step === "dropoff" || session.step === "dropoff_text") {
    if (button === "d:other") {
      session.step = "dropoff_text";
      await saveSession(session);
      await channel.send({
        chatId: session.chatId,
        text: msg(session).typeDestination,
      });
      return true;
    }
    const place = await resolvePlace(inbound, "d");
    if (place) {
      await applyPlace(channel, session, place, "dropoff");
      return true;
    }
    const typed = typedPlaceQuery(inbound);
    if (typed) {
      await offerTypedPlace(channel, session, typed, "dropoff");
      return true;
    }
    await channel.send({
      chatId: session.chatId,
      text: msg(session).specifyDestination,
      buttons: placeButtons("d", session.locale),
    });
    return true;
  }

  if (session.step === "zone") {
    if (button.startsWith("zpage:")) {
      await askZone(
        channel,
        session,
        session.zoneSide ?? "pickup",
        Number(button.slice(6)) || 0,
      );
      return true;
    }
    if (button.startsWith("z:")) {
      const zone = button.slice(2) as FareZoneId;
      if (!FARE_ZONE_IDS.includes(zone)) return true;
      const side = session.zoneSide ?? "pickup";
      if (side === "pickup" && session.pickup) {
        session.pickup = { ...session.pickup, fareZone: zone };
      }
      if (side === "dropoff" && session.dropoff) {
        session.dropoff = { ...session.dropoff, fareZone: zone };
      }
      session.zoneSide = null;
      if (side === "pickup") await askDropoff(channel, session);
      else await askWhen(channel, session);
      return true;
    }
  }

  if (
    session.step === "when" ||
    session.step === "when_day" ||
    session.step === "when_time"
  ) {
    if (button === "when:now") {
      session.departAt = new Date().toISOString();
      session.departDay = null;
      await askPax(channel, session);
      return true;
    }
    if (button === "when:today" || button === "when:later") {
      if (!dayStillOpen(localYmd(new Date()))) {
        await channel.send({
          chatId: session.chatId,
          text: msg(session).noMoreToday,
          buttons: whenHomeButtons(session.locale),
        });
        session.step = "when";
        await saveSession(session);
        return true;
      }
      session.departDay = localYmd(new Date());
      await askWhenTime(channel, session);
      return true;
    }
    if (button === "when:otherday") {
      await askWhenDay(channel, session);
      return true;
    }
    if (button === "when:backhome") {
      await askWhen(channel, session);
      return true;
    }
    if (button === "when:backday") {
      await askWhenDay(channel, session);
      return true;
    }
    if (session.step === "when_day" && button.startsWith("dpage:")) {
      await askWhenDay(channel, session, Number(button.slice(6)) || 0);
      return true;
    }
    if (session.step === "when_day" && button.startsWith("day:")) {
      session.departDay = button.slice(4);
      await askWhenTime(channel, session);
      return true;
    }
    if (session.step === "when_time" && text && !button) {
      const at = session.departDay
        ? parseTimeOnDay(text, session.departDay)
        : null;
      if (!at) {
        const clock = parseClock(foldFr(text));
        const past =
          clock &&
          !clock.datePart &&
          session.departDay &&
          isPast(
            atLocal(session.departDay, clock.hour, clock.minute),
            new Date(),
          );
        await channel.send({
          chatId: session.chatId,
          text: past ? msg(session).timePast : msg(session).typeTime,
        });
        return true;
      }
      session.departAt = at.toISOString();
      session.departDay = null;
      await askPax(channel, session);
      return true;
    }
    if (session.step === "when_day") {
      await channel.send({
        chatId: session.chatId,
        text: msg(session).chooseDay,
        buttons: dayButtons(0, new Date(), session.locale),
      });
      return true;
    }
    if (session.step === "when_time") {
      await askWhenTime(channel, session);
      return true;
    }
    await channel.send({
      chatId: session.chatId,
      text: msg(session).chooseWhen,
      buttons: whenHomeButtons(session.locale),
    });
    return true;
  }

  if (session.step === "pax" && button.startsWith("pax:")) {
    session.pax = Number(button.slice(4));
    await askPhone(channel, session);
    return true;
  }

  if (session.step === "phone") {
    const phone = inbound.contact?.phone ?? (isValidPhone(text) ? text : null);
    if (!phone || !isValidPhone(phone)) {
      await channel.send({
        chatId: session.chatId,
        text: msg(session).invalidPhone,
        requestContact: true,
      });
      return true;
    }
    session.passengerPhone = phone;
    await showQuote(channel, session);
    return true;
  }

  if (session.step === "confirm") {
    if (button === "edit") {
      await startBooking(channel, inbound, session);
      return true;
    }
    if (
      button === "ok" ||
      /^(confirmer|oui|ok|yes)$/i.test(text)
    ) {
      await confirmDispatch(channel, session);
      return true;
    }
  }

  if (session.step === "dispatching") {
    const current = session.jobId ? await getJob(session.jobId) : null;
    if (
      current?.status === "hold" &&
      (button === "ok" || /^(confirmer|oui|ok|yes)$/i.test(text))
    ) {
      await settleHold(channel, inbound, current, "confirm");
      return true;
    }
    if (
      current?.status === "hold" &&
      (button === "no" || /^(non|no|refuser)$/i.test(text))
    ) {
      await settleHold(channel, inbound, current, "reject");
      return true;
    }
    await channel.send({
      chatId: session.chatId,
      text: msg(session).searchInProgress,
      buttons: [[{ id: "go", label: msg(session).newRequest }]],
    });
    return true;
  }

  return false;
}

async function resolvePlace(inbound: InboundMessage, prefix: "p" | "d"): Promise<Place | null> {
  const button = inbound.buttonId ?? "";
  if (prefix === "p" && button === "p:last") {
    const last = await lastJobForChat(inbound.channel, inbound.chatId);
    return last?.pickup ?? null;
  }
  if (inbound.location) {
    return fromLocation(inbound.location.lat, inbound.location.lng);
  }
  if (button.startsWith(`${prefix}:`) && button !== `${prefix}:other`) {
    const index = Number(button.slice(2));
    const names = prefix === "p" ? PICKUP_CHOICES : [...POPULAR_DESTINATIONS];
    const name = names[index];
    return name ? catalogPlace(name) : null;
  }
  return null;
}

async function confirmDispatch(channel: ChatChannel, session: BookerSession) {
  if (!session.pickup || !session.dropoff || !session.departAt || !session.pax || !session.passengerPhone) {
    return;
  }
  const quote = buildOfficialQuote(
    session.pickup,
    session.dropoff,
    new Date(session.departAt),
  );
  const now = new Date();
  const job: DispatchJob = {
    id: crypto.randomUUID(),
    channel: session.channel,
    bookerChatId: session.chatId,
    bookerLocale: resolveLocale(session.locale),
    status: "ring_taxis",
    ringStartedAt: now.toISOString(),
    ringEndsAt: now.toISOString(),
    pickup: session.pickup,
    dropoff: session.dropoff,
    departAt: session.departAt,
    pax: session.pax,
    passengerPhone: session.passengerPhone,
    quote,
    offers: [],
    hold: null,
    reofferAt: null,
    acceptedBy: null,
    createdAt: now.toISOString(),
  };
  const bindings = await listStaff();
  const busy = busySupplierIds(await listAssignedJobs(), job);
  const live = startTaxiRing(job, now, bindings, undefined, undefined, busy);
  await saveJob(live);
  session.step = "dispatching";
  session.jobId = live.id;
  await saveSession(session);
  const wait = ringDurationLabel();
  const copy = msg(session);
  const ringLabel =
    live.status === "ring_taxis"
      ? copy.searchingTaxi(wait, jobLabel(live))
      : copy.searchingCompanies(wait, jobLabel(live));
  await channel.send({
    chatId: session.chatId,
    text: ringLabel,
    buttons: [
      [
        { id: `x:${jobCallbackId(live.id)}`, label: copy.cancel },
        { id: "go", label: copy.newRequest },
      ],
    ],
  });
  await notifyRing(channel, live);
}

export async function settleHold(
  channel: ChatChannel,
  inbound: InboundMessage,
  job: DispatchJob,
  action: "confirm" | "reject",
) {
  const locale = msg(job.bookerLocale);
  if (job.bookerChatId !== inbound.chatId) {
    await channel.send({
      chatId: inbound.chatId,
      text: locale.notYourRequest,
    });
    return;
  }
  const now = new Date();
  if (job.status !== "hold" || isHoldExpired(job, now)) {
    if (job.status === "hold") {
      await advanceJob(channel, job);
      return;
    }
    await channel.send({
      chatId: inbound.chatId,
      text: locale.offerExpired,
    });
    return;
  }

  if (action === "confirm") {
    const accepted = confirmHold(job, now);
    if (!accepted) {
      await channel.send({
        chatId: inbound.chatId,
        text: locale.offerGone,
      });
      return;
    }
    await saveJob(accepted);
    const driverChat = acceptedChatId(accepted);
    if (driverChat) {
      const driverLocale = await localeForChat(accepted.channel, driverChat);
      await channel.send({
        chatId: driverChat,
        locale: driverLocale,
        text: assignedDriverText(accepted, driverLocale),
        buttons: driverJobButtons(accepted, driverLocale),
      });
    }
    if (driverChat !== accepted.bookerChatId) {
      await channel.send({
        chatId: accepted.bookerChatId,
        locale: resolveLocale(accepted.bookerLocale),
        text: assignedBookerText(accepted, accepted.bookerLocale),
      });
    }
    await notifyTaken(channel, accepted, driverChat ?? undefined);
    await clearSessionIfJob(
      accepted.channel,
      accepted.bookerChatId,
      accepted.id,
    );
    return;
  }

  const driverChat = heldChatId(job);
  const rejected = rejectHold(job, now);
  if (!rejected) {
    await channel.send({
      chatId: inbound.chatId,
      text: locale.offerGone,
    });
    return;
  }
  await saveJob(rejected);
  await channel.send({
    chatId: inbound.chatId,
    text: locale.holdRejected,
  });
  if (driverChat && driverChat !== job.bookerChatId) {
    const driverLocale = await localeForChat(job.channel, driverChat);
    await channel.send({
      chatId: driverChat,
      locale: driverLocale,
      text: t(driverLocale).holdRejectedDriver,
    });
  }
  await advanceJob(channel, rejected);
}

export async function advanceJob(channel: ChatChannel, job: DispatchJob) {
  const now = new Date();
  const bindings = await listStaff();
  const busy = busySupplierIds(await listAssignedJobs(), job);
  const previous = job.status;
  const heldChat = previous === "hold" ? heldChatId(job) : null;
  const next = tickJob(job, now, bindings, undefined, busy);
  if (next.status === previous) return next;
  await saveJob(next);
  if (previous === "hold" && next.status === "cancelled") {
    const bookerLocale = resolveLocale(next.bookerLocale);
    await channel.send({
      chatId: next.bookerChatId,
      locale: bookerLocale,
      text: msg(next.bookerLocale).holdExpired(jobLabel(next)),
    });
    if (heldChat && heldChat !== next.bookerChatId) {
      const driverLocale = await localeForChat(next.channel, heldChat);
      await channel.send({
        chatId: heldChat,
        locale: driverLocale,
        notice: "cancel",
        templateParams: driverNoticeParams("cancel", next, driverLocale),
        text: t(driverLocale).holdExpiredDriver,
      });
    }
    await notifyTaken(channel, next, heldChat ?? undefined);
    await clearSessionIfJob(next.channel, next.bookerChatId, next.id);
    return next;
  }
  if (next.status === "ring_companies") {
    await channel.send({
      chatId: next.bookerChatId,
      locale: resolveLocale(next.bookerLocale),
      text: msg(next.bookerLocale).noTaxiWentPrivate(
        ringDurationLabel(),
        jobLabel(next),
      ),
    });
    await notifyRing(channel, next);
  }
  if (next.status === "unfilled") {
    await channel.send({
      chatId: next.bookerChatId,
      locale: resolveLocale(next.bookerLocale),
      text: msg(next.bookerLocale).unfilled(jobLabel(next)),
    });
    await clearSessionIfJob(next.channel, next.bookerChatId, next.id);
  }
  return next;
}
