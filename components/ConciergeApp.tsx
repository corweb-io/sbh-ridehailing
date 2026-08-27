"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useMemo, useState } from "react";
import {
  AppHeader,
  PhoneButton,
  ScreenLoading,
  StatusChip,
  statusTone,
} from "@/components/AppChrome";
import { DispatchFallback, DispatchWait } from "@/components/DispatchFallback";
import { isFreshGps } from "@/lib/driver-gps";
import { FARE_ZONE_LABELS } from "@/lib/fares";
import {
  datetimeLocalInStBarth,
  formatEuro,
  stBarthIsoFromLocalInput,
} from "@/lib/format";
import { pointFromPlace, sameLocation } from "@/lib/geo";
import {
  hotelPlace,
  orgById,
  orgKindLabel,
} from "@/lib/hotels";
import {
  cancelTrip,
  driverById,
  hotelTrips,
  isActiveTrip,
  isBusyTrip,
  onlineDriverCount,
  requestTrip,
  taxiPositionForTrip,
  tripClientLabel,
  tripPhone,
  tripStatusLabel,
  type MockTrip,
} from "@/lib/mock-store";
import { isValidPhone, phoneHref } from "@/lib/phone";
import { findPlaceByName } from "@/lib/places";
import { buildOfficialQuote } from "@/lib/quote";
import {
  EMPTY_TRIP_REQUIREMENTS,
  type TripRequirements,
} from "@/lib/regulation";
import {
  buildTaxiRequestMessage,
  formatTripWhen,
} from "@/lib/taxis";
import type { FareZoneId, Place } from "@/lib/types";
import { signOutConcierge } from "@/lib/staff-auth";
import { useHydrated, useMockStore } from "@/lib/use-mock-store";
import { useRoadRoute } from "@/lib/use-road-route";
import { PlaceSearch } from "./PlaceSearch";
import { TripRoute } from "./TripRoute";

const IslandMap = dynamic(
  () => import("./IslandMap").then((mod) => mod.IslandMap),
  { ssr: false },
);

const CONCIERGE_DESTINATIONS = [
  "Aéroport",
  "Gustavia",
  "Saint-Jean",
  "Kitchen",
  "Le Select",
  "Bonito",
] as const;

type Panel = "board" | "compose" | "detail";
type Filter = "live" | "booked" | "all";

export function ConciergeApp({ orgId }: { orgId: string }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const mock = useMockStore();
  const org = orgById(orgId);
  const [filter, setFilter] = useState<Filter>("live");
  const [panel, setPanel] = useState<Panel>("board");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const [guestName, setGuestName] = useState("");
  const [guestPhone, setGuestPhone] = useState("");
  const [guestCount, setGuestCount] = useState(2);
  const [notes, setNotes] = useState("");
  const [requirements, setRequirements] = useState<TripRequirements>({
    ...EMPTY_TRIP_REQUIREMENTS,
  });
  const [pickup, setPickup] = useState<Place | null>(null);
  const [pickupQuery, setPickupQuery] = useState("");
  const [destination, setDestination] = useState<Place | null>(null);
  const [destinationQuery, setDestinationQuery] = useState("");
  const [departLater, setDepartLater] = useState(false);
  const [departLocal, setDepartLocal] = useState(() =>
    datetimeLocalInStBarth(new Date()),
  );

  const hotelPickup = org ? hotelPlace(org) : null;
  const trips = hotelTrips(mock, orgId);
  const liveTrips = trips.filter(
    (trip) => trip.status === "requested" || isBusyTrip(trip.status),
  );
  const bookedTrips = trips.filter((trip) => trip.status === "scheduled");
  const visibleTrips =
    filter === "live" ? liveTrips : filter === "booked" ? bookedTrips : trips;
  const taxisOnline = onlineDriverCount(mock);
  const selected =
    trips.find((trip) => trip.id === selectedId) ?? null;
  const selectedDriver = driverById(mock, selected?.driverId ?? null);

  const departAt = useMemo(
    () =>
      departLater
        ? new Date(stBarthIsoFromLocalInput(departLocal))
        : new Date(),
    [departLater, departLocal],
  );

  const sameTrip = Boolean(
    pickup && destination && sameLocation(pickup, destination),
  );
  const mapPickup = panel === "compose" ? pickup : selected?.pickup;
  const mapDestination =
    panel === "compose" ? destination : selected?.destination;
  const { route: roadRoute, isLoading: routeLoading } = useRoadRoute(
    pointFromPlace(mapPickup),
    pointFromPlace(mapDestination),
  );
  const quote = useMemo(() => {
    if (!pickup || !destination || sameLocation(pickup, destination)) return null;
    const fallback = buildOfficialQuote(pickup, destination, departAt);
    return {
      ...fallback,
      route:
        panel === "compose"
          ? roadRoute ?? (routeLoading ? [] : fallback.route)
          : fallback.route,
    };
  }, [
    departAt,
    destination,
    panel,
    pickup,
    roadRoute,
    routeLoading,
  ]);
  const mapRoute =
    roadRoute ??
    (routeLoading
      ? undefined
      : panel === "compose"
        ? quote?.route
        : selected?.quote.route);
  const mapTaxi =
    selected && selectedDriver && isActiveTrip(selected.status)
      ? taxiPositionForTrip(selected, selectedDriver)
      : null;
  const availableTaxis = mock.drivers
    .filter((driver) => driver.online && isFreshGps(driver.locationUpdatedAt))
    .map((driver) => ({ ...driver.location, heading: driver.heading }));
  const requirementsSupported = mock.drivers.some(
    (driver) =>
      (!requirements.pmr || driver.pmr === true) &&
      (!requirements.hybridElectric || driver.hybridElectric === true),
  );
  const dispatchMessage = selected
    ? buildTaxiRequestMessage({
          pickup: selected.pickup.address,
          when: new Date(selected.quote.departAt),
          quote: selected.quote,
          client: tripClientLabel(selected),
          phone: tripPhone(selected),
          notes: selected.notes,
          guestCount: selected.guestCount,
        })
    : null;

  function openCompose() {
    setGuestName("");
    setGuestPhone("");
    setGuestCount(2);
    setNotes("");
    setRequirements({ ...EMPTY_TRIP_REQUIREMENTS });
    if (org?.kind === "hotel" && hotelPickup) {
      setPickup(hotelPickup);
      setPickupQuery(hotelPickup.name);
    } else {
      setPickup(null);
      setPickupQuery("");
    }
    setDestination(null);
    setDestinationQuery("");
    setDepartLater(false);
    setDepartLocal(datetimeLocalInStBarth(new Date()));
    setFormError(null);
    setConfirmCancel(false);
    setPanel("compose");
  }

  function openTrip(trip: MockTrip) {
    setSelectedId(trip.id);
    setConfirmCancel(false);
    setPanel("detail");
  }

  function assignCustomZone(side: "pickup" | "destination", zone: FareZoneId) {
    if (side === "pickup") {
      setPickup((current) => (current ? { ...current, fareZone: zone } : current));
    } else {
      setDestination((current) =>
        current ? { ...current, fareZone: zone } : current,
      );
    }
    setFormError(null);
  }

  function submitRequest() {
    if (!guestName.trim()) {
      setFormError("Indiquez le nom du client.");
      return;
    }
    if (!isValidPhone(guestPhone)) {
      setFormError("Indiquez le téléphone du client.");
      return;
    }
    if (sameTrip) {
      setFormError("Le départ et la destination doivent être différents.");
      return;
    }
    if (!pickup || !destination || !quote) {
      setFormError("Choisissez un départ et une destination.");
      return;
    }
    if (!quote.zoneFrom || !quote.zoneTo) {
      setFormError("Choisissez le quartier tarifaire de chaque lieu.");
      return;
    }
    if (!requirementsSupported) {
      setFormError("Aucun taxi avec équipement officiel correspondant.");
      return;
    }
    const created = requestTrip({
      pickup,
      destination,
      quote,
      source: "concierge",
      hotelId: orgId,
      guestName,
      guestPhone,
      guestCount,
      notes,
      requirements,
    });
    setSelectedId(created.id);
    setPanel("detail");
  }

  if (!hydrated || !org) return <ScreenLoading />;

  const canSubmit = Boolean(
    guestName.trim() &&
      isValidPhone(guestPhone) &&
      pickup &&
      destination &&
      quote &&
      quote.zoneFrom &&
      quote.zoneTo &&
      !sameTrip &&
      requirementsSupported &&
      !routeLoading,
  );

  const map = (
    <IslandMap
      pickup={pointFromPlace(mapPickup)}
      destination={pointFromPlace(mapDestination)}
      taxi={mapTaxi}
      taxis={availableTaxis}
      route={mapRoute}
      className="h-full w-full"
    />
  );

  return (
    <div className="bg-sand mx-auto grid h-dvh max-w-[1920px] grid-rows-[11rem_minmax(0,1fr)] overflow-hidden lg:grid-cols-[minmax(22rem,30rem)_minmax(0,1fr)] lg:grid-rows-1">
      <div className="relative min-h-0 lg:col-start-2 lg:row-start-1">{map}</div>
      <section className="border-line flex min-h-0 flex-col overflow-hidden lg:col-start-1 lg:row-start-1 lg:border-r">
        <AppHeader badge="RIDE · CONCIERGERIE" backHref="/" />

        <div className="flex-1 overflow-y-auto px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] lg:px-5">
          {panel === "board" ? (
            <div className="space-y-4 pb-4">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sea">
                  {orgKindLabel(org)}
                </p>
                <h1 className="mt-2 text-2xl font-semibold tracking-tight">
                  {org.name}
                </h1>
                <p className="mt-2 text-sm text-ink-muted">
                  Tableau de {org.name} uniquement. Les clients paient le taxi
                  au tarif officiel.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    signOutConcierge();
                    router.replace("/concierge");
                  }}
                  className="mt-2 text-xs font-semibold text-sea"
                >
                  Déconnexion
                </button>
              </div>

              <button
                type="button"
                onClick={openCompose}
                className="primary-button flex w-full items-center justify-center"
              >
                Nouvelle course
              </button>

              <div className="flex gap-2">
                {(
                  [
                    ["live", `En cours (${liveTrips.length})`],
                    ["booked", `À venir (${bookedTrips.length})`],
                    ["all", "Toutes"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setFilter(id)}
                    aria-pressed={filter === id}
                    className={`min-h-10 flex-1 rounded-full px-3 text-xs font-semibold transition ${
                      filter === id
                        ? "bg-ink text-shell"
                        : "border-line text-ink-soft border"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>

              {visibleTrips.length === 0 ? (
                <div className="card p-4 text-sm leading-6 text-ink-soft">
                  {filter === "booked"
                    ? `Aucune réservation à venir pour ${org.name}.`
                    : `Aucune course ${filter === "live" ? "en cours" : ""} pour ${org.name}. Créez une demande pour un client.`}
                </div>
              ) : (
                <ul className="space-y-2">
                  {visibleTrips.map((trip) => {
                    const driver = driverById(mock, trip.driverId);
                    return (
                      <li key={trip.id}>
                        <button
                          type="button"
                          onClick={() => openTrip(trip)}
                          className="card hover:bg-sunk w-full p-4 text-left transition"
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0">
                              <p className="truncate font-semibold">
                                {tripClientLabel(trip)}
                              </p>
                              <p className="mt-1 truncate text-xs text-ink-muted">
                                {trip.pickup.name} → {trip.destination.name}
                              </p>
                            </div>
                            <StatusChip tone={statusTone(trip.status)}>
                              {tripStatusLabel(trip)}
                            </StatusChip>
                          </div>
                          <div className="mt-3 flex items-center justify-between text-xs text-ink-muted">
                            <span>
                              {driver
                                ? driver.name
                                : trip.status === "requested"
                                  ? "En attente d’un taxi"
                                  : trip.status === "scheduled"
                                    ? "Planifiée"
                                    : "—"}
                            </span>
                            <span className="text-ink font-semibold">
                              {trip.quote.fare == null
                                ? "À confirmer"
                                : formatEuro(trip.quote.fare)}
                            </span>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          ) : null}

          {panel === "compose" ? (
            <form
              className="space-y-4 pb-4"
              onSubmit={(event) => {
                event.preventDefault();
                submitRequest();
              }}
            >
              <button
                type="button"
                onClick={() => setPanel("board")}
                className="text-xs font-semibold text-sea"
              >
                ← Tableau
              </button>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sea">
                  Nouveau client
                </p>
                <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
                  Commander un taxi
                </h1>
              </div>

              <label className="block">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Nom du client
                </span>
                <input
                  value={guestName}
                  onChange={(event) => {
                    setGuestName(event.target.value);
                    setFormError(null);
                  }}
                  placeholder="Chiara Rossi"
                  autoComplete="name"
                  required
                  className="field h-12"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Téléphone du client
                </span>
                <input
                  type="tel"
                  value={guestPhone}
                  onChange={(event) => {
                    setGuestPhone(event.target.value);
                    setFormError(null);
                  }}
                  placeholder="+590 690 00 00 00"
                  autoComplete="tel"
                  required
                  className="field h-12"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Passagers
                </span>
                <input
                  type="number"
                  min={1}
                  max={8}
                  value={guestCount}
                  onChange={(event) =>
                    setGuestCount(Math.max(1, Number(event.target.value) || 1))
                  }
                  className="field h-12"
                />
              </label>
              {guestCount > 4 ? (
                <p className="text-xs leading-5 text-ink-muted">
                  Standard 1–4 places. Au-delà, prévoyez un van ou deux taxis —
                  à confirmer avec le chauffeur.
                </p>
              ) : null}

              <PlaceSearch
                label="Départ"
                placeholder="Hôtel, aéroport…"
                value={pickupQuery}
                onChange={(value) => {
                  setPickupQuery(value);
                  if (
                    pickup &&
                    value !== pickup.name &&
                    value !== pickup.address
                  ) {
                    setPickup(null);
                  }
                }}
                onSelect={(place) => {
                  setPickup(place);
                  setPickupQuery(place.name);
                }}
              />
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {org.kind === "hotel" && hotelPickup ? (
                  <Chip
                    label={org.name}
                    onClick={() => {
                      setPickup(hotelPickup);
                      setPickupQuery(hotelPickup.name);
                    }}
                  />
                ) : null}
                <Chip
                  label="Aéroport"
                  onClick={() => {
                    const place = findPlaceByName("Aéroport");
                    if (!place) return;
                    setPickup(place);
                    setPickupQuery(place.name);
                  }}
                />
              </div>

              <PlaceSearch
                label="Destination"
                placeholder="Gustavia, Kitchen…"
                value={destinationQuery}
                onChange={(value) => {
                  setDestinationQuery(value);
                  if (
                    destination &&
                    value !== destination.name &&
                    value !== destination.address
                  ) {
                    setDestination(null);
                  }
                }}
                onSelect={(place) => {
                  setDestination(place);
                  setDestinationQuery(place.name);
                }}
              />
              <div className="-mx-1 flex gap-2 overflow-x-auto px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {CONCIERGE_DESTINATIONS.map((name) => (
                  <Chip
                    key={name}
                    label={name}
                    onClick={() => {
                      const place = findPlaceByName(name);
                      if (!place) return;
                      setDestination(place);
                      setDestinationQuery(place.name);
                    }}
                  />
                ))}
              </div>

              {pickup?.source === "custom" && !quote?.zoneFrom ? (
                <ZoneSelect
                  label="Quartier du départ"
                  onChange={(zone) => assignCustomZone("pickup", zone)}
                />
              ) : null}
              {destination?.source === "custom" && !quote?.zoneTo ? (
                <ZoneSelect
                  label="Quartier de destination"
                  onChange={(zone) => assignCustomZone("destination", zone)}
                />
              ) : null}

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setDepartLater(false)}
                  aria-pressed={!departLater}
                  className={`min-h-10 flex-1 rounded-full px-3 text-xs font-semibold ${
                    !departLater
                      ? "bg-ink text-shell"
                      : "border-line text-ink-soft border"
                  }`}
                >
                  Maintenant
                </button>
                <button
                  type="button"
                  onClick={() => setDepartLater(true)}
                  aria-pressed={departLater}
                  className={`min-h-10 flex-1 rounded-full px-3 text-xs font-semibold ${
                    departLater
                      ? "bg-ink text-shell"
                      : "border-line text-ink-soft border"
                  }`}
                >
                  Plus tard
                </button>
              </div>
              {departLater ? (
                <input
                  type="datetime-local"
                  value={departLocal}
                  onChange={(event) => setDepartLocal(event.target.value)}
                  className="field h-12"
                />
              ) : null}

              <div className="space-y-2 card p-4">
                <p className="text-sm font-semibold">Besoin de véhicule</p>
                <RequirementToggle
                  checked={requirements.pmr}
                  label="Accès PMR / fauteuil roulant"
                  onChange={(checked) =>
                    setRequirements((current) => ({
                      ...current,
                      pmr: checked,
                    }))
                  }
                />
                <RequirementToggle
                  checked={requirements.hybridElectric}
                  label="Hybride ou électrique"
                  onChange={(checked) =>
                    setRequirements((current) => ({
                      ...current,
                      hybridElectric: checked,
                    }))
                  }
                />
                {!requirementsSupported ? (
                  <p className="text-sun text-xs leading-5">
                    Aucun équipement officiel correspondant dans le registre
                    de démonstration.
                  </p>
                ) : null}
              </div>

              <label className="block">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Note pour le taxi
                </span>
                <input
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Écriteau, nombre de bagages…"
                  className="field h-12"
                />
              </label>

              {sameTrip ? (
                <p className="text-coral text-sm">
                  Choisissez une destination différente du départ.
                </p>
              ) : null}
              {formError ? <p className="text-coral text-sm">{formError}</p> : null}

              {quote ? (
                <div className="card p-4">
                  <div className="flex items-end justify-between gap-3">
                    <p className="text-xs text-ink-muted">
                      {formatTripWhen(new Date(quote.departAt))}
                      {quote.durationMinutes == null
                        ? " · durée à confirmer"
                        : ` · ~${quote.durationMinutes} min`}
                    </p>
                    <p className="text-2xl font-semibold tracking-tight">
                      {quote.fare == null ? "À confirmer" : formatEuro(quote.fare)}
                    </p>
                  </div>
                  <p className="mt-2 text-xs text-ink-muted">
                    {quote.zoneFrom && quote.zoneTo
                      ? "Grille Collectivité en euros. Dollars au taux du jour. Paiement à bord, sans frais de réservation."
                      : "Le chauffeur indiquera le quartier du lieu personnalisé avant de confirmer le tarif."}
                  </p>
                </div>
              ) : null}

              <button
                type="submit"
                disabled={!canSubmit}
                className="primary-button flex w-full items-center justify-center"
              >
                {routeLoading ? "Calcul de l’itinéraire…" : "Envoyer au taxi"}
              </button>
            </form>
          ) : null}

          {panel === "detail" && selected ? (
            <div className="space-y-4 pb-4" aria-live="polite">
              <button
                type="button"
                onClick={() => {
                  setPanel("board");
                  setConfirmCancel(false);
                }}
                className="text-xs font-semibold text-sea"
              >
                ← Tableau
              </button>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sea">
                    {org.name}
                  </p>
                  <h1 className="mt-1.5 text-2xl font-semibold tracking-tight">
                    {tripClientLabel(selected)}
                  </h1>
                  <p className="mt-1 text-sm text-ink-muted">
                    {`${selected.guestCount} passager${selected.guestCount > 1 ? "s" : ""}`}
                    {selected.notes ? ` · ${selected.notes}` : ""}
                  </p>
                </div>
                <StatusChip tone={statusTone(selected.status)}>
                  {tripStatusLabel(selected)}
                </StatusChip>
              </div>

              <div className="card p-4">
                <TripRoute
                  pickup={selected.pickup.address}
                  destination={selected.destination.address}
                />
                <div className="border-line mt-4 flex items-center justify-between border-t pt-3">
                  <span className="text-xs text-ink-muted">Tarif taxi</span>
                  <span className="font-semibold">
                    {selected.quote.fare == null
                      ? "À confirmer"
                      : formatEuro(selected.quote.fare)}
                  </span>
                </div>
              </div>

              {selected.status === "completed" ? (
                <p className="text-sm leading-6 text-ink-soft">
                  Course terminée. Le client paie le chauffeur à bord.
                </p>
              ) : selected.status === "cancelled" ? (
                <p className="text-coral text-sm leading-6">
                  {selected.cancelReason === "timeout"
                    ? "Aucun taxi n’a pris la course. Renvoyez une demande."
                    : selected.cancelReason === "no_show"
                      ? "Le chauffeur n’a trouvé personne au départ."
                      : "Course annulée."}
                </p>
              ) : selected.status === "scheduled" && !selectedDriver ? (
                <p className="text-sm text-ink-soft">
                  Course planifiée. Un chauffeur peut la réserver à l’avance.
                </p>
              ) : selectedDriver ? (
                <div className="flex items-center gap-3 card p-4">
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-sea-soft font-semibold text-sea">
                    {selectedDriver.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{selectedDriver.name}</p>
                    <p className="text-sm text-ink-muted">
                      {selectedDriver.plate} · {selectedDriver.ads}
                    </p>
                  </div>
                  <PhoneButton
                    href={`tel:${selectedDriver.phone}`}
                    label="Appeler le chauffeur"
                  />
                </div>
              ) : (
                <p className="text-sm text-ink-soft">
                  En attente d’un taxi agréé.
                </p>
              )}

              {selected.status === "requested" ||
              (selected.status === "scheduled" && !selectedDriver) ? (
                <DispatchWait onlineCount={taxisOnline} trip={selected} />
              ) : null}

              {tripPhone(selected) ? (
                <div className="flex items-center justify-between card px-4 py-3">
                  <p className="text-sm text-ink-soft">
                    Appeler le client
                  </p>
                  <PhoneButton
                    href={phoneHref(tripPhone(selected)!)}
                    label="Appeler le client"
                  />
                </div>
              ) : null}

              {dispatchMessage &&
              (selected.status === "requested" ||
                selected.status === "scheduled" ||
                (selected.status === "cancelled" &&
                  selected.cancelReason === "timeout")) ? (
                <DispatchFallback
                  message={dispatchMessage}
                  timedOut={selected.status === "cancelled"}
                />
              ) : null}

              {isActiveTrip(selected.status) &&
              (selected.status === "scheduled" ||
                selected.status === "requested" ||
                selected.status === "accepted") ? (
                confirmCancel ? (
                  <div className="space-y-2">
                    <p className="text-sm text-ink-soft">
                      Annuler la course de {tripClientLabel(selected)} ?
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmCancel(false)}
                        className="secondary-button flex flex-1 items-center justify-center"
                      >
                        Non
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          cancelTrip(selected.id, "user");
                          setConfirmCancel(false);
                          setPanel("board");
                        }}
                        className="bg-coral text-shell flex min-h-12 flex-1 items-center justify-center rounded-full text-sm font-semibold"
                      >
                        Oui, annuler
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmCancel(true)}
                    className="secondary-button flex w-full items-center justify-center"
                  >
                    Annuler la course
                  </button>
                )
              ) : null}

              {selected.status === "cancelled" ? (
                <button
                  type="button"
                  onClick={openCompose}
                  className="primary-button flex w-full items-center justify-center"
                >
                  Renvoyer une course
                </button>
              ) : null}
            </div>
          ) : null}

          {panel === "detail" && !selected ? (
            <div className="py-8 text-sm text-ink-muted">
              Cette course n’est plus sur ce tableau.
              <button
                type="button"
                onClick={() => setPanel("board")}
                className="mt-3 block font-semibold text-sea"
              >
                Retour au tableau
              </button>
            </div>
          ) : null}
        </div>
      </section>
    </div>
  );
}

function ZoneSelect({
  label,
  onChange,
}: {
  label: string;
  onChange: (zone: FareZoneId) => void;
}) {
  return (
    <label className="block">
      <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
        {label}
      </span>
      <select
        className="field h-12"
        defaultValue=""
        onChange={(event) => onChange(event.target.value as FareZoneId)}
      >
        <option value="" disabled>
          Choisir le quartier
        </option>
        {Object.entries(FARE_ZONE_LABELS).map(([value, zoneLabel]) => (
          <option key={value} value={value}>
            {zoneLabel}
          </option>
        ))}
      </select>
    </label>
  );
}

function RequirementToggle({
  checked,
  label,
  onChange,
}: {
  checked: boolean;
  label: string;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="flex min-h-11 items-center justify-between gap-3 text-sm">
      <span>{label}</span>
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        className="accent-sea h-5 w-5"
      />
    </label>
  );
}

function Chip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="chip shrink-0 px-3.5"
    >
      {label}
    </button>
  );
}
