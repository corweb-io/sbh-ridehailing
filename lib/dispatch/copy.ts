import { FARE_ZONE_LABELS } from "../fares";
import { formatEuro } from "../format";
import { t } from "../chat/messages";
import { intlTag, resolveLocale, type ChatLocale } from "../chat/locale";
import { companyById } from "./companies";
import { holdMs, ringMs } from "./engine";
import { LICENSED_TAXIS, taxiCaption } from "../licensed-taxis";
import { formatTripWhen } from "../taxis";
import type { ChatButton, DispatchJob } from "./types";

function durationLabel(ms: number) {
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`;
  const minutes = ms / 60_000;
  return Number.isInteger(minutes)
    ? `${minutes} min`
    : `${minutes.toFixed(1)} min`;
}

export function ringDurationLabel() {
  return durationLabel(ringMs());
}

export function holdDurationLabel() {
  return durationLabel(holdMs());
}

export function jobLabel(
  job: Pick<DispatchJob, "pickup" | "dropoff" | "pax" | "passengerPhone">,
) {
  const digits = job.passengerPhone.replace(/\D/g, "");
  const tail = digits.length >= 4 ? ` · …${digits.slice(-4)}` : "";
  return `${job.pickup.name} → ${job.dropoff.name}${tail}`;
}

export function supplierLabel(kind: "taxi" | "company", id: string) {
  if (kind === "company") {
    return companyById(id)?.name ?? id;
  }
  const taxi = LICENSED_TAXIS.find((item) => item.id === id);
  if (!taxi) return id;
  return `${taxiCaption(taxi)} · ${taxi.name}`;
}

function copy(locale?: ChatLocale | null) {
  return t(resolveLocale(locale));
}

function whenText(iso: string, locale?: ChatLocale | null) {
  return formatTripWhen(new Date(iso), intlTag(resolveLocale(locale)));
}

export function bookerQuoteText(
  job: Pick<
    DispatchJob,
    "pickup" | "dropoff" | "departAt" | "pax" | "quote" | "passengerPhone"
  >,
  locale?: ChatLocale | null,
) {
  const msg = copy(locale);
  const fare =
    job.quote.fare == null
      ? msg.fareTbd
      : `${formatEuro(job.quote.fare)} (${msg.fareBand(job.quote.fareBand).toLowerCase()})`;
  const zones =
    job.quote.zoneFrom && job.quote.zoneTo
      ? `${FARE_ZONE_LABELS[job.quote.zoneFrom]} → ${FARE_ZONE_LABELS[job.quote.zoneTo]}`
      : msg.zonesTbd;
  return [
    msg.recap,
    "",
    `${msg.pickup} : ${job.pickup.name}`,
    `${msg.dropoff} : ${job.dropoff.name}`,
    `${msg.when} : ${whenText(job.departAt, locale)}`,
    msg.passengers(job.pax),
    `${msg.clientPhone} : ${job.passengerPhone}`,
    `${msg.zones} : ${zones}`,
    `${msg.taxiFare} : ${fare}`,
    "",
    ...(job.quote.fare == null ? [msg.customZoneNote, ""] : []),
    msg.privateCompanyNote,
    "",
    msg.pressConfirm,
  ].join("\n");
}

export function taxiOfferText(
  job: DispatchJob,
  supplierId?: string,
  locale?: ChatLocale | null,
) {
  const msg = copy(locale);
  const fare =
    job.quote.fare == null ? msg.fareTbdShort : formatEuro(job.quote.fare);
  const who = supplierId ? supplierLabel("taxi", supplierId) : null;
  return [
    msg.taxiOffer(ringDurationLabel()),
    who,
    "",
    `${msg.pickup} : ${job.pickup.name}`,
    `${msg.dropoff} : ${job.dropoff.name}`,
    `${msg.passengers(job.pax)} · ${fare}`,
    whenText(job.departAt, locale),
    job.quote.fare == null ? msg.driverAssignZone : null,
  ]
    .filter((line) => line != null)
    .join("\n");
}

export function companyOfferText(
  job: DispatchJob,
  supplierId?: string,
  locale?: ChatLocale | null,
) {
  const msg = copy(locale);
  const fare =
    job.quote.fare == null
      ? msg.companyFareMissing
      : msg.companyFareRef(formatEuro(job.quote.fare));
  const who = supplierId ? supplierLabel("company", supplierId) : null;
  return [
    msg.companyOffer(ringDurationLabel()),
    who,
    "",
    `${msg.pickup} : ${job.pickup.name}`,
    `${msg.dropoff} : ${job.dropoff.name}`,
    msg.passengers(job.pax),
    whenText(job.departAt, locale),
    `${msg.clientPhone} : ${job.passengerPhone}`,
    fare,
    job.quote.fare == null ? msg.driverAssignZone : null,
    "",
    msg.companyReplyYes,
  ]
    .filter((line) => line != null)
    .join("\n");
}

export function assignedBookerText(job: DispatchJob, locale?: ChatLocale | null) {
  const msg = copy(locale ?? job.bookerLocale);
  if (!job.acceptedBy) return msg.assigned;
  const who = supplierLabel(job.acceptedBy.kind, job.acceptedBy.supplierId);
  const rate =
    job.acceptedBy.kind === "company" && job.acceptedBy.companyRate != null
      ? msg.companyRate(formatEuro(job.acceptedBy.companyRate))
      : job.quote.fare != null
        ? msg.fareGrid(formatEuro(job.quote.fare))
        : msg.fareOnBoard;
  return [
    jobLabel(job),
    job.acceptedBy.kind === "taxi" ? msg.taxiAccepted : msg.companyAccepted,
    who,
    rate,
  ].join("\n");
}

export function holdBookerText(job: DispatchJob, locale?: ChatLocale | null) {
  const msg = copy(locale ?? job.bookerLocale);
  if (!job.hold) return msg.assigned;
  const who = supplierLabel(job.hold.kind, job.hold.supplierId);
  const rate =
    job.quote.fare != null
      ? msg.fareGrid(formatEuro(job.quote.fare))
      : msg.fareOnBoard;
  return [
    jobLabel(job),
    job.hold.kind === "taxi" ? msg.taxiAccepted : msg.companyAccepted,
    who,
    rate,
    "",
    msg.holdPrompt(holdDurationLabel()),
  ].join("\n");
}

export function holdBookerButtons(
  job: DispatchJob,
  locale?: ChatLocale | null,
): ChatButton[][] {
  const msg = copy(locale ?? job.bookerLocale);
  const id = job.id.slice(0, 8);
  return [
    [
      { id: `hy:${id}`, label: msg.confirm },
      { id: `hn:${id}`, label: msg.decline },
    ],
  ];
}

export function bookerTripStatusText(
  job: DispatchJob,
  locale?: ChatLocale | null,
) {
  const msg = copy(locale ?? job.bookerLocale);
  if (job.status === "en_route") return `${jobLabel(job)}\n${msg.bookerEnRoute}`;
  if (job.status === "arrived") return `${jobLabel(job)}\n${msg.bookerArrived}`;
  if (job.status === "completed") {
    return `${jobLabel(job)}\n${msg.bookerCompleted}`;
  }
  return assignedBookerText(job, locale);
}

function jobFareLine(job: DispatchJob, locale?: ChatLocale | null) {
  const msg = copy(locale ?? job.bookerLocale);
  if (job.acceptedBy?.kind === "company" && job.acceptedBy.companyRate != null) {
    return msg.companyRate(formatEuro(job.acceptedBy.companyRate));
  }
  if (job.quote.fare == null) return msg.fareOnBoard;
  return msg.fareGrid(formatEuro(job.quote.fare));
}

function placeLine(
  label: string,
  place: DispatchJob["pickup"],
) {
  if (place.address && place.address !== place.name) {
    return `${label} : ${place.name}\n${place.address}`;
  }
  return `${label} : ${place.name}`;
}

function driverTitle(job: DispatchJob, locale?: ChatLocale | null) {
  const msg = copy(locale);
  if (job.status === "en_route") return msg.driverEnRoute;
  if (job.status === "arrived") return msg.driverArrived;
  if (job.status === "completed") return msg.driverCompleted;
  return msg.rideAccepted;
}

export function assignedDriverText(
  job: DispatchJob,
  locale?: ChatLocale | null,
) {
  const msg = copy(locale);
  return [
    driverTitle(job, locale),
    "",
    msg.recap,
    placeLine(msg.pickup, job.pickup),
    placeLine(msg.dropoff, job.dropoff),
    `${msg.when} : ${whenText(job.departAt, locale)}`,
    msg.passengers(job.pax),
    `${msg.clientPhone} : ${job.passengerPhone}`,
    jobFareLine(job, locale),
  ].join("\n");
}

export function reminderText(job: DispatchJob, locale?: ChatLocale | null) {
  const msg = copy(locale);
  return [
    msg.reminderTitle,
    "",
    `${job.pickup.name} → ${job.dropoff.name}`,
    `${msg.when} : ${whenText(job.departAt, locale)}`,
    `${msg.clientPhone} : ${job.passengerPhone}`,
  ].join("\n");
}

export function driverNoticeParams(
  kind: "cancel" | "reminder",
  job: Pick<DispatchJob, "pickup" | "dropoff" | "departAt" | "passengerPhone">,
  locale?: ChatLocale | null,
) {
  const route = `${job.pickup.name} → ${job.dropoff.name}`;
  if (kind === "cancel") return [route];
  return [route, whenText(job.departAt, locale), job.passengerPhone];
}

export function upcomingRidesText(
  jobs: readonly DispatchJob[],
  locale?: ChatLocale | null,
) {
  const msg = copy(locale);
  if (jobs.length === 0) return msg.noUpcoming;
  const blocks = jobs.map((job, index) =>
    [
      `${index + 1}. ${whenText(job.departAt, locale)}`,
      `${job.pickup.name} → ${job.dropoff.name}`,
      `${msg.passengers(job.pax)} · ${jobFareLine(job, locale)}`,
      `${msg.clientPhone} ${job.passengerPhone}`,
    ].join("\n"),
  );
  return [
    jobs.length === 1 ? msg.yourRide : msg.yourRides(jobs.length),
    "",
    blocks.join("\n\n"),
  ].join("\n");
}

function bookerListStatus(job: DispatchJob, locale?: ChatLocale | null) {
  const msg = copy(locale ?? job.bookerLocale);
  if (job.status === "ring_taxis" || job.status === "ring_companies") {
    return msg.listStatusSearching;
  }
  if (job.status === "hold") return msg.listStatusHold;
  if (job.status === "en_route") return msg.bookerEnRoute;
  if (job.status === "arrived") return msg.bookerArrived;
  return msg.listStatusAssigned;
}

export function bookerRidesText(
  jobs: readonly DispatchJob[],
  locale?: ChatLocale | null,
) {
  const msg = copy(locale);
  if (jobs.length === 0) return msg.noBookings;
  const blocks = jobs.map((job, index) =>
    [
      `${index + 1}. ${whenText(job.departAt, locale)}`,
      `${job.pickup.name} → ${job.dropoff.name}`,
      `${msg.passengers(job.pax)} · ${bookerListStatus(job, locale)}`,
    ].join("\n"),
  );
  return [
    jobs.length === 1 ? msg.yourBooking : msg.yourBookings(jobs.length),
    "",
    blocks.join("\n\n"),
  ].join("\n");
}

export function ridesChooserText(
  driverCount: number,
  bookerCount: number,
  locale?: ChatLocale | null,
) {
  const msg = copy(locale);
  return [
    msg.whichRides,
    "",
    msg.driverRideCount(driverCount),
    msg.bookerRideCount(bookerCount),
  ].join("\n");
}

export function remainingRingLabel(job: Pick<DispatchJob, "ringEndsAt">) {
  const ms = Date.parse(job.ringEndsAt) - Date.now();
  return durationLabel(Number.isFinite(ms) && ms > 0 ? ms : 1000);
}

export function bookerJobRecapText(
  job: DispatchJob,
  locale?: ChatLocale | null,
) {
  const msg = copy(locale ?? job.bookerLocale);
  const wait = remainingRingLabel(job);
  if (job.status === "ring_taxis") {
    return msg.searchingTaxi(wait, jobLabel(job));
  }
  if (job.status === "ring_companies") {
    return msg.searchingCompanies(wait, jobLabel(job));
  }
  if (job.status === "hold") return holdBookerText(job, locale);
  return bookerTripStatusText(job, locale);
}

export const COURSES_BUTTON = {
  id: "courses",
  label: "Mes courses",
} as const;

export const COURSES_DRIVE_ID = "courses:drive";
export const COURSES_BOOK_ID = "courses:book";

export function coursesButton(locale?: ChatLocale | null) {
  return { id: COURSES_BUTTON.id, label: copy(locale).myRides };
}

export function coursesDriveButton(locale?: ChatLocale | null) {
  return { id: COURSES_DRIVE_ID, label: copy(locale).ridesAsDriver };
}

export function coursesBookButton(locale?: ChatLocale | null) {
  return { id: COURSES_BOOK_ID, label: copy(locale).ridesAsBooker };
}

export function upcomingRideButton(
  job: DispatchJob,
  locale?: ChatLocale | null,
): ChatButton {
  const when = whenText(job.departAt, locale);
  return {
    id: `j:${job.id.slice(0, 8)}`,
    label: `${when} · ${job.pickup.name}`.slice(0, 64),
  };
}

export function bookerRideButton(
  job: DispatchJob,
  locale?: ChatLocale | null,
): ChatButton {
  const when = whenText(job.departAt, locale);
  return {
    id: `b:${job.id.slice(0, 8)}`,
    label: `${when} · ${job.pickup.name}`.slice(0, 64),
  };
}

export function bookerJobButtons(
  job: DispatchJob,
  locale?: ChatLocale | null,
): ChatButton[][] {
  const msg = copy(locale ?? job.bookerLocale);
  const id = job.id.slice(0, 8);
  if (job.status === "hold") return holdBookerButtons(job, locale);
  if (
    job.status === "ring_taxis" ||
    job.status === "ring_companies" ||
    job.status === "assigned" ||
    job.status === "en_route" ||
    job.status === "arrived"
  ) {
    return [
      [
        { id: `x:${id}`, label: msg.cancel },
        coursesButton(locale ?? job.bookerLocale),
      ],
    ];
  }
  return [[coursesButton(locale ?? job.bookerLocale)]];
}

export function driverJobButtons(
  job: DispatchJob,
  locale?: ChatLocale | null,
): ChatButton[][] {
  const msg = copy(locale);
  const id = job.id.slice(0, 8);
  if (job.status === "assigned") {
    return [
      [
        { id: `e:${id}`, label: msg.enRouteBtn },
        { id: `r:${id}`, label: msg.releaseBtn },
      ],
    ];
  }
  if (job.status === "en_route") {
    return [
      [
        { id: `v:${id}`, label: msg.arrivedBtn },
        { id: `r:${id}`, label: msg.releaseBtn },
      ],
    ];
  }
  if (job.status === "arrived") {
    return [[{ id: `d:${id}`, label: msg.doneBtn }]];
  }
  return [];
}
