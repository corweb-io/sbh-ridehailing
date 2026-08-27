"use client";

import { useEffect, useState } from "react";
import { AdminNav, ADMIN_KEY_STORAGE } from "@/components/AdminNav";
import type { RideStatus, SmokeTestRide } from "@/lib/types";

type Stats = {
  persistence: string;
  visitors: number;
  rideAttempts: number;
  quotes: number;
  confirmations: number;
  contactSubmissions: number;
  conversionQuoteToConfirm: number;
  averageFare: number;
  averageDistanceKm: number;
  byOrigin: { label: string; count: number }[];
  byDestination: { label: string; count: number }[];
  recent: SmokeTestRide[];
};

const STATUS_LABELS: Record<RideStatus, string> = {
  started: "Démarré",
  quote_viewed: "Tarif affiché",
  requested: "Taxi demandé",
  confirmed: "Confirmé",
  searching: "Recherche",
  no_driver: "Aucun chauffeur",
  cancelled: "Annulé",
};

const currency = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  currencyDisplay: "narrowSymbol",
});

export default function AdminPage() {
  const [key, setKey] = useState("");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchStats(adminKey: string) {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/stats", {
        headers: { "x-admin-key": adminKey },
      });
      if (!response.ok) {
        setError("Accès non autorisé ou service indisponible.");
        setStats(null);
        return;
      }
      sessionStorage.setItem(ADMIN_KEY_STORAGE, adminKey);
      setStats((await response.json()) as Stats);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    const stored = sessionStorage.getItem(ADMIN_KEY_STORAGE);
    if (!stored) return;
    setKey(stored);
    void fetchStats(stored);
  }, []);

  async function load(event: React.FormEvent) {
    event.preventDefault();
    await fetchStats(key);
  }

  return (
    <div className="bg-sand text-ink min-h-dvh px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <h1 className="display text-3xl sm:text-4xl">Suivi de la demande</h1>
          <AdminNav current="demand" />
        </div>
        <form
          className="flex flex-col gap-2 sm:max-w-xl sm:flex-row"
          onSubmit={(event) => void load(event)}
        >
          <input
            type="password"
            value={key}
            onChange={(event) => setKey(event.target.value)}
            placeholder="Clé d’administration"
            className="field h-11 min-w-0 flex-1"
          />
          <button
            type="submit"
            className="bg-ink text-shell rounded-control h-11 px-5 text-sm font-semibold"
          >
            {loading ? "Chargement…" : "Afficher"}
          </button>
        </form>
        {error ? <p className="text-coral text-sm">{error}</p> : null}

        {stats ? (
          <>
            <p className="text-ink-muted text-xs">
              Stockage : {stats.persistence}
            </p>
            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Visiteurs" value={stats.visitors} />
              <Stat label="Demandes" value={stats.rideAttempts} />
              <Stat label="Tarifs affichés" value={stats.quotes} />
              <Stat label="Taxis demandés" value={stats.confirmations} />
              <Stat
                label="Tarif → demande"
                value={`${Math.round(stats.conversionQuoteToConfirm * 100)}%`}
              />
              <Stat label="WhatsApp / appels" value={stats.contactSubmissions} />
              <Stat
                label="Tarif moyen"
                value={currency.format(stats.averageFare)}
              />
              <Stat
                label="Distance moyenne"
                value={`${stats.averageDistanceKm.toFixed(1)} km`}
              />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <PlaceList title="Départs" rows={stats.byOrigin} />
              <PlaceList
                title="Quartiers de destination"
                rows={stats.byDestination}
              />
            </div>

            <div className="border-line bg-raised rounded-card overflow-x-auto border">
              <table className="min-w-full text-left text-xs">
                <thead className="bg-sunk">
                  <tr>
                    {[
                      "Date",
                      "Statut",
                      "Zones",
                      "Départ",
                      "Km",
                      "Tarif",
                      "Contact",
                    ].map((header) => (
                      <th key={header} className="px-3 py-2 font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.recent.map((ride) => (
                    <tr key={ride.id} className="border-line border-t">
                      <td className="px-3 py-2 whitespace-nowrap">
                        {new Date(ride.created_at).toLocaleString("fr-FR")}
                      </td>
                      <td className="px-3 py-2">{STATUS_LABELS[ride.status]}</td>
                      <td className="px-3 py-2">
                        {[ride.fare_zone_from, ride.fare_zone_to]
                          .filter(Boolean)
                          .join(" → ") || "—"}
                      </td>
                      <td className="px-3 py-2">{ride.pickup_address}</td>
                      <td className="px-3 py-2">
                        {ride.distance_km?.toFixed(1)}
                      </td>
                      <td className="px-3 py-2">
                        {ride.quoted_price != null
                          ? currency.format(Number(ride.quoted_price))
                          : ""}
                      </td>
                      <td className="px-3 py-2">{ride.contact}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="border-line bg-raised rounded-card border p-3">
      <p className="text-ink-muted text-xs">{label}</p>
      <p className="display mt-1 text-2xl">{value}</p>
    </div>
  );
}

function PlaceList({
  title,
  rows,
}: {
  title: string;
  rows: { label: string; count: number }[];
}) {
  return (
    <div className="border-line bg-raised rounded-card border p-3">
      <p className="mb-2 text-sm font-medium">{title}</p>
      {rows.length === 0 ? (
        <p className="text-ink-muted text-xs">Aucune donnée pour le moment.</p>
      ) : (
        <ul className="space-y-1 text-xs">
          {rows.map((row) => (
            <li key={row.label} className="flex justify-between gap-4">
              <span>{row.label}</span>
              <span>{row.count}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
