import { SBH_CENTER } from "./config";
import { phoneLabel } from "./phone";
import type { LatLng } from "./types";

export type LicensedTaxiKind = "licensed" | "supplementary";

type TaxiSeed = {
  id: string;
  name: string;
  phone: string;
  vehicle?: string;
};

export type LicensedTaxi = {
  id: string;
  name: string;
  phone: string;
  phoneLabel: string;
  vehicle: string | null;
  kind: LicensedTaxiKind;
  number: string;
  ads: string;
  plate: string;
  pmr: boolean | null;
  hybridElectric: boolean | null;
  registrySource: "demo";
};

const LICENSED_SEEDS: TaxiSeed[] = [
  { id: "taxi-01", name: "CAGAN Mathurin", phone: "+590690773388" },
  { id: "taxi-02", name: "GUMBS Denis", phone: "+590690658885", vehicle: "Hyundai Staria" },
  { id: "taxi-03", name: "GREAUX Karine", phone: "+590690509124" },
  { id: "taxi-04", name: "MAGRAS Liliane", phone: "+590690649579", vehicle: "Mercedes Class V" },
  { id: "taxi-05", name: "BLANCHARD Jean-Claude", phone: "+590690490297" },
  { id: "taxi-06", name: "LAPLACE Ludovic", phone: "+590690334251" },
  { id: "taxi-07", name: "RABAHI Djamel", phone: "+590690263848", vehicle: "Hyundai Staria" },
  { id: "taxi-08", name: "LEDEE Ernest", phone: "+590690508513" },
  { id: "taxi-09", name: "GOUINEAU Julien", phone: "+590690139944", vehicle: "Mercedes Class V" },
  { id: "taxi-10", name: "QUESTEL Claude", phone: "+590690654952" },
  { id: "taxi-11", name: "QUESTEL Amandine", phone: "+590690554652" },
  { id: "taxi-12", name: "ROUX Grégoire", phone: "+590690634724", vehicle: "Mercedes Class V" },
  { id: "taxi-13", name: "GREAUX Frankie", phone: "+590690751519" },
  { id: "taxi-14", name: "GUMBS Ronan", phone: "+590690297008" },
  { id: "taxi-15", name: "LÉDÉE Alan", phone: "+590690660528", vehicle: "Mercedes Class V" },
  { id: "taxi-16", name: "VIRAPIN Claudius", phone: "+590690352076", vehicle: "Mercedes Class V" },
  { id: "taxi-17", name: "QUESTEL Gaël", phone: "+590690531274" },
  { id: "taxi-18", name: "BRISSON Guillaume", phone: "+590690394566", vehicle: "Mercedes Class V" },
  { id: "taxi-19", name: "GREAUX David", phone: "+590690147511" },
  { id: "taxi-20", name: "BERNIER Marie-Hélène", phone: "+590690634609", vehicle: "Hyundai Staria" },
  { id: "taxi-21", name: "BARDON David", phone: "+590690066666", vehicle: "Mercedes Class V" },
  { id: "taxi-22", name: "GREAUX Jimmy", phone: "+590690612502", vehicle: "Hyundai Staria" },
  { id: "taxi-23", name: "ZIMMERMANN Sabrina", phone: "+590690388316", vehicle: "Hyundai Staria" },
  { id: "taxi-24", name: "QUESTEL Germain", phone: "+590690333355" },
  { id: "taxi-25", name: "VAN OVERTVELD Benjamin", phone: "+590690493454" },
  { id: "taxi-26", name: "GOTHSCHECK Pierre", phone: "+590690732721", vehicle: "Mercedes Class V" },
  { id: "taxi-27", name: "GOUINEAU Amandine", phone: "+590690565959" },
  { id: "taxi-28", name: "ESCAX Philippe", phone: "+590690547736" },
  { id: "taxi-29", name: "CHINON Maryse", phone: "+590690268556", vehicle: "Range Rover" },
  { id: "taxi-30", name: "GANDRILLON Pierre", phone: "+590690750646" },
  { id: "taxi-31", name: "VANDER-BAUWHEDE Pascal", phone: "+590690535922" },
  { id: "taxi-32", name: "YANKEY Cornish", phone: "+590690620650" },
  { id: "taxi-33", name: "JULES Rudy", phone: "+590690591722" },
  { id: "taxi-34", name: "CONTIN Clovis", phone: "+590690661348", vehicle: "Mercedes Class V" },
  { id: "taxi-35", name: "QUESTEL Alice", phone: "+590690648949" },
  { id: "taxi-36", name: "FOLLETÊTE Laurent", phone: "+590690598131" },
  { id: "taxi-37", name: "QUESTEL Annabelle", phone: "+590690630985" },
  { id: "taxi-38", name: "GREAUX Ferdinand", phone: "+590690563076" },
  { id: "taxi-39", name: "ROMEO Barbara", phone: "+590690615725", vehicle: "Mercedes Class V" },
  { id: "taxi-40", name: "MAGRAS Ernest", phone: "+590690228378" },
  { id: "taxi-41", name: "GUMBS Donald", phone: "+590690599688", vehicle: "Mercedes Class V" },
  { id: "taxi-42", name: "ROMNEY Sabrina", phone: "+590690599688" },
  { id: "taxi-43", name: "BROTONS Alain", phone: "+590690515166" },
];

const SUPPLEMENTARY_SEEDS: TaxiSeed[] = [
  { id: "taxi-A", name: "GEOLIER Arçon", phone: "+590690315305" },
  { id: "taxi-B", name: "LOPEZ VIEIRA Sandra", phone: "+590690678657" },
  { id: "taxi-C", name: "PLANCHE Rémy", phone: "+590690550558", vehicle: "Mercedes Class V" },
  { id: "taxi-D", name: "QUESTEL Sinclair", phone: "+590690611748", vehicle: "Hyundai Staria" },
  { id: "taxi-E", name: "CHANDES Martin", phone: "+590690546776", vehicle: "Mercedes Class V" },
  { id: "taxi-F", name: "BOUBAKEUR Zouhir", phone: "+590690719913", vehicle: "Mercedes Class V" },
  { id: "taxi-test", name: "LEFRANC Mathis", phone: "+14385437295" },
];

function numberFromId(id: string, kind: LicensedTaxiKind) {
  const suffix = id.replace(/^taxi-/, "");
  return kind === "licensed" ? String(Number(suffix)) : suffix;
}

function toTaxi(seed: TaxiSeed, kind: LicensedTaxiKind): LicensedTaxi {
  const number = numberFromId(seed.id, kind);
  return {
    id: seed.id,
    name: seed.name,
    phone: seed.phone,
    phoneLabel: phoneLabel(seed.phone),
    vehicle: seed.vehicle ?? null,
    kind,
    number,
    ads: `ADS ${number}`,
    plate: kind === "licensed" ? `Taxi n°${number}` : `Supplémentaire ${number}`,
    // The public roster does not establish these capabilities. Keep them
    // unknown until the Collectivité register provides authoritative values.
    pmr: null,
    hybridElectric: null,
    registrySource: "demo",
  };
}

export const LICENSED_TAXIS: LicensedTaxi[] = [
  ...LICENSED_SEEDS.map((seed) => toTaxi(seed, "licensed")),
  ...SUPPLEMENTARY_SEEDS.map((seed) => toTaxi(seed, "supplementary")),
];

export function defaultTaxiLocation(): LatLng {
  return { ...SBH_CENTER };
}

export function taxiCaption(taxi: { plate: string; vehicle: string | null }) {
  return taxi.vehicle ? `${taxi.plate} · ${taxi.vehicle}` : taxi.plate;
}

export function taxiMatchesQuery(
  taxi: {
    name: string;
    phone: string;
    phoneLabel: string;
    ads: string;
    plate: string;
    vehicle: string | null;
  },
  query: string,
) {
  const q = query.trim().toLocaleLowerCase("fr");
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  const haystack = [
    taxi.name,
    taxi.ads,
    taxi.plate,
    taxi.phoneLabel,
    taxi.vehicle ?? "",
  ]
    .join(" ")
    .toLocaleLowerCase("fr");
  if (haystack.includes(q)) return true;
  return digits.length >= 3 && taxi.phone.replace(/\D/g, "").includes(digits);
}
