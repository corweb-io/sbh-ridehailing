import { FARE_ZONE_LABELS } from "../fares";
import { formatEuro } from "../format";
import { t } from "../chat/messages";
import { intlTag, resolveLocale, type ChatLocale } from "../chat/locale";
import { mapsDirHref } from "../maps";
import { companyById } from "./companies";
import { holdMs, ringMs } from "./engine";
import { LICENSED_TAXIS, taxiCaption } from "../licensed-taxis";
import { formatTripWhen, TAXI_STANDS } from "../taxis";
import type {
  ChatButton,
  DispatchJob,
  OutboundMessage,
  WhatsAppNotice,
} from "./types";

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

export function supplierPhoneLabel(kind: "taxi" | "company", id: string) {
  if (kind === "company") {
    return companyById(id)?.phoneLabel ?? null;
  }
  return LICENSED_TAXIS.find((item) => item.id === id)?.phoneLabel ?? null;
}

export function unfilledBookerText(
  job: Pick<DispatchJob, "pickup" | "dropoff" | "pax" | "passengerPhone">,
  locale?: ChatLocale | null,
) {
  const msg = copy(locale);
  const stands = TAXI_STANDS.map((stand) => {
    const name = stand.name.replace(/^Station taxi — /, "");
    return `${name} · ${stand.phoneLabel}`;
  }).join("\n");
  return [msg.unfilled(jobLabel(job)), "", msg.callAStand, stands].join("\n");
}

export function unfilledBookerButtons(
  locale?: ChatLocale | null,
): ChatButton[][] {
  return [[{ id: "go", label: copy(locale).newRequest }]];
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
    msg.payOnBoard,
    "",
    msg.pressConfirm,
  ].join("\n");
}

function offerZoneLine(
  label: string,
  place: DispatchJob["pickup"],
  locale?: ChatLocale | null,
) {
  const msg = copy(locale);
  const zone = place.fareZone;
  return `${label} : ${zone ? FARE_ZONE_LABELS[zone] : msg.zonesTbd}`;
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
    offerZoneLine(msg.pickup, job.pickup, locale),
    offerZoneLine(msg.dropoff, job.dropoff, locale),
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
    offerZoneLine(msg.pickup, job.pickup, locale),
    offerZoneLine(msg.dropoff, job.dropoff, locale),
    msg.passengers(job.pax),
    whenText(job.departAt, locale),
    fare,
    job.quote.fare == null ? msg.driverAssignZone : null,
    "",
    msg.companyReplyYes,
  ]
    .filter((line) => line != null)
    .join("\n");
}

function placeMapsUrl(place: DispatchJob["pickup"]) {
  if (place.lat == null || place.lng == null) return null;
  if (!Number.isFinite(place.lat) || !Number.isFinite(place.lng)) return null;
  return mapsDirHref({ lat: place.lat, lng: place.lng });
}

function mapsLine(
  label: string,
  place: DispatchJob["pickup"],
) {
  const url = placeMapsUrl(place);
  return url ? `${label} : ${url}` : null;
}

function supplierPhoneLine(
  kind: "taxi" | "company",
  id: string,
  locale?: ChatLocale | null,
) {
  const phone = supplierPhoneLabel(kind, id);
  return phone ? `${copy(locale).taxiPhone} : ${phone}` : null;
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
    supplierPhoneLine(job.acceptedBy.kind, job.acceptedBy.supplierId, locale),
    rate,
    mapsLine(msg.mapsPickup, job.pickup),
  ]
    .filter((line) => line != null)
    .join("\n");
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
    supplierPhoneLine(job.hold.kind, job.hold.supplierId, locale),
    rate,
    "",
    msg.holdPrompt(holdDurationLabel()),
  ]
    .filter((line) => line != null)
    .join("\n");
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
    mapsLine(msg.mapsPickup, job.pickup),
    mapsLine(msg.mapsDropoff, job.dropoff),
  ]
    .filter((line) => line != null)
    .join("\n");
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

function routeLine(
  job: Pick<DispatchJob, "pickup" | "dropoff">,
) {
  return `${job.pickup.name} → ${job.dropoff.name}`;
}

function offerRouteLine(
  job: Pick<DispatchJob, "pickup" | "dropoff">,
  locale?: ChatLocale | null,
) {
  const msg = copy(locale);
  const pickup = job.pickup.fareZone
    ? FARE_ZONE_LABELS[job.pickup.fareZone]
    : msg.zonesTbd;
  const dropoff = job.dropoff.fareZone
    ? FARE_ZONE_LABELS[job.dropoff.fareZone]
    : msg.zonesTbd;
  return `${pickup} → ${dropoff}`;
}

export function driverNoticeParams(
  kind: "cancel" | "reminder",
  job: Pick<DispatchJob, "pickup" | "dropoff" | "departAt" | "passengerPhone">,
  locale?: ChatLocale | null,
) {
  const route = routeLine(job);
  if (kind === "cancel") return [route];
  return [route, whenText(job.departAt, locale), job.passengerPhone];
}

export function offerNoticeParams(
  job: Pick<DispatchJob, "pickup" | "dropoff" | "departAt" | "pax">,
  locale?: ChatLocale | null,
) {
  return [
    offerRouteLine(job, locale),
    copy(locale).passengers(job.pax),
    whenText(job.departAt, locale),
  ];
}

export function assignedNoticeParams(
  job: DispatchJob,
  locale?: ChatLocale | null,
) {
  if (!job.acceptedBy) return [routeLine(job)];
  const phone =
    supplierPhoneLabel(job.acceptedBy.kind, job.acceptedBy.supplierId) ?? "-";
  return [
    routeLine(job),
    supplierLabel(job.acceptedBy.kind, job.acceptedBy.supplierId),
    phone,
  ];
}

export function unfilledNoticeParams(
  job: Pick<DispatchJob, "pickup" | "dropoff">,
) {
  return [routeLine(job)];
}

export type TripNoticeKind =
  | "en_route"
  | "arrived"
  | "completed"
  | "released"
  | "taken";

export function tripNoticeParams(
  job: Pick<DispatchJob, "pickup" | "dropoff" | "status">,
  locale?: ChatLocale | null,
  kind?: TripNoticeKind,
) {
  const msg = copy(locale);
  const status =
    kind === "taken"
      ? msg.rideTaken
      : kind === "released"
        ? msg.bookerRideReleased
        : kind === "en_route" || job.status === "en_route"
          ? msg.bookerEnRoute
          : kind === "arrived" || job.status === "arrived"
            ? msg.bookerArrived
            : msg.bookerCompleted;
  return [routeLine(job), status];
}

export function bookerNoticeFields(
  kind: Extract<WhatsAppNotice, "assigned" | "unfilled" | "trip">,
  job: DispatchJob,
  locale?: ChatLocale | null,
  tripKind?: TripNoticeKind,
): Pick<OutboundMessage, "notice" | "templateParams" | "customerAt"> {
  const params =
    kind === "assigned"
      ? assignedNoticeParams(job, locale)
      : kind === "unfilled"
        ? unfilledNoticeParams(job)
        : tripNoticeParams(job, locale, tripKind);
  return {
    notice: kind,
    templateParams: params,
    customerAt: job.createdAt,
  };
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
