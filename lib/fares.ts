import type {
  FareBand,
  FareQuote,
  FareZoneId,
  LatLng,
  Place,
} from "./types";

export const SBH_TIME_ZONE = "America/St_Barthelemy";

/** Neighborhood order matches the Collectivité 2024-052 CT annex grid. */
export const FARE_ZONE_IDS = [
  "airport",
  "gustavia",
  "la-pointe",
  "saint-jean",
  "lorient",
  "vitet",
  "devet",
  "marigot",
  "pointe-milou",
  "grand-cul-de-sac",
  "toiny",
  "grand-fond",
  "saline",
  "public",
  "corossol",
  "lurin",
  "gouverneur",
  "flamands",
  "anse-des-cayes",
  "colombier",
  "ti-morne",
] as const satisfies readonly FareZoneId[];

export const FARE_ZONE_LABELS: Record<FareZoneId, string> = {
  airport: "Aéroport",
  gustavia: "Gustavia",
  "la-pointe": "La Pointe / Shell Beach",
  "saint-jean": "Saint-Jean",
  lorient: "Lorient",
  vitet: "Vitet",
  devet: "Dévet",
  marigot: "Marigot",
  "pointe-milou": "Pointe Milou",
  "grand-cul-de-sac": "Grand / Petit Cul-de-Sac",
  toiny: "Toiny",
  "grand-fond": "Grand Fond",
  saline: "Salines",
  public: "Public",
  corossol: "Corossol",
  lurin: "Lurin",
  gouverneur: "Gouverneur",
  flamands: "Flamands",
  "anse-des-cayes": "Anse des Cayes / Lézards",
  colombier: "Colombier",
  "ti-morne": "Ti-Morne / View Point",
};

const ZONE_INDEX: Record<FareZoneId, number> = Object.fromEntries(
  FARE_ZONE_IDS.map((zone, index) => [zone, index]),
) as Record<FareZoneId, number>;

/** Wikipedia quartier infobox pins (en.wikipedia.org numbered map). Ti-Morne has no quartier page. */
const ZONE_CENTROIDS: Record<FareZoneId, LatLng> = {
  airport: { lat: 17.903333, lng: -62.843056 },
  gustavia: { lat: 17.897908, lng: -62.850556 },
  "la-pointe": { lat: 17.898333, lng: -62.8525 },
  "saint-jean": { lat: 17.901389, lng: -62.835 },
  lorient: { lat: 17.907222, lng: -62.820556 },
  vitet: { lat: 17.903333, lng: -62.806944 },
  devet: { lat: 17.901944, lng: -62.797778 },
  marigot: { lat: 17.913056, lng: -62.809167 },
  "pointe-milou": { lat: 17.915833, lng: -62.815556 },
  "grand-cul-de-sac": { lat: 17.908056, lng: -62.805833 },
  toiny: { lat: 17.897222, lng: -62.8 },
  "grand-fond": { lat: 17.896667, lng: -62.804722 },
  saline: { lat: 17.897222, lng: -62.815 },
  public: { lat: 17.903333, lng: -62.851389 },
  corossol: { lat: 17.908333, lng: -62.856111 },
  lurin: { lat: 17.8925, lng: -62.839722 },
  gouverneur: { lat: 17.881111, lng: -62.836667 },
  flamands: { lat: 17.918889, lng: -62.859167 },
  "anse-des-cayes": { lat: 17.912778, lng: -62.846111 },
  colombier: { lat: 17.920556, lng: -62.870278 },
  "ti-morne": { lat: 17.91792, lng: -62.865354 },
};

const PLACE_ZONES: Record<string, FareZoneId> = {
  Aéroport: "airport",
  Gustavia: "gustavia",
  "La Pointe": "la-pointe",
  "Shell Beach": "la-pointe",
  "Saint-Jean": "saint-jean",
  "Saint-Jean Beach": "saint-jean",
  "Eden Rock": "saint-jean",
  InterContinental: "saint-jean",
  Lorient: "lorient",
  Vitet: "vitet",
  Dévet: "devet",
  Marigot: "marigot",
  "Pointe Milou": "pointe-milou",
  "Grand Cul-de-Sac": "grand-cul-de-sac",
  "Petit Cul-de-Sac": "grand-cul-de-sac",
  "Le Guanahani": "grand-cul-de-sac",
  Toiny: "toiny",
  "Grand Fond": "grand-fond",
  Saline: "saline",
  Salines: "saline",
  Public: "public",
  "Maya's": "public",
  Corossol: "corossol",
  Lurin: "lurin",
  Gouverneur: "gouverneur",
  Flamands: "flamands",
  "Cheval Blanc": "flamands",
  "Anse des Cayes": "anse-des-cayes",
  Lézards: "anse-des-cayes",
  Kitchen: "anse-des-cayes",
  Colombier: "colombier",
  "Colombier Beach": "colombier",
  "Ti Morne": "ti-morne",
  "View Point": "ti-morne",
  "Le Carl Gustaf": "gustavia",
  "Le Select": "gustavia",
  Bonito: "gustavia",
};

/** Longer needles first so “shell beach” wins over “gustavia” in an address. */
const ZONE_ALIASES: { zone: FareZoneId; needles: string[] }[] = [
  { zone: "airport", needles: ["aeroport", "airport", "remy de haenen"] },
  {
    zone: "grand-cul-de-sac",
    needles: [
      "grand cul-de-sac",
      "grand cul de sac",
      "petit cul-de-sac",
      "petit cul de sac",
      "guanahani",
    ],
  },
  { zone: "la-pointe", needles: ["shell beach", "la pointe"] },
  {
    zone: "anse-des-cayes",
    needles: ["anse des cayes", "lezards"],
  },
  {
    zone: "ti-morne",
    needles: ["ti-morne", "ti morne", "view point", "viewpoint"],
  },
  { zone: "pointe-milou", needles: ["pointe milou"] },
  {
    zone: "saint-jean",
    needles: [
      "saint-jean",
      "saint jean",
      "st-jean",
      "st jean",
      "eden rock",
      "intercontinental",
    ],
  },
  { zone: "grand-fond", needles: ["grand fond"] },
  { zone: "gouverneur", needles: ["gouverneur"] },
  { zone: "colombier", needles: ["colombier"] },
  { zone: "flamands", needles: ["flamands", "cheval blanc", "isle de france"] },
  { zone: "gustavia", needles: ["gustavia", "carl gustaf"] },
  { zone: "lorient", needles: ["lorient"] },
  { zone: "vitet", needles: ["vitet"] },
  { zone: "devet", needles: ["devet"] },
  { zone: "marigot", needles: ["marigot"] },
  { zone: "toiny", needles: ["toiny"] },
  { zone: "saline", needles: ["salines", "saline"] },
  { zone: "corossol", needles: ["corossol"] },
  { zone: "lurin", needles: ["lurin"] },
  { zone: "public", needles: ["public"] },
];

/**
 * Directed daytime forfaits from the 2024-052 CT annex.
 * Rows/columns follow `FARE_ZONE_IDS`. Same-quartier trips are 25 €;
 * the printed airport↔airport cell is a dash, treated as that local fare.
 */
const DAYTIME_FARE_GRID: number[][] = [
  [25, 25, 30, 25, 30, 40, 45, 40, 40, 45, 50, 50, 30, 25, 30, 35, 40, 35, 30, 30, 35],
  [25, 25, 25, 30, 35, 45, 50, 45, 45, 50, 55, 55, 35, 25, 30, 30, 35, 35, 30, 30, 35],
  [30, 25, 25, 35, 40, 50, 55, 50, 50, 55, 60, 60, 40, 30, 35, 30, 35, 40, 35, 35, 40],
  [25, 30, 35, 25, 30, 40, 45, 40, 40, 45, 50, 50, 30, 30, 35, 35, 40, 35, 30, 30, 40],
  [30, 35, 40, 30, 25, 35, 40, 30, 30, 35, 45, 45, 30, 35, 40, 40, 40, 40, 35, 35, 45],
  [40, 45, 50, 40, 35, 25, 25, 30, 35, 30, 35, 35, 40, 40, 45, 45, 45, 45, 45, 45, 50],
  [45, 50, 55, 45, 40, 25, 25, 30, 40, 35, 35, 40, 45, 45, 50, 50, 50, 50, 50, 50, 55],
  [40, 45, 50, 35, 30, 30, 30, 25, 30, 30, 30, 35, 40, 40, 45, 45, 45, 45, 45, 45, 50],
  [40, 45, 50, 40, 30, 35, 40, 30, 25, 30, 35, 35, 40, 40, 45, 45, 50, 45, 45, 45, 50],
  [45, 50, 55, 45, 40, 30, 30, 30, 35, 25, 30, 30, 45, 45, 50, 50, 55, 55, 50, 50, 55],
  [50, 55, 60, 50, 45, 40, 40, 35, 40, 30, 25, 25, 45, 50, 55, 55, 60, 55, 50, 55, 60],
  [50, 55, 60, 50, 40, 40, 40, 35, 40, 35, 25, 25, 40, 45, 50, 50, 55, 55, 50, 55, 60],
  [30, 35, 40, 30, 30, 40, 45, 40, 40, 45, 45, 40, 25, 35, 40, 35, 35, 40, 35, 35, 40],
  [25, 25, 30, 30, 35, 40, 45, 40, 45, 45, 50, 50, 40, 25, 30, 35, 40, 30, 30, 30, 35],
  [30, 30, 35, 35, 40, 45, 50, 45, 45, 50, 55, 55, 45, 30, 25, 40, 45, 35, 30, 30, 30],
  [35, 30, 30, 35, 40, 45, 50, 45, 50, 50, 55, 55, 35, 35, 40, 25, 25, 40, 40, 40, 45],
  [40, 35, 35, 40, 45, 50, 55, 50, 50, 55, 55, 55, 40, 40, 45, 25, 25, 45, 45, 45, 50],
  [35, 35, 40, 35, 40, 50, 55, 50, 50, 55, 55, 55, 40, 30, 35, 40, 45, 25, 30, 30, 35],
  [30, 30, 35, 30, 35, 45, 50, 45, 45, 50, 50, 50, 35, 30, 30, 40, 40, 30, 25, 30, 35],
  [30, 30, 40, 35, 40, 45, 50, 45, 45, 50, 55, 55, 35, 30, 30, 40, 45, 30, 30, 25, 25],
  [35, 35, 40, 40, 45, 50, 55, 50, 50, 55, 60, 60, 40, 35, 30, 45, 50, 35, 35, 25, 25],
];

/**
 * 2024-052 CT annex, times in America/St_Barthelemy:
 * day 6:00–18:30 = grid; evening 18:30–midnight, Sunday, holiday = +5 €;
 * night midnight–6:00 = +10 €. Official fares are euros; dollars use the day's rate.
 */
const EVENING_SURCHARGE = 5;
const NIGHT_SURCHARGE = 10;

const PUBLIC_HOLIDAYS = new Set([
  "2026-01-01",
  "2026-04-06",
  "2026-05-01",
  "2026-05-08",
  "2026-05-14",
  "2026-05-25",
  "2026-07-14",
  "2026-08-15",
  "2026-10-09",
  "2026-11-01",
  "2026-11-11",
  "2026-12-25",
  "2027-01-01",
  "2027-03-29",
  "2027-05-01",
  "2027-05-06",
  "2027-05-08",
  "2027-05-17",
  "2027-07-14",
  "2027-08-15",
  "2027-10-09",
  "2027-11-01",
  "2027-11-11",
  "2027-12-25",
  "2028-01-01",
  "2028-04-17",
  "2028-05-01",
  "2028-05-08",
  "2028-05-25",
  "2028-06-05",
  "2028-07-14",
  "2028-08-15",
  "2028-10-09",
  "2028-11-01",
  "2028-11-11",
  "2028-12-25",
]);

function foldFr(value: string) {
  return value
    .toLocaleLowerCase("fr")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/['’]/g, " ");
}

function containsNeedle(haystack: string, needle: string) {
  const index = haystack.indexOf(needle);
  if (index < 0) return false;
  const before = index === 0 ? "" : haystack[index - 1];
  const afterIndex = index + needle.length;
  const after = afterIndex >= haystack.length ? "" : haystack[afterIndex];
  const edge = (char: string) => !char || /[^a-z0-9]/.test(char);
  return edge(before) && edge(after);
}

function haversineKm(a: LatLng, b: LatLng) {
  const toRad = (value: number) => (value * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const sinLat = Math.sin(dLat / 2);
  const sinLng = Math.sin(dLng / 2);
  const h =
    sinLat * sinLat +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * sinLng * sinLng;
  return 2 * 6371 * Math.asin(Math.min(1, Math.sqrt(h)));
}

function stBarthParts(date: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: SBH_TIME_ZONE,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "";

  return {
    weekday: read("weekday"),
    year: read("year"),
    month: read("month"),
    day: read("day"),
    hour: Number(read("hour")),
    minute: Number(read("minute")),
  };
}

export function getFareBand(at: Date): FareBand {
  const { weekday, year, month, day, hour, minute } = stBarthParts(at);
  const minutes = hour * 60 + minute;
  if (minutes < 6 * 60) return "night";
  const isoDate = `${year}-${month}-${day}`;
  const sundayOrHoliday = weekday === "Sun" || PUBLIC_HOLIDAYS.has(isoDate);
  if (sundayOrHoliday || minutes >= 18 * 60 + 30) return "evening";
  return "day";
}

export function surchargeForBand(band: FareBand) {
  if (band === "night") return NIGHT_SURCHARGE;
  if (band === "evening") return EVENING_SURCHARGE;
  return 0;
}

export function zoneFromPlaceName(
  name: string | null | undefined,
  address?: string | null,
): FareZoneId | null {
  if (name && PLACE_ZONES[name]) return PLACE_ZONES[name];
  const haystack = foldFr(`${name ?? ""} ${address ?? ""}`.trim());
  if (!haystack) return null;
  for (const { zone, needles } of ZONE_ALIASES) {
    if (needles.some((needle) => containsNeedle(haystack, needle))) {
      return zone;
    }
  }
  return null;
}

export function nearestFareZone(point: LatLng): FareZoneId {
  let closest: FareZoneId = "gustavia";
  let closestKm = Number.POSITIVE_INFINITY;
  for (const zone of FARE_ZONE_IDS) {
    const distance = haversineKm(point, ZONE_CENTROIDS[zone]);
    if (distance < closestKm) {
      closest = zone;
      closestKm = distance;
    }
  }
  return closest;
}

export function snapToFareZone(point: LatLng): FareZoneId {
  return nearestFareZone(point);
}

export function fareZoneForPlace(place: Place): FareZoneId | null {
  if (place.fareZone) return place.fareZone;
  if (typeof place.lat === "number" && typeof place.lng === "number") {
    return nearestFareZone({ lat: place.lat, lng: place.lng });
  }
  return zoneFromPlaceName(place.name, place.address);
}

export function daytimeFareForZones(
  from: FareZoneId,
  to: FareZoneId,
): number | null {
  const i = ZONE_INDEX[from];
  const j = ZONE_INDEX[to];
  if (i == null || j == null) return null;
  return DAYTIME_FARE_GRID[i][j] ?? null;
}

export function quoteFareForZones(input: {
  zoneFrom: FareZoneId | null;
  zoneTo: FareZoneId | null;
  at?: Date;
}): FareQuote {
  const at = input.at ?? new Date();
  const band = getFareBand(at);
  const surcharge = surchargeForBand(band);
  const daytimeFare =
    input.zoneFrom && input.zoneTo
      ? daytimeFareForZones(input.zoneFrom, input.zoneTo)
      : null;

  return {
    zoneFrom: input.zoneFrom,
    zoneTo: input.zoneTo,
    fareBand: band,
    daytimeFare,
    surcharge,
    fare: daytimeFare == null ? null : daytimeFare + surcharge,
  };
}

export function quoteOfficialFare(input: {
  pickup: LatLng;
  destination: LatLng;
  at?: Date;
}): FareQuote {
  return quoteFareForZones({
    zoneFrom: nearestFareZone(input.pickup),
    zoneTo: nearestFareZone(input.destination),
    at: input.at,
  });
}

export function formatFareBand(band: FareBand) {
  if (band === "night") return "Nuit (0h–6h)";
  if (band === "evening") return "Soir, dimanche ou férié";
  return "Journée (6h–18h30)";
}
