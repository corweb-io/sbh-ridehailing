"use client";

import { useEffect, useRef, useState } from "react";
import type { Place } from "@/lib/types";

type PlaceResult = Place & { placeId?: string };

type PlaceSearchProps = {
  label: string;
  placeholder: string;
  value: string;
  onChange: (value: string) => void;
  onSelect: (place: Place) => void;
  autoFocus?: boolean;
  hideLabel?: boolean;
  variant?: "field" | "inline";
};

export function PlaceSearch({
  label,
  placeholder,
  value,
  onChange,
  onSelect,
  autoFocus,
  hideLabel,
  variant = "field",
}: PlaceSearchProps) {
  const [results, setResults] = useState<PlaceResult[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [selectingId, setSelectingId] = useState<string | null>(null);
  const sessionToken = useRef<string | null>(null);

  useEffect(() => {
    const query = value.trim();
    const controller = new AbortController();
    const handle = window.setTimeout(async () => {
      if (!sessionToken.current) sessionToken.current = crypto.randomUUID();
      setLoading(true);
      try {
        const params = new URLSearchParams({ q: query });
        params.set("sessionToken", sessionToken.current);
        const response = await fetch(`/api/places?${params}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) throw new Error("Place search failed");
        const data = (await response.json()) as { places?: PlaceResult[] };
        setResults(data.places ?? []);
      } catch {
        if (!controller.signal.aborted) setResults([]);
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(handle);
    };
  }, [value]);

  async function selectResult(result: PlaceResult) {
    if (!result.placeId) {
      onSelect(result);
      setOpen(false);
      sessionToken.current = null;
      return;
    }

    setSelectingId(result.placeId);
    try {
      const params = new URLSearchParams({
        placeId: result.placeId,
      });
      if (sessionToken.current) {
        params.set("sessionToken", sessionToken.current);
      }
      const response = await fetch(`/api/places?${params}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Place details failed");
      const data = (await response.json()) as { place?: Place };
      if (!data.place) throw new Error("Missing place details");
      onSelect(data.place);
      setOpen(false);
      sessionToken.current = null;
    } finally {
      setSelectingId(null);
    }
  }

  function selectCustomLocation() {
    const custom = value.trim();
    if (!custom) return;
    onSelect({
      name: custom,
      address: custom,
      lat: null,
      lng: null,
      source: "custom",
      fareZone: null,
    });
    setOpen(false);
    sessionToken.current = null;
  }

  const showResults = open && results.length > 0;
  const showCustom = open && value.trim().length > 1;

  return (
    <label className="relative block">
      {hideLabel ? null : (
        <span className="text-ink-muted mb-2 block text-[11px] font-semibold uppercase tracking-[0.18em]">
          {label}
        </span>
      )}
      <div className="relative">
        {variant === "field" ? (
          <span className="text-ink-muted pointer-events-none absolute left-4 top-1/2 -translate-y-1/2">
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="none">
              <path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z" stroke="currentColor" strokeWidth="1.7" />
              <circle cx="12" cy="10" r="2.2" stroke="currentColor" strokeWidth="1.7" />
            </svg>
          </span>
        ) : null}
        <input
          autoFocus={autoFocus}
          value={value}
          onChange={(event) => {
            onChange(event.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => window.setTimeout(() => setOpen(false), 180)}
          placeholder={placeholder}
          autoComplete="off"
          role="combobox"
          aria-label={hideLabel ? label : undefined}
          aria-expanded={open}
          aria-controls={`${label}-results`}
          className={
            variant === "inline"
              ? "text-ink placeholder:text-ink-muted caret-sea h-9 w-full bg-transparent pr-9 text-[16px] font-semibold leading-none outline-none focus-visible:!outline-none placeholder:font-medium"
              : "border-line bg-raised text-ink placeholder:text-ink-muted focus:border-sea focus:ring-sea-soft rounded-control h-14 w-full border pl-12 pr-11 text-[16px] outline-none transition focus:ring-4"
          }
        />
        {value ? (
          <button
            type="button"
            aria-label={`Effacer ${label.toLowerCase()}`}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              onChange("");
              setOpen(true);
            }}
            className={
              variant === "inline"
                ? "text-ink-muted hover:bg-sunk hover:text-ink absolute right-0 top-1/2 flex h-8 w-8 -translate-y-1/2 items-center justify-center rounded-full transition"
                : "text-ink-muted hover:bg-sunk hover:text-ink absolute right-2 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-full transition"
            }
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
              <path d="m7 7 10 10M17 7 7 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        ) : null}
      </div>
      {showResults || showCustom ? (
        <ul
          id={`${label}-results`}
          role="listbox"
          className="popover absolute inset-x-0 z-40 mt-2 max-h-64 overflow-y-auto p-1.5"
        >
          {results.map((place) => (
            <li key={place.placeId ?? `${place.name}-${place.lat}-${place.lng}`}>
              <button
                type="button"
                disabled={selectingId === place.placeId}
                className="hover:bg-sunk rounded-control flex min-h-14 w-full items-center gap-3 px-3 py-2.5 text-left transition"
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => {
                  void selectResult(place);
                }}
              >
                <span className="bg-sunk text-ink-soft flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                  <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="none">
                    <path d="M12 21s6-5.1 6-11a6 6 0 1 0-12 0c0 5.9 6 11 6 11Z" stroke="currentColor" strokeWidth="1.7" />
                    <circle cx="12" cy="10" r="2" fill="currentColor" />
                  </svg>
                </span>
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">
                    {selectingId === place.placeId
                      ? "Confirmation…"
                      : place.name}
                  </span>
                  <span className="text-ink-muted mt-0.5 block truncate text-xs">{place.address}</span>
                </span>
              </button>
            </li>
          ))}
          {showCustom ? (
            <li className={results.length > 0 ? "border-line border-t pt-1" : ""}>
              <button
                type="button"
                className="hover:bg-sunk rounded-control flex min-h-12 w-full items-center gap-3 px-3 py-2 text-left text-sm transition"
                onMouseDown={(event) => event.preventDefault()}
                onClick={selectCustomLocation}
              >
                <span className="bg-sea-soft text-sea flex h-9 w-9 shrink-0 items-center justify-center rounded-full">
                  +
                </span>
                <span>
                  <span className="block font-semibold">
                    Utiliser « {value.trim()} »
                  </span>
                  <span className="text-ink-muted block text-xs">
                    Lieu personnalisé · quartier confirmé par le chauffeur
                  </span>
                </span>
              </button>
            </li>
          ) : null}
        </ul>
      ) : open && loading ? (
        <div className="popover text-ink-muted absolute inset-x-0 z-40 mt-2 px-4 py-3 text-sm">
          Recherche…
        </div>
      ) : null}
    </label>
  );
}
