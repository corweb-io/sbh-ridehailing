"use client";

import { useEffect, useState } from "react";
import { AdminNav, ADMIN_KEY_STORAGE } from "@/components/AdminNav";

const CHANNELS = ["whatsapp", "telegram", "all"] as const;
const RANGES = ["7d", "30d", "90d"] as const;

type ChannelFilter = (typeof CHANNELS)[number];
type RangeFilter = (typeof RANGES)[number];

type CountRow = { label: string; count: number };
type DayPoint = {
  day: string;
  inbound: number;
  outbound: number;
  jobs: number;
  assigned: number;
};
type Stats = {
  persistence: string;
  eventsSince: string | null;
  kpis: {
    inbound: number;
    outbound: number;
    uniqueBookers: number;
    bookingsStarted: number;
    jobs: number;
    assigned: number;
    completed: number;
    unfilled: number;
    fillRate: number;
    medianMinutesToAssign: number | null;
    offersAccepted: number;
    offersDeclined: number;
  };
  series: DayPoint[];
  funnel: CountRow[];
  byStatus: CountRow[];
  byLocale: CountRow[];
  byPickup: CountRow[];
  byDropoff: CountRow[];
  bySupplierKind: CountRow[];
  live: {
    openRings: number;
    liveTrips: number;
    onDutyStaff: number;
    bookingSessions: number;
  };
  recentEvents: {
    id: string;
    at: string;
    channel: string;
    label: string;
    detail: string;
  }[];
  recentJobs: {
    idPrefix: string;
    createdAt: string;
    statusLabel: string;
    zones: string;
    fare: number | null;
    pax: number;
    supplierId: string | null;
  }[];
};

const currency = new Intl.NumberFormat("fr-FR", {
  style: "currency",
  currency: "EUR",
  currencyDisplay: "narrowSymbol",
  maximumFractionDigits: 0,
});

const CHANNEL_LABELS: Record<ChannelFilter, string> = {
  whatsapp: "WhatsApp",
  telegram: "Telegram",
  all: "Tous les canaux",
};

const RANGE_LABELS: Record<RangeFilter, string> = {
  "7d": "7 jours",
  "30d": "30 jours",
  "90d": "90 jours",
};

export default function DispatchAdminPage() {
  const [key, setKey] = useState("");
  const [range, setRange] = useState<RangeFilter>("30d");
  const [channel, setChannel] = useState<ChannelFilter>("whatsapp");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [unlocked, setUnlocked] = useState(false);

  async function fetchStats(
    adminKey: string,
    nextRange = range,
    nextChannel = channel,
  ) {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        range: nextRange,
        channel: nextChannel,
      });
      const response = await fetch(`/api/admin/dispatch?${params}`, {
        headers: { "x-admin-key": adminKey },
      });
      if (!response.ok) {
        setError("Accès non autorisé ou service indisponible.");
        setStats(null);
        setUnlocked(false);
        return;
      }
      sessionStorage.setItem(ADMIN_KEY_STORAGE, adminKey);
      setUnlocked(true);
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
    // Load once from a stored admin key.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function load(event: React.FormEvent) {
    event.preventDefault();
    await fetchStats(key);
  }

  async function changeRange(next: RangeFilter) {
    setRange(next);
    if (unlocked) await fetchStats(key, next, channel);
  }

  async function changeChannel(next: ChannelFilter) {
    setChannel(next);
    if (unlocked) await fetchStats(key, range, next);
  }

  return (
    <div className="bg-sand text-ink min-h-dvh px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-6xl space-y-6 sm:space-y-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-ink-muted text-xs font-medium tracking-[0.18em] uppercase">
              Cockpit
            </p>
            <h1 className="display text-3xl sm:text-4xl">Dispatch WhatsApp</h1>
          </div>
          <AdminNav current="dispatch" />
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
            {loading ? "Chargement…" : unlocked ? "Actualiser" : "Afficher"}
          </button>
        </form>
        {error ? <p className="text-coral text-sm">{error}</p> : null}

        {stats ? (
          <>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-ink-muted text-xs">
                Stockage : {stats.persistence}
                {stats.eventsSince
                  ? ` · Messages suivis depuis ${new Date(stats.eventsSince).toLocaleString("fr-FR")}`
                  : " · Le suivi des messages commence avec le prochain échange"}
              </p>
              <div className="flex flex-wrap gap-2">
                {CHANNELS.map((value) => (
                  <FilterChip
                    key={value}
                    active={channel === value}
                    onClick={() => void changeChannel(value)}
                  >
                    {CHANNEL_LABELS[value]}
                  </FilterChip>
                ))}
                {RANGES.map((value) => (
                  <FilterChip
                    key={value}
                    active={range === value}
                    onClick={() => void changeRange(value)}
                  >
                    {RANGE_LABELS[value]}
                  </FilterChip>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              <Stat label="Messages reçus" value={stats.kpis.inbound} />
              <Stat label="Messages envoyés" value={stats.kpis.outbound} />
              <Stat label="Clients uniques" value={stats.kpis.uniqueBookers} />
              <Stat
                label="Réservations commencées"
                value={stats.kpis.bookingsStarted}
              />
              <Stat label="Courses" value={stats.kpis.jobs} />
              <Stat label="Assignées" value={stats.kpis.assigned} />
              <Stat
                label="Taux de pourvoi"
                value={`${Math.round(stats.kpis.fillRate * 100)}%`}
              />
              <Stat
                label="Délai médian d’assignation"
                value={
                  stats.kpis.medianMinutesToAssign == null
                    ? "—"
                    : `${Math.round(stats.kpis.medianMinutesToAssign)} min`
                }
              />
              <Stat label="Terminées" value={stats.kpis.completed} />
              <Stat label="Non pourvues" value={stats.kpis.unfilled} />
              <Stat label="Offres acceptées" value={stats.kpis.offersAccepted} />
              <Stat label="Offres refusées" value={stats.kpis.offersDeclined} />
            </div>

            <section className="border-line bg-raised rounded-card border p-4">
              <div className="mb-3 flex items-baseline justify-between gap-4">
                <h2 className="text-sm font-medium">Activité</h2>
                <p className="text-ink-muted text-xs">
                  Reçus · envoyés · courses · assignations
                </p>
              </div>
              <ActivityChart series={stats.series} />
            </section>

            <div className="grid gap-4 lg:grid-cols-2">
              <section className="border-line bg-raised rounded-card border p-4">
                <h2 className="mb-3 text-sm font-medium">Entonnoir</h2>
                <Funnel rows={stats.funnel} />
              </section>
              <section className="border-line bg-raised rounded-card border p-4">
                <h2 className="mb-3 text-sm font-medium">En ce moment</h2>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Anneaux ouverts" value={stats.live.openRings} />
                  <Stat label="Courses en cours" value={stats.live.liveTrips} />
                  <Stat label="En service" value={stats.live.onDutyStaff} />
                  <Stat
                    label="Réservations en cours"
                    value={stats.live.bookingSessions}
                  />
                </div>
              </section>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              <PlaceList title="Statuts" rows={stats.byStatus} />
              <PlaceList title="Langues" rows={stats.byLocale} />
              <PlaceList title="Type d’acceptation" rows={stats.bySupplierKind} />
              <PlaceList title="Départs" rows={stats.byPickup} />
              <PlaceList title="Destinations" rows={stats.byDropoff} />
            </div>

            <section className="border-line bg-raised rounded-card overflow-x-auto border">
              <h2 className="px-3 py-3 text-sm font-medium">Activité récente</h2>
              <table className="min-w-full text-left text-xs">
                <thead className="bg-sunk">
                  <tr>
                    {["Date", "Canal", "Événement", "Détail"].map((header) => (
                      <th key={header} className="px-3 py-2 font-medium">
                        {header}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {stats.recentEvents.length === 0 ? (
                    <tr>
                      <td className="text-ink-muted px-3 py-3" colSpan={4}>
                        Aucun événement pour cette période.
                      </td>
                    </tr>
                  ) : (
                    stats.recentEvents.map((event) => (
                      <tr key={event.id} className="border-line border-t">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {new Date(event.at).toLocaleString("fr-FR")}
                        </td>
                        <td className="px-3 py-2 capitalize">{event.channel}</td>
                        <td className="px-3 py-2">{event.label}</td>
                        <td className="px-3 py-2">{event.detail}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>

            <section className="border-line bg-raised rounded-card overflow-x-auto border">
              <h2 className="px-3 py-3 text-sm font-medium">Courses récentes</h2>
              <table className="min-w-full text-left text-xs">
                <thead className="bg-sunk">
                  <tr>
                    {["Date", "Réf.", "Statut", "Zones", "Pax", "Tarif", "Fournisseur"].map(
                      (header) => (
                        <th key={header} className="px-3 py-2 font-medium">
                          {header}
                        </th>
                      ),
                    )}
                  </tr>
                </thead>
                <tbody>
                  {stats.recentJobs.length === 0 ? (
                    <tr>
                      <td className="text-ink-muted px-3 py-3" colSpan={7}>
                        Aucune course pour cette période.
                      </td>
                    </tr>
                  ) : (
                    stats.recentJobs.map((job) => (
                      <tr key={`${job.idPrefix}-${job.createdAt}`} className="border-line border-t">
                        <td className="px-3 py-2 whitespace-nowrap">
                          {new Date(job.createdAt).toLocaleString("fr-FR")}
                        </td>
                        <td className="px-3 py-2 font-mono">{job.idPrefix}</td>
                        <td className="px-3 py-2">{job.statusLabel}</td>
                        <td className="px-3 py-2">{job.zones || "—"}</td>
                        <td className="px-3 py-2">{job.pax}</td>
                        <td className="px-3 py-2">
                          {job.fare != null ? currency.format(job.fare) : "—"}
                        </td>
                        <td className="px-3 py-2">{job.supplierId ?? "—"}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </section>
          </>
        ) : null}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full px-3 py-1.5 text-xs font-medium ${
        active ? "bg-ink text-shell" : "border-line bg-raised text-ink-muted border"
      }`}
    >
      {children}
    </button>
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

function Funnel({ rows }: { rows: { label: string; count: number }[] }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <ul className="space-y-2">
      {rows.map((row) => (
        <li key={row.label}>
          <div className="mb-1 flex justify-between text-xs">
            <span>{row.label}</span>
            <span>{row.count}</span>
          </div>
          <div className="bg-sunk h-2 overflow-hidden rounded-full">
            <div
              className="bg-sea h-2 rounded-full"
              style={{ width: `${Math.max(4, (row.count / max) * 100)}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}

function ActivityChart({
  series,
}: {
  series: DayPoint[];
}) {
  const max = Math.max(
    ...series.flatMap((point) => [
      point.inbound,
      point.outbound,
      point.jobs,
      point.assigned,
    ]),
    1,
  );
  return (
    <div className="flex h-36 items-end gap-1">
      {series.map((point) => (
        <div
          key={point.day}
          className="flex min-w-0 flex-1 flex-col items-center gap-1"
          title={`${point.day} · in ${point.inbound} · out ${point.outbound} · courses ${point.jobs} · assignées ${point.assigned}`}
        >
          <div className="flex h-28 w-full items-end justify-center gap-px">
            <Bar value={point.inbound} max={max} className="bg-sea" />
            <Bar value={point.outbound} max={max} className="bg-sea-bright" />
            <Bar value={point.jobs} max={max} className="bg-ink" />
            <Bar value={point.assigned} max={max} className="bg-sun" />
          </div>
        </div>
      ))}
    </div>
  );
}

function Bar({
  value,
  max,
  className,
}: {
  value: number;
  max: number;
  className: string;
}) {
  return (
    <div
      className={`w-full min-w-0 rounded-sm ${className}`}
      style={{ height: `${Math.max(value === 0 ? 0 : 6, (value / max) * 100)}%` }}
    />
  );
}
