"use client";

import { useEffect, useRef } from "react";
import { LngLatBounds, Map, Marker } from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { SBH_CENTER } from "@/lib/config";
import {
  FALLBACK_MAP_STYLE,
  ISLAND_MAP_STYLE,
  USE_VECTOR_BASEMAP,
} from "@/lib/map-style";

type Point = { lat: number; lng: number; heading?: number | null };

function createTaxiPin(heading?: number | null) {
  const el = document.createElement("div");
  el.className = "pin-taxi";
  const img = document.createElement("img");
  img.src = "/icons/taxi-car.svg";
  img.alt = "";
  img.draggable = false;
  el.appendChild(img);
  applyTaxiHeading(el, heading);
  return el;
}

function applyTaxiHeading(el: HTMLElement, heading?: number | null) {
  const img = el.querySelector("img");
  if (!img) return;
  img.style.transform =
    heading == null || !Number.isFinite(heading) ? "" : `rotate(${heading}deg)`;
}

type IslandMapProps = {
  pickup?: Point | null;
  destination?: Point | null;
  taxi?: Point | null;
  taxis?: Point[];
  route?: [number, number][];
  bottomPadding?: number;
  leftPadding?: number;
  rightPadding?: number;
  className?: string;
};

export function IslandMap({
  pickup,
  destination,
  taxi,
  taxis,
  route,
  bottomPadding = 0,
  leftPadding = 0,
  rightPadding = 0,
  className,
}: IslandMapProps) {
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<Map | null>(null);
  const routeRef = useRef(route);
  const routeCasingRef = useRef<SVGPathElement | null>(null);
  const routeLineRef = useRef<SVGPathElement | null>(null);
  const drawRouteRef = useRef<() => void>(() => undefined);
  const pickupMarker = useRef<Marker | null>(null);
  const destMarker = useRef<Marker | null>(null);
  const taxiMarker = useRef<Marker | null>(null);
  const taxiMarkers = useRef<Marker[]>([]);
  const readyRef = useRef(false);
  const centeredIdleTaxi = useRef(false);
  const fittedTaxiWithTrip = useRef(false);
  const lastTripFitKey = useRef("");

  useEffect(() => {
    routeRef.current = route;
    drawRouteRef.current();
  }, [route]);

  useEffect(() => {
    const container = mapContainerRef.current;
    if (!container) return;

    const map = new Map({
      container,
      style: USE_VECTOR_BASEMAP ? ISLAND_MAP_STYLE : FALLBACK_MAP_STYLE,
      center: [SBH_CENTER.lng, SBH_CENTER.lat],
      zoom: 12.1,
      attributionControl: false,
    });

    mapRef.current = map;

    // Vector tiles are parsed in a worker; if that worker never comes up the
    // island style renders as an empty background. Swapping to raster after the
    // fact does not recover, so this only buys a usable map on slow starts.
    let vectorTilesArrived = false;
    const noteVectorData = (event: { sourceId?: string; tile?: unknown }) => {
      if (event.sourceId === "ofm" && event.tile) vectorTilesArrived = true;
    };
    let fallbackTimer: number | undefined;
    if (USE_VECTOR_BASEMAP) {
      map.on("sourcedata", noteVectorData);
      fallbackTimer = window.setTimeout(() => {
        if (!vectorTilesArrived) map.setStyle(FALLBACK_MAP_STYLE);
      }, 5_000);
    }

    const drawRoute = () => {
      const points = routeRef.current;
      const casing = routeCasingRef.current;
      const line = routeLineRef.current;
      if (!casing || !line) return;
      if (!points || points.length < 2) {
        casing.setAttribute("d", "");
        line.setAttribute("d", "");
        return;
      }

      const path = points
        .map(([lng, lat], index) => {
          const projected = map.project([lng, lat]);
          return `${index === 0 ? "M" : "L"}${projected.x.toFixed(1)},${projected.y.toFixed(1)}`;
        })
        .join(" ");
      casing.setAttribute("d", path);
      line.setAttribute("d", path);
    };
    drawRouteRef.current = drawRoute;
    map.on("render", drawRoute);

    const markReady = () => {
      readyRef.current = true;
      map.resize();
      drawRoute();
    };

    map.on("load", markReady);

    const observer = new ResizeObserver(() => {
      map.resize();
    });
    observer.observe(container);

    return () => {
      readyRef.current = false;
      observer.disconnect();
      map.off("render", drawRoute);
      map.off("sourcedata", noteVectorData);
      if (fallbackTimer !== undefined) window.clearTimeout(fallbackTimer);
      pickupMarker.current?.remove();
      destMarker.current?.remove();
      taxiMarker.current?.remove();
      for (const marker of taxiMarkers.current) marker.remove();
      pickupMarker.current = null;
      destMarker.current = null;
      taxiMarker.current = null;
      taxiMarkers.current = [];
      map.remove();
      mapRef.current = null;
      drawRouteRef.current = () => undefined;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const syncMarkers = () => {
      const tripKey = `${pickup?.lat ?? ""}:${pickup?.lng ?? ""}:${destination?.lat ?? ""}:${destination?.lng ?? ""}`;
      if (tripKey !== lastTripFitKey.current) {
        lastTripFitKey.current = tripKey;
        fittedTaxiWithTrip.current = false;
      }

      if (pickup) {
        if (!pickupMarker.current) {
          const el = document.createElement("div");
          el.className = "pin-pickup";
          el.style.zIndex = "2";
          pickupMarker.current = new Marker({ element: el })
            .setLngLat([pickup.lng, pickup.lat])
            .addTo(map);
        } else {
          pickupMarker.current.setLngLat([pickup.lng, pickup.lat]);
        }
      } else {
        pickupMarker.current?.remove();
        pickupMarker.current = null;
      }

      if (destination) {
        if (!destMarker.current) {
          const el = document.createElement("div");
          el.className = "pin-dest";
          el.style.zIndex = "2";
          destMarker.current = new Marker({ element: el })
            .setLngLat([destination.lng, destination.lat])
            .addTo(map);
        } else {
          destMarker.current.setLngLat([destination.lng, destination.lat]);
        }
      } else {
        destMarker.current?.remove();
        destMarker.current = null;
      }

      if (taxi) {
        if (!taxiMarker.current) {
          const el = createTaxiPin(taxi.heading);
          el.style.zIndex = "3";
          taxiMarker.current = new Marker({ element: el })
            .setLngLat([taxi.lng, taxi.lat])
            .addTo(map);
        } else {
          taxiMarker.current.setLngLat([taxi.lng, taxi.lat]);
          applyTaxiHeading(taxiMarker.current.getElement(), taxi.heading);
        }
        if (!pickup && !destination && !centeredIdleTaxi.current) {
          centeredIdleTaxi.current = true;
          map.easeTo({
            center: [taxi.lng, taxi.lat],
            zoom: 13.4,
            duration: 500,
          });
        } else if (
          (pickup || destination) &&
          !fittedTaxiWithTrip.current
        ) {
          fittedTaxiWithTrip.current = true;
          const bounds = new LngLatBounds(
            [taxi.lng, taxi.lat],
            [taxi.lng, taxi.lat],
          );
          if (pickup) bounds.extend([pickup.lng, pickup.lat]);
          if (destination) bounds.extend([destination.lng, destination.lat]);
          map.fitBounds(bounds, {
            padding: {
              top: 80,
              right: 44,
              bottom: 120,
              left: 44,
            },
            duration: 600,
            maxZoom: 14.2,
          });
        }
      } else {
        taxiMarker.current?.remove();
        taxiMarker.current = null;
        fittedTaxiWithTrip.current = false;
      }

      if (pickup || destination) centeredIdleTaxi.current = false;

      const nearby = taxis ?? [];
      while (taxiMarkers.current.length > nearby.length) {
        taxiMarkers.current.pop()?.remove();
      }
      nearby.forEach((point, index) => {
        const existing = taxiMarkers.current[index];
        if (existing) {
          existing.setLngLat([point.lng, point.lat]);
          applyTaxiHeading(existing.getElement(), point.heading);
          return;
        }
        const el = createTaxiPin(point.heading);
        el.style.zIndex = "3";
        taxiMarkers.current[index] = new Marker({ element: el })
          .setLngLat([point.lng, point.lat])
          .addTo(map);
      });

      drawRouteRef.current();
    };

    if (readyRef.current) {
      syncMarkers();
      return;
    }

    map.once("load", syncMarkers);
  }, [pickup, destination, taxi, taxis]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    const fit = () => {
      const padding = {
        top: 80,
        right: Math.max(44, rightPadding + 44),
        bottom: Math.max(80, bottomPadding + 24),
        left: Math.max(44, leftPadding + 44),
      };
      map.setPadding({ top: 0, right: 0, bottom: 0, left: 0 });

      const points: Point[] = [];
      if (pickup) points.push(pickup);
      if (destination) points.push(destination);

      if (points.length >= 2) {
        const bounds = new LngLatBounds(
          [points[0].lng, points[0].lat],
          [points[0].lng, points[0].lat],
        );
        for (const point of points) bounds.extend([point.lng, point.lat]);
        if (route) {
          for (const coord of route) bounds.extend(coord);
        }
        map.fitBounds(bounds, {
          padding,
          duration: 600,
          maxZoom: 14.2,
        });
      } else if (pickup) {
        map.easeTo({
          center: [pickup.lng, pickup.lat],
          zoom: 13.2,
          padding,
          duration: 500,
        });
      }
    };

    if (readyRef.current) {
      fit();
      return;
    }

    map.once("load", fit);
  }, [bottomPadding, leftPadding, pickup, destination, rightPadding, route]);

  return (
    <div className={`relative ${className ?? "h-full w-full"}`}>
      <div ref={mapContainerRef} className="absolute inset-0" />
      <svg
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 z-1 h-full w-full overflow-hidden"
      >
        <path
          ref={routeCasingRef}
          fill="none"
          stroke="#fbf7f0"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeOpacity="0.9"
          strokeWidth="11"
        />
        <path
          ref={routeLineRef}
          fill="none"
          stroke="#0f313c"
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="6"
        />
      </svg>
    </div>
  );
}
