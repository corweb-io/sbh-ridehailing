import { SBH_PLACES } from "./places";
import { isValidPhone, whatsappPassengerPhone } from "./phone";

export const RIDE_REQUEST_MAX_CHARS = 800;

export const RIDE_REQUEST_EXAMPLE =
  "2 · Eden Rock → Aéroport · maintenant";

export type RideRequestFields = {
  pickupText: string | null;
  destinationText: string | null;
  pax: number | null;
  whenText: string | null;
  departNow: boolean;
  resolvedDepartAt: string | null;
  notes: string | null;
  pmr: boolean;
  hybridElectric: boolean;
  isRideRequest: boolean | null;
};

export type RideRequestParseMethod = "deterministic" | "ai" | "hybrid";

const PLACE_ALIASES: Record<string, string> = {
  airport: "Aéroport",
  aeroport: "Aéroport",
  sbh: "Aéroport",
  "airport sbh": "Aéroport",
  "remy de haenen": "Aéroport",
  "st jean": "Saint-Jean",
  stjean: "Saint-Jean",
  "saint jean": "Saint-Jean",
  eden: "Eden Rock",
  edenrock: "Eden Rock",
  "eden rock": "Eden Rock",
  kitchen: "Kitchen",
  "le select": "Le Select",
  select: "Le Select",
  shell: "Shell Beach",
  "shell beach": "Shell Beach",
  "cheval blanc": "Cheval Blanc",
  guanahani: "Le Guanahani",
  "le guanahani": "Le Guanahani",
  "carl gustaf": "Le Carl Gustaf",
  intercontinental: "InterContinental",
};

const WORD_PAX: Record<string, number> = {
  un: 1,
  une: 1,
  one: 1,
  deux: 2,
  two: 2,
  trois: 3,
  three: 3,
  quatre: 4,
  four: 4,
  cinq: 5,
  five: 5,
  six: 6,
  sept: 7,
  seven: 7,
  huit: 8,
  eight: 8,
};

const NOW_RE =
  /\b(maintenant|now|asap|tout de suite|immediatement|immediate)\b/i;

const PAX_RE =
  /\b(?:pour\s+)?(\d)\s*(?:pax|pers(?:onnes?)?|people|passagers?|passengers?)?\b|\b(\d)\s+(?:people|personnes|passagers|passengers|pax|pers)\b|\b(un|une|one|deux|two|trois|three|quatre|four|cinq|five|six|sept|seven|huit|eight)\s+(?:personnes?|people|pax|pers|passagers?|passengers?)\b/i;

const PHONE_RE = /(?:\+|00)?[\d][\d\s().-]{6,18}\d/g;

const ROUTE_RE =
  /(?:→|->|—|–|\bvers\b|\bto\b)|(?:\b(?:de|from|du)\s+.+\s+(?:à|a|to|vers)\s+)/i;

type PlaceLexeme = { folded: string; name: string };

const PLACE_LEXEMES: PlaceLexeme[] = (() => {
  const seen = new Map<string, string>();
  for (const [alias, name] of Object.entries(PLACE_ALIASES)) {
    seen.set(alias, name);
  }
  for (const place of SBH_PLACES) {
    const folded = foldRideText(place.name);
    if (folded && !seen.has(folded)) seen.set(folded, place.name);
  }
  return [...seen.entries()]
    .map(([folded, name]) => ({ folded, name }))
    .sort((a, b) => b.folded.length - a.folded.length);
})();

export function foldRideText(value: string) {
  return value
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[’']/g, "")
    .replace(/[.,;:]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function emptyRideRequestFields(): RideRequestFields {
  return {
    pickupText: null,
    destinationText: null,
    pax: null,
    whenText: null,
    departNow: false,
    resolvedDepartAt: null,
    notes: null,
    pmr: false,
    hybridElectric: false,
    isRideRequest: null,
  };
}

export function catalogPlaceName(value: string | null | undefined) {
  if (!value) return null;
  const folded = foldRideText(value).replace(/^(the|le|la|les|l|un|une|au|du)\s+/, "");
  if (!folded) return null;
  return PLACE_LEXEMES.find((item) => item.folded === folded)?.name ?? null;
}

export function knownPlaceNames() {
  return SBH_PLACES.map((place) => place.name);
}

export function mergeRideRequestFields(
  base: RideRequestFields,
  overlay: RideRequestFields,
): RideRequestFields {
  return {
    pickupText: base.pickupText || overlay.pickupText,
    destinationText: base.destinationText || overlay.destinationText,
    pax: base.pax ?? overlay.pax,
    whenText: base.whenText || overlay.whenText,
    departNow: base.departNow || overlay.departNow,
    resolvedDepartAt: base.resolvedDepartAt || overlay.resolvedDepartAt,
    notes: base.notes || overlay.notes,
    pmr: base.pmr || overlay.pmr,
    hybridElectric: base.hybridElectric || overlay.hybridElectric,
    isRideRequest:
      overlay.isRideRequest === false
        ? false
        : base.isRideRequest === true || overlay.isRideRequest === true
          ? true
          : overlay.isRideRequest ?? base.isRideRequest,
  };
}

function cleanText(value: string | null | undefined, max = 120) {
  if (!value) return null;
  const trimmed = value.replace(/\s+/g, " ").trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

function parsePax(value: string) {
  const match = value.match(PAX_RE);
  if (!match) return null;
  const numeric = Number(match[1] || match[2]);
  const count =
    Number.isInteger(numeric) && numeric > 0
      ? numeric
      : WORD_PAX[foldRideText(match[3] ?? "")];
  if (!count || count < 1 || count > 8) return null;
  return count;
}

export function extractRidePhone(value: string) {
  const matches = value.match(PHONE_RE) ?? [];
  for (const raw of matches) {
    if (!isValidPhone(raw)) continue;
    return whatsappPassengerPhone(raw) ?? raw.trim();
  }
  return null;
}

function findPlaceMentions(text: string) {
  const folded = ` ${foldRideText(text)} `;
  const found: { name: string; index: number }[] = [];
  const used = new Set<string>();
  for (const lexeme of PLACE_LEXEMES) {
    const needle = ` ${lexeme.folded} `;
    const index = folded.indexOf(needle);
    if (index < 0 || used.has(lexeme.name)) continue;
    used.add(lexeme.name);
    found.push({ name: lexeme.name, index });
  }
  return found.sort((a, b) => a.index - b.index);
}

function applyRoute(fields: RideRequestFields, value: string) {
  const arrow =
    value.match(/^(.+?)\s*(?:→|->|—|–|vers)\s+(.+)$/i) ??
    value.match(/\b(?:de|from|du)\s+(.+?)\s+(?:à|a|to|vers)\s+(.+)/i);
  if (!arrow) return;
  fields.pickupText = fields.pickupText ?? cleanText(arrow[1]);
  fields.destinationText = fields.destinationText ?? cleanText(arrow[2]);
}

function applyLabeledLines(fields: RideRequestFields, text: string) {
  const labels: Record<string, keyof RideRequestFields> = {
    de: "pickupText",
    from: "pickupText",
    depart: "pickupText",
    pickup: "pickupText",
    a: "destinationText",
    to: "destinationText",
    vers: "destinationText",
    dest: "destinationText",
    destination: "destinationText",
    pax: "pax",
    pers: "pax",
    personnes: "pax",
    passagers: "pax",
    passengers: "pax",
    quand: "whenText",
    when: "whenText",
    heure: "whenText",
    note: "notes",
    notes: "notes",
  };
  for (const line of text.split(/\n+/)) {
    const match = line.match(/^\s*([A-Za-zÀ-ÿ]+)\s*[:|=]\s*(.+)\s*$/);
    if (!match) continue;
    const key = labels[foldRideText(match[1])];
    if (!key) continue;
    if (key === "pax") {
      fields.pax = parsePax(match[2]) ?? (Number.parseInt(match[2], 10) || null);
      continue;
    }
    if (
      key === "pickupText" ||
      key === "destinationText" ||
      key === "whenText" ||
      key === "notes"
    ) {
      fields[key] = cleanText(match[2]);
    }
  }
}

function applyCompactSegments(fields: RideRequestFields, text: string) {
  const segments = text
    .split(/\s*[·|]\s*|\s+\/\s+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (segments.length < 2) return;
  for (const segment of segments) {
    if (!fields.pax) {
      const pax = parsePax(segment);
      if (pax && /^(?:\d|.*pax|.*pers|.*people)/i.test(segment)) {
        fields.pax = pax;
        continue;
      }
      if (/^\d$/.test(segment)) {
        fields.pax = Number(segment);
        continue;
      }
    }
    if (NOW_RE.test(segment)) {
      fields.departNow = true;
      continue;
    }
    if (ROUTE_RE.test(segment)) {
      applyRoute(fields, segment);
      continue;
    }
    const catalog = catalogPlaceName(segment);
    if (catalog) {
      if (!fields.pickupText) fields.pickupText = catalog;
      else if (!fields.destinationText) fields.destinationText = catalog;
      continue;
    }
    if (!fields.whenText && /\d{1,2}\s*(?:h|:)/i.test(segment)) {
      fields.whenText = segment;
    }
  }
}

export function parseRideRequestDeterministic(text: string): RideRequestFields {
  const fields = emptyRideRequestFields();
  const trimmed = text.trim().slice(0, RIDE_REQUEST_MAX_CHARS);
  if (!trimmed) return fields;

  applyLabeledLines(fields, trimmed);
  applyCompactSegments(fields, trimmed);
  applyRoute(fields, trimmed);
  if (!fields.pax) fields.pax = parsePax(trimmed);
  if (NOW_RE.test(trimmed)) fields.departNow = true;
  if (!fields.whenText) {
    const clock = trimmed.match(
      /\b((?:demain|tomorrow|aujourd['’]?hui|today|lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche|[0-3]?\d[/-][0-1]?\d)\s+)?\d{1,2}\s*(?:h|:)\s*\d{0,2}\b/i,
    );
    if (clock) fields.whenText = cleanText(clock[0]);
  }
  if (/\b(pmr|fauteuil|wheelchair)\b/i.test(trimmed)) fields.pmr = true;
  if (/\b(hybride|electrique|électrique|electric|hybrid)\b/i.test(trimmed)) {
    fields.hybridElectric = true;
  }

  const mentions = findPlaceMentions(trimmed);
  if (!fields.pickupText && !fields.destinationText && mentions.length >= 2) {
    fields.pickupText = mentions[0].name;
    fields.destinationText = mentions[1].name;
  } else if (!fields.destinationText && mentions.length === 1 && fields.pickupText) {
    fields.destinationText = mentions[0].name;
  } else if (!fields.pickupText && mentions[0]) {
    fields.pickupText = mentions[0].name;
    if (!fields.destinationText && mentions[1]) {
      fields.destinationText = mentions[1].name;
    }
  }

  if (fields.pickupText) {
    fields.pickupText = catalogPlaceName(fields.pickupText) ?? fields.pickupText;
  }
  if (fields.destinationText) {
    fields.destinationText =
      catalogPlaceName(fields.destinationText) ?? fields.destinationText;
  }
  if (fields.pickupText && fields.pickupText === fields.destinationText) {
    fields.destinationText = null;
  }
  if (fields.pax && (fields.pax < 1 || fields.pax > 8)) fields.pax = null;
  if (fields.pickupText && fields.destinationText) fields.isRideRequest = true;
  return fields;
}

export function looksLikeRideRequest(text: string) {
  const trimmed = text.trim();
  if (!trimmed || trimmed.startsWith("/")) return false;
  if (trimmed.length > RIDE_REQUEST_MAX_CHARS) return false;
  if (ROUTE_RE.test(trimmed)) return true;
  if (findPlaceMentions(trimmed).length >= 2) return true;
  if (/\btaxi\b/i.test(trimmed) && findPlaceMentions(trimmed).length >= 1) {
    return true;
  }
  if (
    trimmed.length >= 24 &&
    findPlaceMentions(trimmed).length >= 1 &&
    (parsePax(trimmed) || NOW_RE.test(trimmed) || /\d{1,2}\s*(?:h|:)/i.test(trimmed))
  ) {
    return true;
  }
  return false;
}

export function isSinglePlaceQuery(text: string) {
  const trimmed = text.trim();
  if (!trimmed || ROUTE_RE.test(trimmed)) return false;
  if (parsePax(trimmed) || NOW_RE.test(trimmed)) return false;
  if (findPlaceMentions(trimmed).length !== 1) return false;
  return trimmed.length <= 40;
}

export function rideRequestNeedsModel(fields: RideRequestFields) {
  return !fields.pickupText || !fields.destinationText;
}

export function clampPax(value: number | null | undefined) {
  if (!value || !Number.isFinite(value)) return 1;
  return Math.min(8, Math.max(1, Math.round(value)));
}
