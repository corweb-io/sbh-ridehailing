"use client";

import Link from "next/link";
import type { ReactNode } from "react";

export function AppHeader({
  badge,
  onBack,
  backHref = "/",
  backLabel = "Retour",
}: {
  badge: string;
  onBack?: () => void;
  backHref?: string;
  backLabel?: string;
}) {
  const icon = (
    <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
      <path
        d="m15 18-6-6 6-6"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );

  return (
    <header className="relative z-20 flex items-center justify-between px-4 pt-[max(1rem,env(safe-area-inset-top))] lg:px-6 lg:pt-6">
      {onBack ? (
        <button
          type="button"
          aria-label={backLabel}
          onClick={onBack}
          className="map-pill text-ink hover:bg-shell flex h-11 w-11 items-center justify-center transition"
        >
          {icon}
        </button>
      ) : (
        <Link
          href={backHref}
          aria-label="Accueil"
          className="map-pill text-ink hover:bg-shell flex h-11 w-11 items-center justify-center transition"
        >
          {icon}
        </Link>
      )}
      <div className="map-pill px-3.5 py-2.5">
        <p className="text-ink text-[10px] font-bold tracking-[0.22em]">
          {badge}
        </p>
      </div>
    </header>
  );
}

export function PhoneButton({ href, label }: { href: string; label: string }) {
  return (
    <a
      href={href}
      className="bg-ink text-shell flex h-11 w-11 shrink-0 items-center justify-center rounded-full"
      aria-label={label}
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
        <path
          d="M7 3.8h3.2l1.2 3.1-2 1.2a12.5 12.5 0 0 0 6.5 6.5l1.2-2 3.1 1.2V17c0 1.2-1 2.2-2.2 2.2C9.8 19.2 4.8 14.2 4.8 8A2.2 2.2 0 0 1 7 3.8Z"
          stroke="currentColor"
          strokeWidth="1.7"
          strokeLinejoin="round"
        />
      </svg>
    </a>
  );
}

export function StatusChip({
  children,
  tone = "pending",
}: {
  children: ReactNode;
  tone?: "pending" | "muted" | "ok" | "warn";
}) {
  const tones = {
    pending: "border-sun/25 bg-sun-soft text-sun",
    muted: "border-line bg-sunk text-ink-muted",
    ok: "border-sea/25 bg-sea-soft text-sea",
    warn: "border-coral/25 bg-coral-soft text-coral",
  };
  return (
    <span
      className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-semibold uppercase tracking-[0.12em] ${tones[tone]}`}
    >
      {children}
    </span>
  );
}

export function statusTone(
  status:
    | "scheduled"
    | "requested"
    | "accepted"
    | "arrived"
    | "onboard"
    | "completed"
    | "cancelled",
) {
  if (status === "cancelled") return "warn" as const;
  if (status === "completed") return "muted" as const;
  if (status === "onboard" || status === "arrived") return "ok" as const;
  if (status === "scheduled") return "muted" as const;
  return "pending" as const;
}

export function ScreenLoading() {
  return (
    <div className="bg-sand text-ink-muted flex min-h-dvh items-center justify-center text-sm">
      Chargement…
    </div>
  );
}
