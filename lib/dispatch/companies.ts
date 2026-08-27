export type TransportCompany = {
  id: string;
  name: string;
  phone: string;
  phoneLabel: string;
};

/** Commercial index from driverstbarth.com/chauffeurs — not the official register. */
export const TRANSPORT_COMPANIES: TransportCompany[] = [
  {
    id: "prestige",
    name: "Prestige Transport",
    phone: "+590690513030",
    phoneLabel: "+590 690 51 30 30",
  },
  {
    id: "mobilite",
    name: "Saint Barth Mobilité",
    phone: "+590690776673",
    phoneLabel: "+590 690 77 66 73",
  },
  {
    id: "caribbean-discovery",
    name: "Caribbean Discovery",
    phone: "+590690556167",
    phoneLabel: "+590 690 55 61 67",
  },
  {
    id: "sensation",
    name: "Saint Barth Sensation",
    phone: "+590690760480",
    phoneLabel: "+590 690 76 04 80",
  },
  {
    id: "fifth-avenue",
    name: "5th Avenue St Barth",
    phone: "+590690767619",
    phoneLabel: "+590 690 76 76 19",
  },
];

export function companyById(id: string) {
  return TRANSPORT_COMPANIES.find((company) => company.id === id) ?? null;
}

export function companyBySlug(query: string) {
  const q = query.trim().toLowerCase();
  return (
    TRANSPORT_COMPANIES.find(
      (company) =>
        company.id === q ||
        company.name.toLowerCase().includes(q) ||
        company.id.replaceAll("-", "") === q.replaceAll("-", ""),
    ) ?? null
  );
}
