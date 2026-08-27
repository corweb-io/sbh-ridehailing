"use client";

import { useEffect } from "react";
import { markInternalSession, trackEvent } from "@/lib/session";

export function LandingBeacon() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("internal") === "1") {
      markInternalSession();
    }
    if (sessionStorage.getItem("sbh_landing_viewed")) return;
    sessionStorage.setItem("sbh_landing_viewed", "1");
    void trackEvent("landing_view");
  }, []);

  return null;
}
