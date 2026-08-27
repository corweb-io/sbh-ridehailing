"use client";

import { useEffect } from "react";
import { trackEvent } from "@/lib/session";

export function PwaBeacon() {
  useEffect(() => {
    const standalone =
      window.matchMedia("(display-mode: standalone)").matches ||
      ("standalone" in navigator &&
        (navigator as Navigator & { standalone?: boolean }).standalone ===
          true);

    if (
      standalone &&
      sessionStorage.getItem("sbh_pwa_open_tracked") !== "1"
    ) {
      sessionStorage.setItem("sbh_pwa_open_tracked", "1");
      void trackEvent("pwa_opened");
    }
  }, []);

  return null;
}
