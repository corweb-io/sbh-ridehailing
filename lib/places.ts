import { haversineKm } from "./geo";
import type { FareZoneId, Place } from "./types";

type CatalogPlace = Place & {
  lat: number;
  lng: number;
  fareZone: FareZoneId;
};

export const SBH_PLACES: CatalogPlace[] = [
  {
    name: "Gustavia",
    address: "Gustavia, Saint-Barthélemy",
    lat: 17.8961,
    lng: -62.8498,
    fareZone: "gustavia",
  },
  {
    name: "La Pointe",
    address: "La Pointe, Gustavia",
    lat: 17.8918,
    lng: -62.8532,
    fareZone: "la-pointe",
  },
  {
    name: "Saint-Jean",
    address: "Saint-Jean, Saint-Barthélemy",
    lat: 17.9047,
    lng: -62.83,
    fareZone: "saint-jean",
  },
  {
    name: "Lorient",
    address: "Lorient, Saint-Barthélemy",
    lat: 17.9065,
    lng: -62.8115,
    fareZone: "lorient",
  },
  {
    name: "Kitchen",
    address: "Anse des Cayes (Kitchen), Saint-Barthélemy",
    lat: 17.910079,
    lng: -62.841066,
    fareZone: "anse-des-cayes",
  },
  {
    name: "Anse des Cayes",
    address: "Anse des Cayes, Saint-Barthélemy",
    lat: 17.9126,
    lng: -62.8448,
    fareZone: "anse-des-cayes",
  },
  {
    name: "Lézards",
    address: "Lézards, Saint-Barthélemy",
    lat: 17.9118,
    lng: -62.8374,
    fareZone: "anse-des-cayes",
  },
  {
    name: "Colombier",
    address: "Colombier, Saint-Barthélemy",
    lat: 17.9208,
    lng: -62.8635,
    fareZone: "colombier",
  },
  {
    name: "Ti Morne",
    address: "Ti Morne, Saint-Barthélemy",
    lat: 17.9158,
    lng: -62.8664,
    fareZone: "ti-morne",
  },
  {
    name: "View Point",
    address: "Colombier View Point, Saint-Barthélemy",
    lat: 17.9178,
    lng: -62.8694,
    fareZone: "ti-morne",
  },
  {
    name: "Flamands",
    address: "Flamands, Saint-Barthélemy",
    lat: 17.9185,
    lng: -62.853,
    fareZone: "flamands",
  },
  {
    name: "Grand Cul-de-Sac",
    address: "Grand Cul-de-Sac, Saint-Barthélemy",
    lat: 17.9175,
    lng: -62.798,
    fareZone: "grand-cul-de-sac",
  },
  {
    name: "Petit Cul-de-Sac",
    address: "Petit Cul-de-Sac, Saint-Barthélemy",
    lat: 17.911,
    lng: -62.7945,
    fareZone: "grand-cul-de-sac",
  },
  {
    name: "Corossol",
    address: "Corossol, Saint-Barthélemy",
    lat: 17.9115,
    lng: -62.8575,
    fareZone: "corossol",
  },
  {
    name: "Public",
    address: "Public, Saint-Barthélemy",
    lat: 17.8995,
    lng: -62.841,
    fareZone: "public",
  },
  {
    name: "Lurin",
    address: "Lurin, Saint-Barthélemy",
    lat: 17.8875,
    lng: -62.8275,
    fareZone: "lurin",
  },
  {
    name: "Gouverneur",
    address: "Gouverneur, Saint-Barthélemy",
    lat: 17.8795,
    lng: -62.8305,
    fareZone: "gouverneur",
  },
  {
    name: "Saline",
    address: "Saline, Saint-Barthélemy",
    lat: 17.876,
    lng: -62.821,
    fareZone: "saline",
  },
  {
    name: "Toiny",
    address: "Toiny, Saint-Barthélemy",
    lat: 17.891,
    lng: -62.791,
    fareZone: "toiny",
  },
  {
    name: "Grand Fond",
    address: "Grand Fond, Saint-Barthélemy",
    lat: 17.8845,
    lng: -62.8015,
    fareZone: "grand-fond",
  },
  {
    name: "Vitet",
    address: "Vitet, Saint-Barthélemy",
    lat: 17.899,
    lng: -62.806,
    fareZone: "vitet",
  },
  {
    name: "Dévet",
    address: "Dévet, Saint-Barthélemy",
    lat: 17.8962,
    lng: -62.7978,
    fareZone: "devet",
  },
  {
    name: "Marigot",
    address: "Marigot, Saint-Barthélemy",
    lat: 17.9112,
    lng: -62.8008,
    fareZone: "marigot",
  },
  {
    name: "Pointe Milou",
    address: "Pointe Milou, Saint-Barthélemy",
    lat: 17.921,
    lng: -62.8075,
    fareZone: "pointe-milou",
  },
  {
    name: "Aéroport",
    address: "Aéroport Rémy de Haenen (SBH), Saint-Jean",
    lat: 17.9044,
    lng: -62.8436,
    fareZone: "airport",
  },
  {
    name: "Shell Beach",
    address: "Shell Beach, Gustavia",
    lat: 17.8928,
    lng: -62.8525,
    fareZone: "la-pointe",
  },
  {
    name: "Saint-Jean Beach",
    address: "Saint-Jean Beach, Saint-Barthélemy",
    lat: 17.9028,
    lng: -62.8285,
    fareZone: "saint-jean",
  },
  {
    name: "Colombier Beach",
    address: "Colombier Beach, Saint-Barthélemy",
    lat: 17.9235,
    lng: -62.868,
    fareZone: "colombier",
  },
  {
    name: "Eden Rock",
    address: "Eden Rock, Saint-Jean",
    lat: 17.9035,
    lng: -62.827,
    fareZone: "saint-jean",
  },
  {
    name: "InterContinental",
    address: "InterContinental, Saint-Jean",
    lat: 17.902,
    lng: -62.8255,
    fareZone: "saint-jean",
  },
  {
    name: "Cheval Blanc",
    address: "Cheval Blanc St-Barth Isle de France, Flamands",
    lat: 17.918,
    lng: -62.8505,
    fareZone: "flamands",
  },
  {
    name: "Le Guanahani",
    address: "Rosewood Le Guanahani, Grand Cul-de-Sac",
    lat: 17.9165,
    lng: -62.797,
    fareZone: "grand-cul-de-sac",
  },
  {
    name: "Le Carl Gustaf",
    address: "Hôtel Barrière Le Carl Gustaf, Gustavia",
    lat: 17.8968,
    lng: -62.8515,
    fareZone: "gustavia",
  },
  {
    name: "Le Select",
    address: "Le Select, Gustavia",
    lat: 17.8958,
    lng: -62.8502,
    fareZone: "gustavia",
  },
  {
    name: "Bonito",
    address: "Bonito, Gustavia",
    lat: 17.8965,
    lng: -62.8518,
    fareZone: "gustavia",
  },
  {
    name: "Maya's",
    address: "Maya's, Public",
    lat: 17.899,
    lng: -62.845,
    fareZone: "public",
  },
];

export const POPULAR_DESTINATIONS = [
  "Aéroport",
  "Eden Rock",
  "Cheval Blanc",
  "Le Guanahani",
  "Le Carl Gustaf",
  "Le Select",
  "Bonito",
  "Shell Beach",
] as const;

export function searchLocalPlaces(query: string, limit = 8): CatalogPlace[] {
  const q = query.trim().toLowerCase();
  if (!q) return SBH_PLACES.slice(0, limit);

  return SBH_PLACES.filter((place) => {
    return (
      place.name.toLowerCase().includes(q) ||
      place.address.toLowerCase().includes(q)
    );
  }).slice(0, limit);
}

export function findPlaceByName(name: string): Place | undefined {
  return SBH_PLACES.find(
    (place) => place.name.toLowerCase() === name.toLowerCase(),
  );
}

export function nearestPlace(lat: number, lng: number): Place {
  const here = { lat, lng };
  let closest = SBH_PLACES[0];
  let closestKm = Number.POSITIVE_INFINITY;
  for (const place of SBH_PLACES) {
    const distance = haversineKm(here, place);
    if (distance < closestKm) {
      closest = place;
      closestKm = distance;
    }
  }
  return closest;
}

export function randomSbhPickup(): Place {
  const base = SBH_PLACES[Math.floor(Math.random() * SBH_PLACES.length)];
  const jitter = () => (Math.random() - 0.5) * 0.004;
  return {
    name: "Position actuelle",
    address: base.address,
    lat: Number((base.lat + jitter()).toFixed(6)),
    lng: Number((base.lng + jitter()).toFixed(6)),
    source: "gps",
  };
}
