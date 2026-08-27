"use client";

import dynamic from "next/dynamic";
import { useEffect, useState } from "react";

const IslandMap = dynamic(
  () => import("./IslandMap").then((mod) => mod.IslandMap),
  { ssr: false },
);

export function LandingMap() {
  const [rightPadding, setRightPadding] = useState(0);

  useEffect(() => {
    const updatePadding = () => {
      const desktop = window.matchMedia("(min-width: 64rem)").matches;
      const panel = document.querySelector<HTMLElement>("[data-home-panel]");
      const width = desktop && panel ? Math.ceil(panel.getBoundingClientRect().width) : 0;
      setRightPadding((current) => (current === width ? current : width));
    };

    const frame = window.requestAnimationFrame(updatePadding);
    window.addEventListener("resize", updatePadding);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updatePadding);
    };
  }, []);

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      <IslandMap
        rightPadding={rightPadding}
        className="h-full w-full"
      />
    </div>
  );
}
