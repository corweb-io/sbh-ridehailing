"use client";

import dynamic from "next/dynamic";
import { useState } from "react";
import {
  AppHeader,
  PhoneButton,
  ScreenLoading,
  StatusChip,
  statusTone,
} from "@/components/AppChrome";
import { StaffSignIn } from "@/components/StaffSignIn";
import { isFreshGps } from "@/lib/driver-gps";
import { FARE_ZONE_LABELS } from "@/lib/fares";
import { formatEuro } from "@/lib/format";
import { pointFromPlace } from "@/lib/geo";
import { mapsDirHref } from "@/lib/maps";
import {
  acceptTrip,
  assignTripFareZone,
  completeTrip,
  driverTrip,
  driverTrips,
  getSelectedDriverId,
  incomingTrips,
  markArrived,
  markNoShow,
  refuseTrip,
  scheduledInbox,
  selectedDriver,
  setDriverOnline,
  setSelectedDriverId,
  startTowardClient,
  startTrip,
  tripClientLabel,
  tripPhone,
  tripStatusLabel,
  type DriverTripView,
} from "@/lib/mock-store";
import { phoneHref } from "@/lib/phone";
import { taxiCaption } from "@/lib/licensed-taxis";
import {
  REFUSAL_GROUND_LABELS,
  type RefusalGround,
} from "@/lib/regulation";
import { signInDriver, signOutDriver } from "@/lib/staff-auth";
import { formatTripWhen } from "@/lib/taxis";
import { primeGeolocation, useDriverGps, type GpsStatus } from "@/lib/use-driver-gps";
import { useHydrated, useMockStore } from "@/lib/use-mock-store";
import type { FareZoneId } from "@/lib/types";

const IslandMap = dynamic(
  () => import("./IslandMap").then((mod) => mod.IslandMap),
  { ssr: false },
);

type Filter = "live" | "booked" | "all";

function gpsStatusLabel(status: GpsStatus, fresh: boolean) {
  if (status === "denied") return "Autorisez la position pour recevoir les courses.";
  if (status === "unavailable") return "GPS indisponible sur cet appareil.";
  if (status === "outside") return "Position hors de Saint-Barth.";
  if (status === "live" || fresh) return "Position transmise en temps réel.";
  if (status === "locating") return "Recherche de position…";
  return "Gardez l’app ouverte pour rester disponible.";
}

function destinationZoneLabel(trip: DriverTripView) {
  return trip.destinationZone
    ? FARE_ZONE_LABELS[trip.destinationZone]
    : "Quartier à confirmer";
}

function tripFare(trip: DriverTripView) {
  return trip.quote.fare == null ? "À confirmer" : formatEuro(trip.quote.fare);
}

function DriverTripRow({
  incoming,
  onOpen,
  trip,
}: {
  incoming: boolean;
  onOpen: () => void;
  trip: DriverTripView;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="w-full card p-4 text-left transition hover:bg-sunk"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate font-semibold">{tripClientLabel(trip)}</p>
            <p className="mt-1 truncate text-xs text-ink-muted">
              {trip.pickup.name} → {destinationZoneLabel(trip)}
            </p>
          </div>
          <StatusChip tone={incoming ? "pending" : statusTone(trip.status)}>
            {incoming ? "Offre" : tripStatusLabel(trip)}
          </StatusChip>
        </div>
        <p className="mt-3 text-xs text-ink-muted">
          {formatTripWhen(new Date(trip.quote.departAt))} · {tripFare(trip)}
        </p>
      </button>
    </li>
  );
}

function RefusalForm({
  onRefuse,
}: {
  onRefuse: (ground: RefusalGround) => void;
}) {
  const [ground, setGround] = useState<RefusalGround | "">("");
  return (
    <div className="space-y-2 card p-3">
      <label className="block">
        <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
          Motif réglementaire de refus
        </span>
        <select
          className="field h-12"
          value={ground}
          onChange={(event) => setGround(event.target.value as RefusalGround)}
        >
          <option value="">Choisir un motif</option>
          {Object.entries(REFUSAL_GROUND_LABELS).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        disabled={!ground}
        onClick={() => {
          if (ground) onRefuse(ground);
        }}
        className="secondary-button flex w-full items-center justify-center disabled:opacity-40"
      >
        Signaler le refus
      </button>
    </div>
  );
}

export function DriverApp() {
  const hydrated = useHydrated();
  const mock = useMockStore();
  const [driverId, setDriverId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>("live");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmComplete, setConfirmComplete] = useState(false);
  const [confirmNoShow, setConfirmNoShow] = useState(false);

  const resolvedDriverId = driverId ?? (hydrated ? getSelectedDriverId() : null);
  const driver = selectedDriver(mock, resolvedDriverId);
  const assigned = driver ? driverTrip(mock, driver.id) : null;
  const gpsStatus = useDriverGps(
    driver?.id ?? null,
    Boolean(driver && (driver.online || assigned)),
  );
  const mine = driver ? driverTrips(mock, driver.id) : [];
  const incoming = driver?.online ? incomingTrips(mock, driver.id) : [];
  const booked = driver?.online ? scheduledInbox(mock, driver.id) : [];
  const incomingIds = new Set(incoming.map((trip) => trip.id));
  const bookedIds = new Set(booked.map((trip) => trip.id));
  const history = mine.filter(
    (trip) => trip.status === "completed" || trip.status === "cancelled",
  );
  const live = [...(assigned ? [assigned] : []), ...incoming];
  const visible =
    filter === "live"
      ? live
      : filter === "booked"
        ? booked
        : [...live, ...booked, ...history];
  const selected =
    [...live, ...booked, ...history].find((trip) => trip.id === selectedId) ??
    assigned ??
    null;
  const isOffer = Boolean(
    selected &&
      (incomingIds.has(selected.id) ||
        (bookedIds.has(selected.id) && selected.driverId !== driver?.id)),
  );
  const isReserved = Boolean(
    selected &&
      selected.status === "scheduled" &&
      selected.driverId === driver?.id,
  );
  const pickupPoint = pointFromPlace(selected?.pickup);
  const navHref =
    driver &&
    pickupPoint &&
    selected &&
    (selected.status === "accepted" || selected.status === "arrived")
      ? mapsDirHref(pickupPoint, driver.location)
      : null;

  async function chooseDriver(identifier: string, code: string) {
    const result = await signInDriver(identifier, code);
    if (!result.ok) return result.error;
    setSelectedDriverId(result.id);
    setDriverId(result.id);
    return null;
  }

  async function logOut() {
    if (driver) setDriverOnline(driver.id, false);
    await signOutDriver();
    setSelectedDriverId(null);
    setDriverId(null);
    setSelectedId(null);
  }

  if (!hydrated) return <ScreenLoading />;

  if (!driver) {
    return (
      <StaffSignIn
        badge="RIDE · CHAUFFEUR"
        title="Connexion chauffeur"
        subtitle="La session sécurisée lie cet appareil à un ADS de démonstration."
        identifierLabel="N° ADS ou téléphone"
        identifierPlaceholder="12 ou 0690…"
        submitLabel="Se connecter"
        onSubmit={chooseDriver}
      />
    );
  }

  const taxiPoint = {
    ...driver.location,
    heading: driver.heading,
  };

  return (
    <div className="bg-sand relative mx-auto flex h-dvh w-full max-w-[1920px] flex-col overflow-hidden">
      <div className="absolute inset-0">
        <IslandMap
          pickup={pickupPoint}
          taxi={taxiPoint}
          className="h-full w-full"
        />
        <div className="from-sand pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t to-transparent lg:hidden" />
      </div>

      <AppHeader badge="RIDE · CHAUFFEUR" />

      <div className="relative z-10 mt-auto w-full shrink-0 lg:absolute lg:inset-y-0 lg:left-0 lg:flex lg:w-[min(30rem,42vw)] lg:items-center lg:px-5 lg:pb-5 lg:pt-20">
        <section className="sheet sheet-scroll lg:border-line rounded-t-sheet lg:rounded-sheet w-full px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-4 lg:border lg:px-6 lg:pb-6">
          <div className="space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sea">
                  Taxi agréé · registre démo
                </p>
                <h1 className="mt-1.5 text-2xl font-semibold">{driver.name}</h1>
                <p className="mt-1 text-sm text-ink-muted">
                  {taxiCaption(driver)}
                </p>
                {!assigned ? (
                  <button
                    type="button"
                    onClick={() => void logOut()}
                    className="mt-2 text-xs font-semibold text-sea"
                  >
                    Déconnexion
                  </button>
                ) : null}
              </div>
              {assigned ? (
                <StatusChip tone="pending">En course</StatusChip>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (!driver.online) primeGeolocation();
                    setDriverOnline(driver.id, !driver.online);
                  }}
                  aria-pressed={driver.online}
                  className={`min-h-11 rounded-full px-4 text-xs font-semibold ${
                    driver.online
                      ? "bg-sea text-shell"
                      : "border-line border"
                  }`}
                >
                  {driver.online ? "Disponible" : "Hors ligne"}
                </button>
              )}
            </div>

            {driver.online || assigned ? (
              <p className="text-xs leading-5 text-ink-muted">
                {gpsStatusLabel(gpsStatus, isFreshGps(driver.locationUpdatedAt))}
              </p>
            ) : null}

            {selected ? (
              <div className="space-y-4" aria-live="polite">
                <button
                  type="button"
                  onClick={() => {
                    setSelectedId(null);
                    setConfirmComplete(false);
                    setConfirmNoShow(false);
                  }}
                  className="text-xs font-semibold text-sea"
                >
                  ← Courses
                </button>

                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sea">
                      {isOffer ? "Offre réglementée" : tripStatusLabel(selected)}
                    </p>
                    <h2 className="mt-1.5 text-xl font-semibold">
                      {tripClientLabel(selected)}
                    </h2>
                  </div>
                  <StatusChip
                    tone={isOffer ? "pending" : statusTone(selected.status)}
                  >
                    {isOffer ? "90 s" : tripStatusLabel(selected)}
                  </StatusChip>
                </div>

                {tripPhone(selected) ? (
                  <div className="flex items-center justify-between card px-4 py-3">
                    <span className="text-sm">Appeler le client</span>
                    <PhoneButton
                      href={phoneHref(tripPhone(selected) ?? "")}
                      label="Appeler"
                    />
                  </div>
                ) : null}

                <div className="card p-4">
                  <p className="text-xs text-ink-muted">Prise en charge</p>
                  <p className="mt-1 text-sm font-medium">
                    {selected.pickup.address}
                  </p>
                  <div className="mt-3 border-t border-line pt-3">
                    <p className="text-xs text-ink-muted">
                      Quartier de destination
                    </p>
                    <p className="mt-1 text-sm font-medium">
                      {destinationZoneLabel(selected)}
                    </p>
                  </div>
                  <div className="mt-3 flex justify-between border-t border-line pt-3 text-sm">
                    <span className="text-ink-muted">Tarif officiel</span>
                    <strong>{tripFare(selected)}</strong>
                  </div>
                </div>

                {!selected.quote.zoneFrom && selected.pickup.source === "custom" ? (
                  <label className="block">
                    <span className="mb-1.5 block text-xs text-ink-muted">
                      Quartier du départ
                    </span>
                    <select
                      className="field h-12"
                      defaultValue=""
                      onChange={(event) =>
                        assignTripFareZone(
                          selected.id,
                          "pickup",
                          event.target.value as FareZoneId,
                        )
                      }
                    >
                      <option value="" disabled>
                        Choisir
                      </option>
                      {Object.entries(FARE_ZONE_LABELS).map(([value, label]) => (
                        <option key={value} value={value}>
                          {label}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}

                {selected.notes ? (
                  <p className="text-xs text-ink-soft">
                    {selected.notes}
                  </p>
                ) : null}

                {isOffer ? (
                  <>
                    <button
                      type="button"
                      disabled={!selected.quote.zoneFrom || !selected.quote.zoneTo}
                      onClick={() => acceptTrip(selected.id, driver.id)}
                      className="primary-button flex w-full items-center justify-center"
                    >
                      {selected.status === "scheduled" ? "Réserver" : "Accepter"}
                    </button>
                    <RefusalForm
                      onRefuse={(ground) => {
                        refuseTrip(selected.id, driver.id, ground);
                        setSelectedId(null);
                      }}
                    />
                  </>
                ) : isReserved ? (
                  <>
                    <button
                      type="button"
                      disabled={Boolean(assigned)}
                      onClick={() => startTowardClient(selected.id)}
                      className="primary-button flex w-full items-center justify-center"
                    >
                      Partir vers le client
                    </button>
                    <RefusalForm
                      onRefuse={(ground) => {
                        refuseTrip(selected.id, driver.id, ground);
                        setSelectedId(null);
                      }}
                    />
                  </>
                ) : selected.id === assigned?.id ? (
                  <div className="space-y-2">
                    {navHref ? (
                      <a
                        href={navHref}
                        target="_blank"
                        rel="noreferrer"
                        className="secondary-button flex w-full items-center justify-center"
                      >
                        Itinéraire vers le client
                      </a>
                    ) : null}
                    {assigned.status === "accepted" ? (
                      <button
                        type="button"
                        onClick={() => markArrived(assigned.id)}
                        className="primary-button flex w-full items-center justify-center"
                      >
                        Arrivé au départ
                      </button>
                    ) : assigned.status === "arrived" ? (
                      <>
                        <button
                          type="button"
                          onClick={() => startTrip(assigned.id)}
                          className="primary-button flex w-full items-center justify-center"
                        >
                          Démarrer la course
                        </button>
                        {confirmNoShow ? (
                          <button
                            type="button"
                            onClick={() => {
                              markNoShow(assigned.id);
                              setConfirmNoShow(false);
                              setSelectedId(null);
                            }}
                            className="bg-coral text-shell flex min-h-11 w-full items-center justify-center rounded-full text-sm font-semibold"
                          >
                            Confirmer le client absent
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmNoShow(true)}
                            className="secondary-button flex w-full items-center justify-center"
                          >
                            Client absent
                          </button>
                        )}
                      </>
                    ) : assigned.status === "onboard" ? (
                      confirmComplete ? (
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => setConfirmComplete(false)}
                            className="secondary-button flex flex-1 items-center justify-center"
                          >
                            Pas encore
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              completeTrip(assigned.id);
                              setConfirmComplete(false);
                              setSelectedId(null);
                            }}
                            className="primary-button flex flex-1 items-center justify-center"
                          >
                            Terminer
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setConfirmComplete(true)}
                          className="primary-button flex w-full items-center justify-center"
                        >
                          Terminer et encaisser
                        </button>
                      )
                    ) : null}
                  </div>
                ) : null}
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex gap-2">
                  {(
                    [
                      ["live", `Live (${live.length})`],
                      ["booked", `À venir (${booked.length})`],
                      ["all", "Toutes"],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setFilter(id)}
                      aria-pressed={filter === id}
                      className={`min-h-10 flex-1 rounded-full px-3 text-xs font-semibold ${
                        filter === id
                          ? "bg-ink text-shell"
                          : "border-line border"
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                {visible.length === 0 ? (
                  <p className="card p-4 text-sm leading-6 text-ink-muted">
                    {driver.online
                      ? "En attente d’une offre selon la proximité."
                      : "Passez disponible pour recevoir les courses."}
                  </p>
                ) : (
                  <ul className="space-y-2">
                    {visible.map((trip) => (
                      <DriverTripRow
                        key={trip.id}
                        trip={trip}
                        incoming={incomingIds.has(trip.id)}
                        onOpen={() => setSelectedId(trip.id)}
                      />
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}
