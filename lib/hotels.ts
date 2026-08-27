import { findPlaceByName } from "./places";
import type { Place } from "./types";

export type ConciergeOrgKind = "hotel" | "agency";

export type ConciergeOrg = {
  id: string;
  name: string;
  kind: ConciergeOrgKind;
  placeName: string;
};

export const CONCIERGE_ORGS: ConciergeOrg[] = [
  {
    id: "cheval-blanc",
    name: "Cheval Blanc",
    kind: "hotel",
    placeName: "Cheval Blanc",
  },
  {
    id: "eden-rock",
    name: "Eden Rock",
    kind: "hotel",
    placeName: "Eden Rock",
  },
  {
    id: "guanahani",
    name: "Le Guanahani",
    kind: "hotel",
    placeName: "Le Guanahani",
  },
  {
    id: "carl-gustaf",
    name: "Le Carl Gustaf",
    kind: "hotel",
    placeName: "Le Carl Gustaf",
  },
  {
    id: "intercontinental",
    name: "InterContinental",
    kind: "hotel",
    placeName: "InterContinental",
  },
  {
    id: "john-taylor",
    name: "John Taylor",
    kind: "agency",
    placeName: "Gustavia",
  },
];

export function orgById(id: string) {
  return CONCIERGE_ORGS.find((org) => org.id === id) ?? null;
}

export function hotelById(id: string) {
  return orgById(id);
}

export function hotelPlace(org: ConciergeOrg): Place {
  return findPlaceByName(org.placeName) ?? findPlaceByName("Gustavia")!;
}

export function orgKindLabel(org: ConciergeOrg) {
  return org.kind === "agency" ? "Agence" : "Hôtel";
}
