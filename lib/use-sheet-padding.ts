"use client";

import { useEffect, useState } from "react";

export function useSheetMapPadding(revision: string | number) {
  const [bottomPadding, setBottomPadding] = useState(0);
  const [leftPadding, setLeftPadding] = useState(0);
  const [sheet, setSheet] = useState<HTMLElement | null>(null);

  useEffect(() => {
    if (!sheet) return;

    const updatePadding = () => {
      const bounds = sheet.getBoundingClientRect();
      const desktop = window.matchMedia("(min-width: 64rem)").matches;
      const bottom = desktop ? 0 : Math.ceil(bounds.height);
      const left = desktop ? Math.ceil(bounds.width) : 0;
      setBottomPadding((current) => (current === bottom ? current : bottom));
      setLeftPadding((current) => (current === left ? current : left));
    };
    const frame = window.requestAnimationFrame(updatePadding);
    const observer = new ResizeObserver(updatePadding);
    observer.observe(sheet);
    window.addEventListener("resize", updatePadding);

    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("resize", updatePadding);
    };
  }, [revision, sheet]);

  return {
    bottomPadding,
    leftPadding,
    sheetRef: setSheet,
  };
}
