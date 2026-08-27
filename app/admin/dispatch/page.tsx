"use client";

import { useEffect, useState } from "react";
import { useAdminSession } from "@/components/AdminGate";
import { AdminNav } from "@/components/AdminNav";

const CHANNELS = ["whatsapp", "telegram", "all"] as const;
const RANGES = ["7d", "30d", "90d"] as const;

type ChannelFilter = (typeof CHANNELS)[number];
type RangeFilter = (typeof RANGES)[number];

type CountRow = { label: string; count: number; share: number };
type FunnelRow = { label: string; count: number; conversion: number | null };
type DayPoint = {
  day: string;
  inbound: number;
  outbound: number;
  jobs: number;
  assigned: number;
};
type HourPoint = { hour: number; inbound: number; jobs: number };

type Kpis = {
  inbound: number;
  outbound: number;
  uniqueBookers: number;
  bookingsStarted: number;
  jobs: number;
  assigned: number;
  completed: number;
  unfilled: number;
  cancelled: number;
  fillRate: number;
  medianMinutesToAssign: number | null;
  offersAccepted: number;
  offersDeclined: number;
  acceptRate: number;
  revenue: number;
  averageFare: number;
};

type JobRow = {
  idPrefix: string;
  createdAt: string;
  status: string;
  statusLabel: string;
  zones: string;
  fare: number | null;
  pax: number;
  supplierLabel: string | null;
};

type Stats = {
  persistence: string;
  generatedAt: string;
  eventsSince: string | null;
  kpis: Kpis;
  previous: Kpis;
  delta: {
    inbound: number | null;
    uniqueBookers: number | null;
    jobs: number | null;
    fillRate: number | null;
    revenue: number | null;
    bookingsStarted: number | null;
  };
  series: DayPoint[];
  byHour: HourPoint[];
  funnel: FunnelRow[];
  byStatus: CountRow[];
  byLocale: CountRow[];
  byPickup: CountRow[];
  byDropoff: CountRow[];
  bySupplierKind: CountRow[];
  byStep: CountRow[];
  live: {
    openRings: number;
    liveTrips: number;
    onDutyStaff: number;
    bookingSessions: number;
    staff: {
      id: string;
      label: string;
      kind: string;
      onDuty: boolean;
      sessionOpen: boolean;
    }[];
    attention: JobRow[];
  };
  recentEvents: {
    id: string;
    at: string;
    channel: string;
    name: string;
    label: string;
    detail: string;
  }[];
  recentJobs: JobRow[];
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
  all: "Tous",
};

const RANGE_LABELS: Record<RangeFilter, string> = {
  "7d": "7 jours",
  "30d": "30 jours",
  "90d": "90 jours",
};

const REFRESH_MS = 20_000;

export default function DispatchAdminPage() {
  const { key, lock } = useAdminSession();
  const [range, setRange] = useState<RangeFilter>("30d");
  const [channel, setChannel] = useState<ChannelFilter>("whatsapp");
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function fetchStats(
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
        headers: { "x-admin-key": key },
      });
      if (response.status === 401) {
        lock();
        return;
      }
      if (!response.ok) {
        setError("Impossible de charger le dispatch.");
        return;
      }
      setStats((await response.json()) as Stats);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      void fetchStats(range, channel);
    }, REFRESH_MS);
    return () => window.clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, range, channel]);

  return (
    <div className="bg-sand text-ink min-h-dvh">
      <header className="border-line bg-shell/90 sticky top-0 z-20 border-b backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-ink-muted text-[10px] font-semibold tracking-[0.2em] uppercase">
                Cockpit · St. Barth
              </p>
              <h1 className="display text-2xl leading-none sm:text-3xl">
                Dispatch
              </h1>
            </div>
            {stats ? <LiveBadge live={stats.live} /> : null}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <AdminNav current="dispatch" />
            <Segmented
              value={channel}
              options={CHANNELS.map((value) => ({
                value,
                label: CHANNEL_LABELS[value],
              }))}
              onChange={(value) => {
                setChannel(value);
                void fetchStats(range, value);
              }}
            />
            <Segmented
              value={range}
              options={RANGES.map((value) => ({
                value,
                label: RANGE_LABELS[value],
              }))}
              onChange={(value) => {
                setRange(value);
                void fetchStats(value, channel);
              }}
            />
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-7xl space-y-6 px-4 py-6 sm:px-6 sm:py-8">
        {error ? <p className="text-coral text-sm">{error}</p> : null}

        {stats ? (
          <Cockpit
            stats={stats}
            range={range}
            loading={loading}
            onRefresh={() => void fetchStats(range, channel)}
          />
        ) : loading ? (
          <p className="text-ink-muted text-sm">Chargement…</p>
        ) : null}
      </div>
    </div>
  );
}

function Cockpit({
  stats,
  range,
  loading,
  onRefresh,
}: {
  stats: Stats;
  range: RangeFilter;
  loading: boolean;
  onRefresh: () => void;
}) {
  const { kpis, delta, live } = stats;
  const peakHour = stats.byHour.reduce(
    (best, hour) =>
      hour.jobs + hour.inbound > best.jobs + best.inbound ? hour : best,
    stats.byHour[0] ?? { hour: 0, inbound: 0, jobs: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="text-ink-muted flex flex-wrap items-center justify-between gap-2 text-xs">
        <p>
          {RANGE_LABELS[range]} vs période précédente
          {stats.eventsSince
            ? ` · messages depuis ${new Date(stats.eventsSince).toLocaleDateString("fr-FR")}`
            : " · le volume de messages commencera au prochain échange"}
        </p>
        <button
          type="button"
          onClick={onRefresh}
          className="hover:text-ink text-xs font-medium"
        >
          {loading ? "Actualisation…" : `MAJ ${timeLabel(stats.generatedAt)}`}
        </button>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <Kpi
          label="Messages reçus"
          value={kpis.inbound}
          delta={delta.inbound}
          hint={`${kpis.outbound} envoyés`}
        />
        <Kpi
          label="Clients uniques"
          value={kpis.uniqueBookers}
          delta={delta.uniqueBookers}
          hint={`${kpis.bookingsStarted} réservations`}
        />
        <Kpi
          label="Courses"
          value={kpis.jobs}
          delta={delta.jobs}
          hint={`${kpis.assigned} assignées · ${kpis.unfilled} non pourvues`}
        />
        <Kpi
          label="Taux de pourvoi"
          value={pct(kpis.fillRate)}
          delta={delta.fillRate}
          deltaUnit="pp"
          hint={
            kpis.medianMinutesToAssign == null
              ? "Pas encore d’assignation"
              : `Médiane ${Math.round(kpis.medianMinutesToAssign)} min`
          }
          tone={
            kpis.fillRate >= 0.7 ? "good" : kpis.fillRate > 0 ? "warn" : "neutral"
          }
        />
        <Kpi
          label="CA assigné"
          value={currency.format(kpis.revenue)}
          delta={delta.revenue}
          hint={
            kpis.averageFare
              ? `Tarif moyen ${currency.format(kpis.averageFare)}`
              : "Courses pourvues uniquement"
          }
        />
      </div>

      <section
        className={`rounded-card grid gap-4 border p-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)] ${
          live.attention.length > 0
            ? "border-coral/30 bg-raised"
            : "border-line bg-raised"
        }`}
      >
        <div>
          <div className="mb-3 flex items-end justify-between gap-3">
            <div>
              <h2 className="text-sm font-medium">Maintenant</h2>
              <p className="text-ink-muted text-xs">
                {live.openRings} anneau{live.openRings === 1 ? "" : "x"} ·{" "}
                {live.liveTrips} course{live.liveTrips === 1 ? "" : "s"} en cours
                · {live.bookingSessions} réservation
                {live.bookingSessions === 1 ? "" : "s"}
              </p>
            </div>
          </div>
          {live.attention.length > 0 ? (
            <ul className="space-y-2">
              {live.attention.map((job) => (
                <li
                  key={`${job.idPrefix}-${job.createdAt}`}
                  className="bg-sunk flex items-center justify-between gap-3 rounded-control px-3 py-2 text-xs"
                >
                  <div className="min-w-0">
                    <StatusPill status={job.status} label={job.statusLabel} />
                    <span className="ml-2">{job.zones || "Trajet en cours"}</span>
                  </div>
                  <span className="text-ink-muted shrink-0">
                    {job.supplierLabel ?? `${job.pax} pax`}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-ink-muted text-sm">
              Rien à dispatcher. Les appels taxi et courses en cours
              apparaîtront ici.
            </p>
          )}
        </div>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-2">
            <MiniStat label="En service" value={live.onDutyStaff} />
            <MiniStat
              label="Acceptation"
              value={pct(kpis.acceptRate)}
              hint={`${kpis.offersAccepted}/${kpis.offersAccepted + kpis.offersDeclined}`}
            />
          </div>
          {live.staff.length === 0 ? (
            <p className="text-ink-muted text-xs">
              Aucun chauffeur lié sur ce canal.
            </p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {live.staff.map((staff) => (
                <li
                  key={staff.id}
                  className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                    staff.onDuty && staff.sessionOpen
                      ? "bg-sea-soft text-sea"
                      : staff.onDuty
                        ? "bg-sun-soft text-sun"
                        : "bg-sunk text-ink-muted"
                  }`}
                >
                  {staff.label}
                  <span className="ml-1 opacity-70">
                    {staff.onDuty
                      ? staff.sessionOpen
                        ? "en service"
                        : "session close"
                      : "off"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      <section className="border-line bg-raised rounded-card border p-4">
        <div className="mb-4 flex items-end justify-between gap-4">
          <div>
            <h2 className="text-sm font-medium">Volume</h2>
            <p className="text-ink-muted text-xs">
              Échelles séparées · heure de Saint-Barthélemy
            </p>
          </div>
          <Legend
            items={[
              { label: "Messages", className: "bg-sea" },
              { label: "Courses", className: "bg-ink" },
            ]}
          />
        </div>
        <VolumeChart series={stats.series} />
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="border-line bg-raised rounded-card border p-4">
          <h2 className="mb-1 text-sm font-medium">Entonnoir</h2>
          <p className="text-ink-muted mb-4 text-xs">
            Conversion d’une étape à la suivante
          </p>
          <Funnel rows={stats.funnel} />
        </section>
        <section className="border-line bg-raised rounded-card border p-4">
          <h2 className="mb-1 text-sm font-medium">Heures de la journée</h2>
          <p className="text-ink-muted mb-4 text-xs">
            Pic vers {peakHour.hour}h · fuseau St. Barth
          </p>
          <HourChart hours={stats.byHour} />
        </section>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <BarList title="Départs" rows={stats.byPickup} />
        <BarList title="Destinations" rows={stats.byDropoff} />
        <BarList title="Étapes de réservation" rows={stats.byStep} />
        <BarList title="Statuts" rows={stats.byStatus} />
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Mix title="Langue" rows={stats.byLocale} />
        <Mix title="Flotte assignée" rows={stats.bySupplierKind} />
      </div>

      <section className="border-line bg-raised rounded-card overflow-hidden border">
        <div className="flex items-end justify-between px-4 py-3">
          <h2 className="text-sm font-medium">Courses</h2>
          <p className="text-ink-muted text-xs">
            {stats.recentJobs.length} plus récentes
          </p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead className="bg-sunk text-ink-muted">
              <tr>
                {["Quand", "Réf.", "Statut", "Trajet", "Pax", "Tarif", "Chauffeur"].map(
                  (header) => (
                    <th key={header} className="px-4 py-2 font-medium">
                      {header}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {stats.recentJobs.length === 0 ? (
                <tr>
                  <td className="text-ink-muted px-4 py-6" colSpan={7}>
                    Aucune course sur cette période. Les prochaines demandes
                    WhatsApp apparaîtront ici.
                  </td>
                </tr>
              ) : (
                stats.recentJobs.map((job) => (
                  <tr
                    key={`${job.idPrefix}-${job.createdAt}`}
                    className="border-line border-t"
                  >
                    <td className="px-4 py-2.5 whitespace-nowrap">
                      {new Date(job.createdAt).toLocaleString("fr-FR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </td>
                    <td className="px-4 py-2.5 font-mono">{job.idPrefix}</td>
                    <td className="px-4 py-2.5">
                      <StatusPill status={job.status} label={job.statusLabel} />
                    </td>
                    <td className="px-4 py-2.5">{job.zones || "—"}</td>
                    <td className="px-4 py-2.5">{job.pax}</td>
                    <td className="px-4 py-2.5">
                      {job.fare != null ? currency.format(job.fare) : "—"}
                    </td>
                    <td className="px-4 py-2.5">{job.supplierLabel ?? "—"}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="border-line bg-raised rounded-card border p-4">
        <h2 className="mb-3 text-sm font-medium">Journal</h2>
        {stats.recentEvents.length === 0 ? (
          <p className="text-ink-muted text-sm">
            Pas encore d’événements live. Inbound, outbound et étapes de
            réservation s’afficheront ici dès le prochain message.
          </p>
        ) : (
          <ol className="space-y-2">
            {stats.recentEvents.slice(0, 18).map((event) => (
              <li
                key={event.id}
                className="flex items-baseline justify-between gap-4 text-xs"
              >
                <div className="min-w-0">
                  <span className="font-medium">{event.label}</span>
                  <span className="text-ink-muted"> · {event.detail}</span>
                </div>
                <time className="text-ink-muted shrink-0 whitespace-nowrap">
                  {new Date(event.at).toLocaleTimeString("fr-FR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </time>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function LiveBadge({ live }: { live: Stats["live"] }) {
  const hot = live.openRings + live.liveTrips > 0;
  return (
    <p
      className={`rounded-full px-3 py-1 text-[11px] font-semibold tracking-wide uppercase ${
        hot ? "bg-coral-soft text-coral" : "bg-sea-soft text-sea"
      }`}
    >
      <span className="mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-current" />
      {hot
        ? `${live.openRings + live.liveTrips} en cours`
        : "Calme"}
    </p>
  );
}

function Segmented<T extends string>({
  value,
  options,
  onChange,
}: {
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div className="border-line bg-raised flex rounded-full border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => onChange(option.value)}
          className={`rounded-full px-3 py-1.5 text-xs font-medium ${
            value === option.value ? "bg-ink text-shell" : "text-ink-muted"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Kpi({
  label,
  value,
  delta,
  deltaUnit = "pct",
  hint,
  tone = "neutral",
}: {
  label: string;
  value: string | number;
  delta?: number | null;
  deltaUnit?: "pct" | "pp";
  hint?: string;
  tone?: "neutral" | "good" | "warn";
}) {
  return (
    <div className="border-line bg-raised shadow-raised rounded-card border p-4">
      <p className="text-ink-muted text-xs">{label}</p>
      <div className="mt-1 flex items-baseline gap-2">
        <p
          className={`display text-3xl ${
            tone === "good" ? "text-sea" : tone === "warn" ? "text-sun" : ""
          }`}
        >
          {value}
        </p>
        <Delta value={delta} unit={deltaUnit} />
      </div>
      {hint ? <p className="text-ink-muted mt-1 text-xs">{hint}</p> : null}
    </div>
  );
}

function MiniStat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string | number;
  hint?: string;
}) {
  return (
    <div className="bg-sunk rounded-card p-3">
      <p className="text-ink-muted text-[10px] tracking-wide uppercase">{label}</p>
      <p className="display mt-1 text-2xl">{value}</p>
      {hint ? <p className="text-ink-muted text-[10px]">{hint}</p> : null}
    </div>
  );
}

function Delta({
  value,
  unit = "pct",
}: {
  value?: number | null;
  unit?: "pct" | "pp";
}) {
  if (value == null) return null;
  const up = value > 0.005;
  const down = value < -0.005;
  const label = `${up ? "+" : ""}${Math.round(value * 100)}${unit === "pp" ? " pts" : "%"}`;
  return (
    <span
      className={`text-[11px] font-semibold ${
        up ? "text-sea" : down ? "text-coral" : "text-ink-muted"
      }`}
    >
      {label}
    </span>
  );
}

function Legend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <ul className="flex gap-3 text-xs">
      {items.map((item) => (
        <li key={item.label} className="text-ink-muted flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${item.className}`} />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

function Funnel({ rows }: { rows: FunnelRow[] }) {
  const max = Math.max(...rows.map((row) => row.count), 1);
  return (
    <ul className="space-y-3">
      {rows.map((row) => {
        const weak = row.conversion != null && row.conversion < 0.5;
        return (
          <li key={row.label}>
            <div className="mb-1 flex items-baseline justify-between gap-3 text-xs">
              <span>{row.label}</span>
              <span className={weak ? "text-coral font-medium" : "text-ink-muted"}>
                {row.count}
                {row.conversion == null ? "" : ` · ${pct(row.conversion)}`}
              </span>
            </div>
            <div className="bg-sunk h-2.5 overflow-hidden rounded-full">
              <div
                className={`h-2.5 rounded-full ${weak ? "bg-coral" : "bg-sea"}`}
                style={{
                  width: `${row.count === 0 ? 0 : Math.max(6, (row.count / max) * 100)}%`,
                }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

function BarList({ title, rows }: { title: string; rows: CountRow[] }) {
  return (
    <section className="border-line bg-raised rounded-card border p-4">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-ink-muted text-xs">Pas encore de volume ici.</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.label}>
              <div className="mb-1 flex justify-between text-xs">
                <span className="truncate pr-3">{row.label}</span>
                <span className="text-ink-muted">
                  {row.count}
                  <span className="ml-1 opacity-70">{pct(row.share)}</span>
                </span>
              </div>
              <div className="bg-sunk h-1.5 overflow-hidden rounded-full">
                <div
                  className="bg-ink/70 h-1.5 rounded-full"
                  style={{ width: `${Math.max(4, row.share * 100)}%` }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Mix({ title, rows }: { title: string; rows: CountRow[] }) {
  return (
    <section className="border-line bg-raised rounded-card border p-4">
      <h2 className="mb-3 text-sm font-medium">{title}</h2>
      {rows.length === 0 ? (
        <p className="text-ink-muted text-xs">Pas encore de volume ici.</p>
      ) : (
        <ul className="flex flex-wrap gap-2">
          {rows.map((row) => (
            <li
              key={row.label}
              className="bg-sunk rounded-full px-3 py-1.5 text-xs"
            >
              <span className="font-medium">{row.label}</span>
              <span className="text-ink-muted ml-2">
                {row.count} · {pct(row.share)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function VolumeChart({ series }: { series: DayPoint[] }) {
  const maxInbound = Math.max(...series.map((point) => point.inbound), 1);
  const maxJobs = Math.max(...series.map((point) => point.jobs), 1);
  const tickEvery =
    series.length <= 10 ? 1 : Math.ceil(series.length / 7);
  return (
    <div className="flex h-48 items-end gap-px sm:gap-0.5">
      {series.map((point, index) => (
        <div
          key={point.day}
          className="flex min-w-0 flex-1 flex-col items-center gap-1"
          title={`${point.day} · ${point.inbound} msg · ${point.jobs} courses`}
        >
          <div className="flex h-40 w-full items-end justify-center gap-px">
            <div
              className="bg-sea min-h-0 w-full max-w-2 rounded-t-sm"
              style={{
                height: `${point.inbound ? Math.max(4, (point.inbound / maxInbound) * 100) : 0}%`,
              }}
            />
            <div
              className="bg-ink min-h-0 w-full max-w-2 rounded-t-sm"
              style={{
                height: `${point.jobs ? Math.max(4, (point.jobs / maxJobs) * 100) : 0}%`,
              }}
            />
          </div>
          {index % tickEvery === 0 || index === series.length - 1 ? (
            <span className="text-ink-muted text-[9px] leading-none">
              {shortDay(point.day)}
            </span>
          ) : (
            <span className="h-2.5" />
          )}
        </div>
      ))}
    </div>
  );
}

function HourChart({ hours }: { hours: HourPoint[] }) {
  const max = Math.max(...hours.map((hour) => hour.inbound + hour.jobs), 1);
  return (
    <div className="flex h-40 items-end gap-1">
      {hours.map((hour) => {
        const total = hour.inbound + hour.jobs;
        return (
          <div
            key={hour.hour}
            className="flex min-w-0 flex-1 flex-col items-center gap-1"
            title={`${hour.hour}h · ${hour.inbound} msg · ${hour.jobs} courses`}
          >
            <div
              className="flex w-full flex-col justify-end overflow-hidden rounded-t-sm"
              style={{
                height: `${(total / max) * 100}%`,
                minHeight: total ? 4 : 0,
              }}
            >
              <div
                className="bg-sea w-full"
                style={{ flexGrow: hour.inbound || 0 }}
              />
              <div
                className="bg-ink w-full"
                style={{ flexGrow: hour.jobs || 0 }}
              />
            </div>
            {hour.hour % 3 === 0 ? (
              <span className="text-ink-muted text-[9px]">{hour.hour}</span>
            ) : (
              <span className="h-3" />
            )}
          </div>
        );
      })}
    </div>
  );
}

function StatusPill({ status, label }: { status: string; label: string }) {
  const tone =
    status === "completed"
      ? "bg-sea-soft text-sea"
      : status === "unfilled" || status === "cancelled"
        ? "bg-coral-soft text-coral"
        : status === "assigned" || status === "en_route" || status === "arrived"
          ? "bg-sun-soft text-sun"
          : status === "ring_taxis" || status === "ring_companies" || status === "hold"
            ? "bg-coral-soft text-coral"
            : "bg-sunk text-ink-muted";
  return (
    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
      {label}
    </span>
  );
}

function pct(value: number) {
  return `${Math.round(value * 100)}%`;
}

function timeLabel(iso: string) {
  return new Date(iso).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

function shortDay(day: string) {
  const date = new Date(`${day}T12:00:00.000Z`);
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}
