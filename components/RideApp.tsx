"use client";

import dynamic from "next/dynamic";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { AppHeader, PhoneButton, ScreenLoading } from "@/components/AppChrome";
import {
  DispatchFallback,
  DispatchWait,
} from "@/components/DispatchFallback";
import { isInsideSbh } from "@/lib/config";
import { isFreshGps } from "@/lib/driver-gps";
import { FARE_ZONE_LABELS, formatFareBand } from "@/lib/fares";
import {
  datetimeLocalInStBarth,
  formatEuro,
  stBarthIsoFromLocalInput,
} from "@/lib/format";
import { haversineKm, pointFromPlace, sameLocation } from "@/lib/geo";
import {
  cancelTrip,
  driverById,
  getMockState,
  getSavedPassengerContact,
  onlineDriverCount,
  passengerTrip,
  pickupEtaMinutes,
  requestTrip,
  savePassengerContact,
  taxiPositionForTrip,
  tripClientLabel,
  tripPhone,
  type MockTrip,
} from "@/lib/mock-store";
import { taxiCaption } from "@/lib/licensed-taxis";
import { isValidPhone } from "@/lib/phone";
import {
  findPlaceByName,
  nearestPlace,
  POPULAR_DESTINATIONS,
  randomSbhPickup,
} from "@/lib/places";
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
import { useHydrated, useMockStore } from "@/lib/use-mock-store";
import { useRoadRoute } from "@/lib/use-road-route";
import { useSheetMapPadding } from "@/lib/use-sheet-padding";
import { PlaceSearch } from "./PlaceSearch";
import { TripRoute } from "./TripRoute";

const IslandMap = dynamic(
  () => import("./IslandMap").then((mod) => mod.IslandMap),
  { ssr: false },
);

type Step =
  | "location"
  | "quote"
  | "scheduled"
  | "searching"
  | "tracking"
  | "done"
  | "no_driver";

function tripHeadline(trip: MockTrip) {
  if (trip.status === "accepted") return "Votre taxi arrive";
  if (trip.status === "arrived") return "Votre taxi est là";
  if (trip.status === "onboard") return "En route";
  return "Course en cours";
}

function cancelCopy(trip: MockTrip) {
  if (trip.cancelReason === "timeout") {
    return "Aucun taxi disponible pour le moment.";
  }
  if (trip.cancelReason === "no_show") {
    return "Le chauffeur n’a trouvé personne au départ.";
  }
  if (trip.cancelReason === "driver") {
    return "Le chauffeur a libéré la course.";
  }
  return "La course a été annulée.";
}

export function RideApp() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hydrated = useHydrated();
  const mock = useMockStore();
  const [step, setStep] = useState<Step>("location");
  const [tripId, setTripId] = useState<string | null>(null);
  const [pickup, setPickup] = useState<Place | null>(null);
  const [pickupQuery, setPickupQuery] = useState("");
  const [needPickupSearch, setNeedPickupSearch] = useState(false);
  const [locating, setLocating] = useState(true);
  const [destination, setDestination] = useState<Place | null>(null);
  const [destinationQuery, setDestinationQuery] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [departLater, setDepartLater] = useState(false);
  const [departLocal, setDepartLocal] = useState(() =>
    datetimeLocalInStBarth(new Date()),
  );
  const [passengerName, setPassengerName] = useState<string | null>(null);
  const [passengerPhone, setPassengerPhone] = useState<string | null>(null);
  const [guestCount, setGuestCount] = useState(1);
  const [notes, setNotes] = useState("");
  const [requirements, setRequirements] = useState<TripRequirements>({
    ...EMPTY_TRIP_REQUIREMENTS,
  });
  const [gpsPickup, setGpsPickup] = useState<Place | null>(null);
  const { bottomPadding, leftPadding, sheetRef } = useSheetMapPadding(
    `${step}-${tripId ?? ""}`,
  );

  const allowSimulatedPickup =
    process.env.NODE_ENV !== "production" ||
    process.env.NEXT_PUBLIC_ALLOW_SIMULATED_LOCATION === "true";

  const trip = mock.trips.find((item) => item.id === tripId) ?? null;
  const driver = driverById(mock, trip?.driverId ?? null);
  const taxisOnline = onlineDriverCount(mock);
  const pickupPoint = pointFromPlace(pickup);
  const destPoint = pointFromPlace(destination);
  const taxiPoint =
    trip && driver ? taxiPositionForTrip(trip, driver) : null;
  const etaMinutes = trip ? pickupEtaMinutes(trip, driver) : null;
  const nearbyTaxis = useMemo(
    () =>
      mock.drivers
        .filter(
          (item) => item.online && isFreshGps(item.locationUpdatedAt),
        )
        .toSorted((a, b) => {
          if (!pickupPoint) return a.id.localeCompare(b.id);
          return (
            haversineKm(a.location, pickupPoint) -
            haversineKm(b.location, pickupPoint)
          );
        })
        .map((item) => ({
          ...item.location,
          heading: item.heading,
        })),
    [mock.drivers, pickupPoint],
  );
  const requirementsSupported = mock.drivers.some(
    (driver) =>
      (!requirements.pmr || driver.pmr === true) &&
      (!requirements.hybridElectric || driver.hybridElectric === true),
  );

  const departAt = useMemo(
    () =>
      departLater
        ? new Date(stBarthIsoFromLocalInput(departLocal))
        : new Date(),
    [departLater, departLocal],
  );

  const { route: roadRoute, isLoading: routeLoading } = useRoadRoute(
    pickupPoint,
    destPoint,
  );
  const quote = useMemo(() => {
    if (!pickup || !destination || sameLocation(pickup, destination)) return null;
    const fallback = buildOfficialQuote(pickup, destination, departAt);
    return {
      ...fallback,
      route: roadRoute ?? (routeLoading ? [] : fallback.route),
    };
  }, [departAt, destination, pickup, roadRoute, routeLoading]);

  const savedContact = getSavedPassengerContact();
  const nameValue = passengerName ?? savedContact.name;
  const phoneValue = passengerPhone ?? savedContact.phone;

  useEffect(() => {
    if (tripId) return;
    const active = passengerTrip(mock);
    if (active) {
      // Shared mock store is the source of truth across passenger remounts.
      // eslint-disable-next-line react-hooks/set-state-in-effect -- sync from mock store
      setTripId(active.id);
    }
  }, [mock, tripId]);

  useEffect(() => {
    if (!trip) return;
    /* eslint-disable react-hooks/set-state-in-effect -- trip status from the shared mock store drives the sheet */
    setPickup(trip.pickup);
    setDestination(trip.destination);
    setDestinationQuery(trip.destination.name);
    setConfirmCancel(false);
    if (trip.status === "scheduled") setStep("scheduled");
    else if (trip.status === "requested") setStep("searching");
    else if (
      trip.status === "accepted" ||
      trip.status === "arrived" ||
      trip.status === "onboard"
    ) {
      setStep("tracking");
    } else if (trip.status === "completed") {
      setStep("done");
    } else if (trip.status === "cancelled") {
      if (trip.cancelReason === "user") {
        setTripId(null);
        setStep("quote");
        return;
      }
      setError(cancelCopy(trip));
      setStep(trip.cancelReason === "timeout" ? "no_driver" : "quote");
      if (trip.cancelReason !== "timeout") setTripId(null);
    }
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [trip]);

  useEffect(() => {
    let cancelled = false;

    const applyPickup = (place: Place) => {
      if (passengerTrip(getMockState())) return;
      setGpsPickup(place);
      setPickup(place);
      setPickupQuery(place.address);
      setNeedPickupSearch(false);
      setLocating(false);
    };

    if (allowSimulatedPickup) {
      applyPickup(randomSbhPickup());
    }

    const fallback = window.setTimeout(() => {
      if (cancelled) return;
      setLocating((was) => {
        if (!was) return was;
        setNeedPickupSearch(true);
        return false;
      });
    }, 9_000);

    if (!navigator.geolocation) {
      queueMicrotask(() => {
        if (cancelled) return;
        setLocating(false);
        setNeedPickupSearch(true);
      });
      return () => {
        cancelled = true;
        window.clearTimeout(fallback);
      };
    }

    const readPosition = (highAccuracy: boolean) =>
      new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: highAccuracy,
          timeout: highAccuracy ? 8_000 : 5_000,
          maximumAge: 60_000,
        });
      });

    const locate = async () => {
      try {
        const position = await readPosition(true).catch(() =>
          readPosition(false),
        );
        if (cancelled) return;
        const lat = position.coords.latitude;
        const lng = position.coords.longitude;
        if (!isInsideSbh(lat, lng)) {
          if (!allowSimulatedPickup) {
            setLocating(false);
            setNeedPickupSearch(true);
            setError(
              "Position hors de Saint-Barth. Choisissez un départ sur l’île.",
            );
          }
          return;
        }
        const nearby = nearestPlace(lat, lng);
        applyPickup({
          name: "Position actuelle",
          address: nearby.address,
          lat,
          lng,
          source: "gps",
        });
      } catch {
        if (!allowSimulatedPickup && !cancelled) {
          setLocating(false);
          setNeedPickupSearch(true);
        }
      }
    };

    void locate();

    return () => {
      cancelled = true;
      window.clearTimeout(fallback);
    };
  }, [allowSimulatedPickup]);

  const sameTrip = Boolean(
    pickup && destination && sameLocation(pickup, destination),
  );
  const canQuote = Boolean(pickup && destination && !sameTrip && !routeLoading);
  const canRequest = Boolean(
    quote &&
      quote.zoneFrom &&
      quote.zoneTo &&
      pickup &&
      destination &&
      isValidPhone(phoneValue) &&
      requirementsSupported,
  );
  const tripLabel = (() => {
    const active = trip?.quote ?? quote;
    if (!active) return null;
    return {
      time:
        active.durationMinutes == null
          ? "Durée à confirmer"
          : `~${Math.max(1, Math.round(active.durationMinutes))} min`,
      fare: active.fare == null ? "À confirmer" : formatEuro(active.fare),
      distance:
        active.distanceKm == null
          ? "Itinéraire à confirmer"
          : `${active.distanceKm.toFixed(1)} km`,
      zones:
        active.zoneFrom && active.zoneTo
          ? `${FARE_ZONE_LABELS[active.zoneFrom]} → ${FARE_ZONE_LABELS[active.zoneTo]}`
          : "Quartier à confirmer par le chauffeur",
      band: formatFareBand(active.fareBand),
    };
  })();
  const dispatchMessage = trip
    ? buildTaxiRequestMessage({
        pickup: trip.pickup.address,
        when: new Date(trip.quote.departAt),
        quote: trip.quote,
        client: tripClientLabel(trip),
        phone: tripPhone(trip),
        notes: trip.notes,
        guestCount: trip.guestCount,
      })
    : "";

  function resetComposer() {
    setTripId(null);
    setDestination(null);
    setDestinationQuery("");
    setError(null);
    setConfirmCancel(false);
    setNotes("");
    setRequirements({ ...EMPTY_TRIP_REQUIREMENTS });
    setStep("location");
  }

  function handleQuote() {
    if (!canQuote) return;
    setError(null);
    setStep("quote");
  }

  function handleRequest() {
    if (!pickup || !destination || !quote) return;
    if (!isValidPhone(phoneValue)) {
      setError("Indiquez un numéro pour que le chauffeur puisse vous appeler.");
      return;
    }
    savePassengerContact({
      name: nameValue.trim(),
      phone: phoneValue.trim(),
    });
    const created = requestTrip({
      pickup,
      destination,
      quote,
      passengerName: nameValue,
      passengerPhone: phoneValue,
      guestCount,
      notes,
      requirements,
    });
    setTripId(created.id);
    setStep(created.status === "scheduled" ? "scheduled" : "searching");
  }

  function selectPickup(place: Place) {
    setPickup(place);
    setPickupQuery(place.address);
    setNeedPickupSearch(false);
    setError(null);
  }

  function selectDestination(place: Place) {
    setDestination(place);
    setDestinationQuery(place.name);
    setError(null);
  }

  function assignCustomZone(side: "pickup" | "destination", zone: FareZoneId) {
    if (side === "pickup") {
      setPickup((current) => (current ? { ...current, fareZone: zone } : current));
    } else {
      setDestination((current) =>
        current ? { ...current, fareZone: zone } : current,
      );
    }
    setError(null);
  }

  function requestCancel() {
    if (!trip) return;
    cancelTrip(trip.id, "user");
    setConfirmCancel(false);
    setTripId(null);
    setStep("quote");
  }

  function goBack() {
    if (step === "location") {
      router.push(searchParams.toString() ? `/?${searchParams.toString()}` : "/");
      return;
    }
    if (step === "quote" || step === "no_driver") {
      setStep("location");
      setTripId(null);
      return;
    }
    if (step === "searching" || step === "scheduled") {
      setConfirmCancel(true);
      return;
    }
    if (step === "tracking" || step === "done") {
      router.push("/");
      return;
    }
    router.push("/");
  }

  const mapRoute = trip?.quote.route ?? quote?.route;
  const activeQuote = trip?.quote ?? quote ?? null;
  const canCancelAssigned = trip?.status === "accepted";

  if (!hydrated) return <ScreenLoading />;

  return (
    <div className="bg-sand relative mx-auto flex h-dvh w-full max-w-[1920px] flex-col overflow-hidden">
      <div className="absolute inset-0">
        <IslandMap
          pickup={pickupPoint}
          destination={destPoint}
          taxi={
            step === "tracking" || step === "done" || step === "scheduled"
              ? taxiPoint
              : null
          }
          taxis={nearbyTaxis}
          route={mapRoute}
          bottomPadding={bottomPadding}
          leftPadding={leftPadding}
          className="h-full w-full"
        />
        <div className="from-sand pointer-events-none absolute inset-x-0 bottom-0 h-1/3 bg-linear-to-t to-transparent lg:hidden" />
        <div className="from-sand/60 pointer-events-none absolute inset-y-0 left-0 hidden w-136 bg-linear-to-r to-transparent lg:block" />
      </div>

      <AppHeader badge="RIDE · PASSAGER" onBack={goBack} />

      <div
        ref={sheetRef}
        className="relative z-10 mt-auto w-full shrink-0 lg:absolute lg:inset-y-0 lg:left-0 lg:mt-0 lg:flex lg:w-[min(30rem,42vw)] lg:items-center lg:px-5 lg:pb-5 lg:pt-20"
      >
        <section className="sheet sheet-scroll lg:border-line rounded-t-sheet lg:rounded-sheet w-full px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 lg:border lg:px-6 lg:pb-6 lg:pt-6">
          <div className="mb-4 flex justify-center lg:hidden">
            <span className="sheet-handle" />
          </div>
          {step === "location" ? (
            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sea">
                  Taxi agréé
                </p>
                <h1 className="display mt-1.5 text-3xl">
                  Où allez-vous ?
                </h1>
                <p className="mt-2 text-xs text-ink-muted">
                  {taxisOnline} taxi{taxisOnline > 1 ? "s" : ""} avec position
                  fraîche sur l’île · registre de démonstration
                </p>
              </div>

              <div className="card px-3.5 py-2">
                <div className="flex gap-3">
                  <div className="flex w-5 shrink-0 flex-col items-center">
                    <span className="border-ink bg-shell mt-[1.05rem] h-2.5 w-2.5 shrink-0 rounded-full border-2" />
                    <span className="border-line-strong my-1.5 w-px flex-1 border-l border-dashed" />
                    <span className="bg-coral-bright mb-[1.05rem] h-2.5 w-2.5 shrink-0 rounded-full" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex h-11 items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                          Départ
                        </p>
                        <p className="mt-0.5 truncate text-sm font-semibold">
                          {locating
                            ? "Localisation…"
                            : pickup?.name === "Current location" ||
                                pickup?.name === "Position actuelle"
                              ? "Position actuelle"
                              : pickup?.name ?? "Choisir le départ"}
                        </p>
                      </div>
                      {!locating ? (
                        <button
                          type="button"
                          onClick={() =>
                            setNeedPickupSearch((current) => !current)
                          }
                          className="text-sea hover:bg-sea-soft min-h-9 rounded-full px-2.5 text-xs font-semibold transition"
                        >
                          {needPickupSearch ? "Fermer" : "Modifier"}
                        </button>
                      ) : null}
                    </div>
                    <div className="bg-line my-1.5 h-px" />
                    <div className="flex h-11 flex-col justify-center">
                      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                        Destination
                      </p>
                      <div className="-mt-0.5">
                        <PlaceSearch
                          hideLabel
                          variant="inline"
                          label="Destination"
                          placeholder="Choisir une destination"
                          value={destinationQuery}
                          onChange={(value) => {
                            setDestinationQuery(value);
                            if (destination && value !== destination.name) {
                              setDestination(null);
                            }
                          }}
                          onSelect={selectDestination}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {needPickupSearch ? (
                <div className="border-sea/20 bg-sea-soft rounded-card space-y-3 border p-3">
                  {gpsPickup ? (
                    <button
                      type="button"
                      className="flex min-h-11 w-full items-center gap-2 rounded-xl px-2 text-left text-sm font-semibold text-sea"
                      onClick={() => selectPickup(gpsPickup)}
                    >
                      <span className="flex h-8 w-8 items-center justify-center rounded-full bg-sea-soft">
                        <LocationArrowIcon />
                      </span>
                      Utiliser ma position
                    </button>
                  ) : null}
                  <PlaceSearch
                    label="Modifier le départ"
                    placeholder="Gustavia, Saint-Jean…"
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
                    onSelect={selectPickup}
                  />
                </div>
              ) : null}

              <div className="-mx-5 flex gap-2 overflow-x-auto px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                {POPULAR_DESTINATIONS.map((name) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      const place = findPlaceByName(name);
                      if (place) selectDestination(place);
                    }}
                    className="chip shrink-0 px-3.5"
                  >
                    {name}
                  </button>
                ))}
              </div>

              <div className="space-y-2">
                <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Quand
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setDepartLater(false)}
                    aria-pressed={!departLater}
                    className={`min-h-10 flex-1 rounded-full px-3 text-xs font-semibold transition ${
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
                    className={`min-h-10 flex-1 rounded-full px-3 text-xs font-semibold transition ${
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
                    className="field"
                  />
                ) : null}
              </div>

              {sameTrip ? (
                <p className="text-sm text-coral">
                  Choisissez une destination différente du départ.
                </p>
              ) : null}
              {error && step === "location" ? (
                <p className="text-sm text-coral">{error}</p>
              ) : null}

              <button
                type="button"
                disabled={!canQuote}
                onClick={handleQuote}
                className="primary-button flex w-full items-center justify-center"
              >
                {routeLoading
                  ? "Calcul de l’itinéraire…"
                  : pickup?.source === "custom" ||
                      destination?.source === "custom"
                    ? "Continuer"
                    : "Voir le tarif"}
              </button>
            </div>
          ) : null}

          {step === "quote" && activeQuote && pickup && destination && tripLabel ? (
            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sea">
                  Grille officielle
                </p>
                <div className="mt-2 flex items-end justify-between gap-4">
                  <div>
                    <h2 className="display text-3xl">Taxi agréé</h2>
                    <p className="mt-1 text-sm text-ink-muted">
                      {tripLabel.time} · {tripLabel.distance}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-muted">
                      Tarif taxi
                    </p>
                    <p className="display mt-0.5 text-4xl">{tripLabel.fare}</p>
                  </div>
                </div>
                <div className="mt-5 card p-4">
                  <TripRoute
                    pickup={pickup.address}
                    destination={destination.address}
                  />
                  <div className="mt-4 space-y-1.5 border-t border-line pt-3 text-xs text-ink-muted">
                    <p>{tripLabel.zones}</p>
                    <p>
                      {formatTripWhen(new Date(activeQuote.departAt))} ·{" "}
                      {tripLabel.band}
                    </p>
                    {activeQuote.daytimeFare != null &&
                    activeQuote.surcharge > 0 ? (
                      <p>
                        {formatEuro(activeQuote.daytimeFare)} +{" "}
                        {formatEuro(activeQuote.surcharge)} de majoration
                      </p>
                    ) : null}
                    <p>Tarifs officiels en euros. Dollars au taux du jour.</p>
                  </div>
                </div>
              </div>

              {(pickup.source === "custom" && !activeQuote.zoneFrom) ||
              (destination.source === "custom" && !activeQuote.zoneTo) ? (
                <div className="border-sea/20 bg-sea-soft rounded-card space-y-3 border p-4">
                  <p className="text-sm font-semibold">
                    Quartier tarifaire du lieu personnalisé
                  </p>
                  {pickup.source === "custom" && !activeQuote.zoneFrom ? (
                    <ZoneSelect
                      label="Quartier du départ"
                      onChange={(zone) => assignCustomZone("pickup", zone)}
                    />
                  ) : null}
                  {destination.source === "custom" && !activeQuote.zoneTo ? (
                    <ZoneSelect
                      label="Quartier de destination"
                      onChange={(zone) => assignCustomZone("destination", zone)}
                    />
                  ) : null}
                </div>
              ) : null}

              <div className="card space-y-2 p-4">
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
                    Le registre de démonstration ne contient aucun équipement
                    officiel correspondant. La demande ne peut pas être envoyée.
                  </p>
                ) : null}
              </div>

              <div className="grid grid-cols-2 gap-2">
                <label className="block">
                  <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                    Prénom
                  </span>
                  <input
                    value={nameValue}
                    onChange={(event) => setPassengerName(event.target.value)}
                    placeholder="Marie"
                    autoComplete="given-name"
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
              </div>
              {guestCount > 4 ? (
                <p className="text-xs leading-5 text-ink-muted">
                  Standard 1–4 places. Au-delà, un van ou deux taxis — à
                  confirmer avec le chauffeur.
                </p>
              ) : null}

              <label className="block">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Téléphone
                </span>
                <input
                  type="tel"
                  value={phoneValue}
                  onChange={(event) => {
                    setPassengerPhone(event.target.value);
                    setError(null);
                  }}
                  placeholder="+590 690 00 00 00"
                  autoComplete="tel"
                  className="field h-12"
                />
              </label>

              <label className="block">
                <span className="mb-2 block text-[10px] font-semibold uppercase tracking-[0.16em] text-ink-muted">
                  Note (optionnel)
                </span>
                <input
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Bagages, écriteau…"
                  className="field h-12"
                />
              </label>

              <p className="text-xs leading-5 text-ink-muted">
                Forfait Collectivité 2024, 1 à 4 passagers. Pas de compteur.
                Vous payez le chauffeur, cash en euros, sans frais de
                réservation.
                {!activeQuote.zoneFrom || !activeQuote.zoneTo
                  ? " Le chauffeur indiquera le quartier du lieu personnalisé avant de confirmer le tarif."
                  : activeQuote.fare == null
                    ? " Ce trajet n’est pas dans la grille reconstituée : confirmez le prix avec le taxi."
                    : ""}
              </p>
              {error ? <p className="text-sm text-coral">{error}</p> : null}
              <button
                type="button"
                disabled={!canRequest}
                onClick={handleRequest}
                className="primary-button flex w-full items-center justify-center"
              >
                {departLater ? "Réserver un taxi" : "Demander un taxi"}
              </button>
            </div>
          ) : null}

          {step === "scheduled" && trip && tripLabel && pickup && destination ? (
            <div className="space-y-5" aria-live="polite">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sea">
                  {driver ? "Taxi réservé" : "Course planifiée"}
                </p>
                <h2 className="display mt-1.5 text-3xl">
                  {formatTripWhen(new Date(trip.quote.departAt))}
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink-soft">
                  {driver
                    ? `${driver.name} prendra la course à l’heure prévue.`
                    : "Un chauffeur peut réserver cette course à l’avance."}
                </p>
                {!driver ? (
                  <div className="mt-2">
                    <DispatchWait onlineCount={taxisOnline} trip={trip} />
                  </div>
                ) : null}
              </div>
              {driver ? (
                <div className="flex items-center gap-3 card p-4">
                  <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sea-soft text-lg font-semibold text-sea">
                    {driver.name.slice(0, 1)}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="font-semibold">{driver.name}</p>
                    <p className="text-sm text-ink-muted">
                      {taxiCaption(driver)}
                    </p>
                  </div>
                  <PhoneButton
                    href={`tel:${driver.phone}`}
                    label="Appeler le chauffeur"
                  />
                </div>
              ) : null}
              <div className="card p-4">
                <TripRoute
                  pickup={pickup.address}
                  destination={destination.address}
                />
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                  <span className="text-xs text-ink-muted">Tarif taxi</span>
                  <span className="font-semibold">{tripLabel.fare}</span>
                </div>
              </div>
              <CancelBlock
                confirm={confirmCancel}
                onAsk={() => setConfirmCancel(true)}
                onKeep={() => setConfirmCancel(false)}
                onConfirm={requestCancel}
                prompt="Annuler cette réservation ?"
              />
            </div>
          ) : null}

          {step === "searching" ? (
            <div className="space-y-5" aria-live="polite">
              <div className="flex items-start gap-3">
                <span className="relative mt-1 flex h-10 w-10 items-center justify-center">
                  <span className="border-sea/40 pulse-ring absolute inset-0 rounded-full border" />
                  <span className="bg-sea h-3 w-3 rounded-full" />
                </span>
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sea">
                    Taxi agréé
                  </p>
                  <h2 className="display mt-1.5 text-3xl">
                    {trip?.quote.zoneFrom && trip?.quote.zoneTo
                      ? "Recherche d’un chauffeur…"
                      : "Confirmation du quartier…"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-ink-soft">
                    {trip?.quote.zoneFrom && trip?.quote.zoneTo
                      ? "Demande envoyée aux taxis disponibles. Le chauffeur pourra vous appeler."
                      : "Un chauffeur doit identifier le quartier du lieu personnalisé pour calculer le tarif officiel."}
                  </p>
                  {trip ? (
                    <div className="mt-2">
                      <DispatchWait onlineCount={taxisOnline} trip={trip} />
                    </div>
                  ) : null}
                </div>
              </div>
              {pickup && destination && tripLabel ? (
                <div className="card p-4">
                  <TripRoute
                    pickup={pickup.address}
                    destination={destination.address}
                  />
                  <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                    <span className="text-xs text-ink-muted">Tarif taxi</span>
                    <span className="font-semibold">{tripLabel.fare}</span>
                  </div>
                </div>
              ) : null}
              <CancelBlock
                confirm={confirmCancel}
                onAsk={() => setConfirmCancel(true)}
                onKeep={() => setConfirmCancel(false)}
                onConfirm={requestCancel}
                prompt="Annuler cette demande ?"
              />
            </div>
          ) : null}

          {step === "no_driver" && trip ? (
            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sea">
                  Aucun taxi
                </p>
                <h2 className="display mt-1.5 text-3xl">
                  Réessayez, ou appelez une station
                </h2>
                <p className="mt-2 text-sm leading-6 text-ink-soft">
                  En haute saison, prévoyez un peu d’avance. Le tarif affiché
                  reste valable si vous transmettez la course.
                </p>
              </div>
              <DispatchFallback message={dispatchMessage} timedOut />
              <button
                type="button"
                onClick={() => {
                  setTripId(null);
                  setError(null);
                  setStep("quote");
                }}
                className="primary-button flex w-full items-center justify-center"
              >
                Réessayer
              </button>
            </div>
          ) : null}

          {step === "tracking" &&
          trip &&
          driver &&
          tripLabel &&
          pickup &&
          destination ? (
            <div className="space-y-5" aria-live="polite">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sea">
                  {driver.ads}
                </p>
                <h2 className="display mt-1.5 text-3xl">
                  {tripHeadline(trip)}
                </h2>
                {trip.status === "accepted" ? (
                  <p className="mt-1 text-sm text-ink-muted">
                    {etaMinutes
                      ? `Arrivée estimée ~${etaMinutes} min`
                      : "En route vers vous"}
                  </p>
                ) : null}
              </div>
              <div className="flex items-center gap-3 card p-4">
                <span className="flex h-12 w-12 items-center justify-center rounded-full bg-sea-soft text-lg font-semibold text-sea">
                  {driver.name.slice(0, 1)}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="font-semibold">{driver.name}</p>
                  <p className="text-sm text-ink-muted">
                    {taxiCaption(driver)}
                  </p>
                </div>
                <PhoneButton
                  href={`tel:${driver.phone}`}
                  label="Appeler le chauffeur"
                />
              </div>
              <div className="card p-4">
                <TripRoute
                  pickup={pickup.address}
                  destination={destination.address}
                />
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                  <span className="text-xs text-ink-muted">Tarif taxi</span>
                  <span className="font-semibold">{tripLabel.fare}</span>
                </div>
              </div>
              {canCancelAssigned ? (
                <CancelBlock
                  confirm={confirmCancel}
                  onAsk={() => setConfirmCancel(true)}
                  onKeep={() => setConfirmCancel(false)}
                  onConfirm={() => {
                    cancelTrip(trip.id, "user");
                    resetComposer();
                  }}
                  prompt="Annuler la course ? Le chauffeur sera libéré."
                  label="Annuler la course"
                />
              ) : (
                <p className="text-xs leading-5 text-ink-muted">
                  Paiement à bord, cash en euros. La carte n’est pas garantie.
                </p>
              )}
            </div>
          ) : null}

          {step === "done" && trip && tripLabel && pickup && destination ? (
            <div className="space-y-5">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-sea">
                  Course terminée
                </p>
                <h1 className="display mt-1.5 text-3xl">
                  Merci. Payez le chauffeur.
                </h1>
              </div>
              <div className="card p-4">
                <TripRoute
                  pickup={pickup.address}
                  destination={destination.address}
                />
                {driver ? (
                  <p className="mt-3 text-xs text-ink-muted">
                    {driver.name} · {taxiCaption(driver)}
                  </p>
                ) : null}
                <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                  <span className="text-xs text-ink-muted">Tarif taxi</span>
                  <span className="text-xl font-semibold">{tripLabel.fare}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={resetComposer}
                className="primary-button flex w-full items-center justify-center"
              >
                Nouvelle course
              </button>
            </div>
          ) : null}
        </section>
      </div>
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
      <span className="mb-1.5 block text-xs text-ink-muted">{label}</span>
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

function CancelBlock({
  confirm,
  onAsk,
  onKeep,
  onConfirm,
  prompt,
  label = "Annuler",
}: {
  confirm: boolean;
  onAsk: () => void;
  onKeep: () => void;
  onConfirm: () => void;
  prompt: string;
  label?: string;
}) {
  if (confirm) {
    return (
      <div className="space-y-2">
        <p className="text-sm text-ink-soft">{prompt}</p>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={onKeep}
            className="secondary-button flex flex-1 items-center justify-center"
          >
            Continuer
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="bg-coral text-shell flex min-h-12 flex-1 items-center justify-center rounded-full text-sm font-semibold"
          >
            Oui, annuler
          </button>
        </div>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={onAsk}
      className="secondary-button flex w-full items-center justify-center"
    >
      {label}
    </button>
  );
}

function LocationArrowIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
      <path
        d="m20 4-7.2 16-2-6.8L4 11.2 20 4Z"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinejoin="round"
      />
    </svg>
  );
}
