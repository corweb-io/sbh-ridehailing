"use client";

import { useEffect, useState } from "react";
import { isInsideSbh } from "./config";
import {
  GPS_MIN_MOVE_M,
  GPS_UPLOAD_MS,
  movedEnough,
  postDriverLocation,
} from "./driver-gps";
import { setDriverLocation } from "./mock-store";

export type GpsStatus =
  | "idle"
  | "locating"
  | "live"
  | "denied"
  | "unavailable"
  | "outside";

type WakeLockSentinel = {
  released: boolean;
  release: () => Promise<void>;
};

function headingOf(coords: GeolocationCoordinates) {
  return typeof coords.heading === "number" && Number.isFinite(coords.heading)
    ? coords.heading
    : null;
}

export function primeGeolocation() {
  if (!navigator.geolocation) return;
  navigator.geolocation.getCurrentPosition(
    () => undefined,
    () => undefined,
    { enableHighAccuracy: true, timeout: 8_000, maximumAge: 0 },
  );
}

export function useDriverGps(driverId: string | null, enabled: boolean) {
  const [status, setStatus] = useState<GpsStatus>("idle");

  useEffect(() => {
    if (!enabled || !driverId) {
      return;
    }
    if (!navigator.geolocation) {
      queueMicrotask(() => setStatus("unavailable"));
      return;
    }

    let cancelled = false;
    let lastSentAt = 0;
    let lastSent = { lat: 0, lng: 0 };
    let wakeLock: WakeLockSentinel | null = null;

    const requestWakeLock = async () => {
      const nav = navigator as Navigator & {
        wakeLock?: { request: (type: "screen") => Promise<WakeLockSentinel> };
      };
      try {
        wakeLock = (await nav.wakeLock?.request("screen")) ?? null;
      } catch {
        wakeLock = null;
      }
    };

    const onPosition = (position: GeolocationPosition) => {
      if (cancelled) return;
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const accuracy =
        typeof position.coords.accuracy === "number" &&
        Number.isFinite(position.coords.accuracy)
          ? position.coords.accuracy
          : null;

      if (!isInsideSbh(lat, lng)) {
        setStatus("outside");
        return;
      }

      const ping = {
        driverId,
        lat,
        lng,
        heading: headingOf(position.coords),
        accuracy,
        updatedAt: new Date(position.timestamp || Date.now()).toISOString(),
      };
      setDriverLocation(ping);
      setStatus("live");

      const now = Date.now();
      const due =
        now - lastSentAt >= GPS_UPLOAD_MS ||
        movedEnough(lastSent, { lat, lng }, GPS_MIN_MOVE_M);
      if (!due) return;
      lastSentAt = now;
      lastSent = { lat, lng };
      void postDriverLocation(ping).catch(() => undefined);
    };

    const onError = (error: GeolocationPositionError) => {
      if (cancelled) return;
      if (error.code === error.PERMISSION_DENIED) setStatus("denied");
      else if (error.code === error.POSITION_UNAVAILABLE) setStatus("unavailable");
      else setStatus("locating");
    };

    queueMicrotask(() => {
      if (!cancelled) setStatus("locating");
    });
    const watchId = navigator.geolocation.watchPosition(onPosition, onError, {
      enableHighAccuracy: true,
      timeout: 10_000,
      maximumAge: 2_000,
    });
    void requestWakeLock();

    const onVisibility = () => {
      if (document.visibilityState === "visible" && wakeLock?.released !== false) {
        void requestWakeLock();
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      cancelled = true;
      navigator.geolocation.clearWatch(watchId);
      document.removeEventListener("visibilitychange", onVisibility);
      void wakeLock?.release().catch(() => undefined);
    };
  }, [driverId, enabled]);

  return enabled && driverId ? status : "idle";
}
