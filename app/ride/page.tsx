import type { Metadata } from "next";
import { Suspense } from "react";
import { RideApp } from "@/components/RideApp";

export const metadata: Metadata = {
  title: "RIDE · Passager",
  description: "Demandez un taxi agréé à Saint-Barthélemy, au tarif officiel.",
};

export default function RidePage() {
  return (
    <Suspense
      fallback={
        <div className="text-ink-muted flex min-h-dvh items-center justify-center text-sm">
          Chargement…
        </div>
      }
    >
      <RideApp />
    </Suspense>
  );
}
