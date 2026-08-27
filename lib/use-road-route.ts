"use client";

import { useEffect, useState } from "react";
import type { LatLng } from "./types";

type RouteCoordinates = [number, number][];

type RouteResult = {
  key: string;
  route: RouteCoordinates | null;
};

function validRoute(value: unknown): value is RouteCoordinates {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    value.every(
      (coordinate) =>
        Array.isArray(coordinate) &&
        coordinate.length === 2 &&
        coordinate.every(
          (number) => typeof number === "number" && Number.isFinite(number),
        ),
    )
  );
}

export function useRoadRoute(
  pickup: LatLng | null | undefined,
  destination: LatLng | null | undefined,
) {
  const pickupLat = pickup?.lat;
  const pickupLng = pickup?.lng;
  const destinationLat = destination?.lat;
  const destinationLng = destination?.lng;
  const key =
    pickupLat !== undefined &&
    pickupLng !== undefined &&
    destinationLat !== undefined &&
    destinationLng !== undefined
      ? `${pickupLat},${pickupLng}:${destinationLat},${destinationLng}`
      : null;
  const [result, setResult] = useState<RouteResult | null>(null);

  useEffect(() => {
    if (
      key === null ||
      pickupLat === undefined ||
      pickupLng === undefined ||
      destinationLat === undefined ||
      destinationLng === undefined
    ) {
      return;
    }

    const routeKey = key;
    const controller = new AbortController();

    async function loadRoute() {
      try {
        const response = await fetch("/api/route", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            pickup: { lat: pickupLat, lng: pickupLng },
            destination: { lat: destinationLat, lng: destinationLng },
          }),
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Route request failed");

        const data = (await response.json()) as { route?: unknown };
        if (!validRoute(data.route)) throw new Error("Invalid route geometry");

        setResult({ key: routeKey, route: data.route });
      } catch {
        if (!controller.signal.aborted) {
          setResult({ key: routeKey, route: null });
        }
      }
    }

    void loadRoute();
    return () => controller.abort();
  }, [
    destinationLat,
    destinationLng,
    key,
    pickupLat,
    pickupLng,
  ]);

  const current = result?.key === key ? result : null;
  return {
    route: current?.route ?? null,
    isLoading: key !== null && current === null,
  };
}
