"use client";

import { useState, type FormEvent } from "react";
import { AppHeader } from "@/components/AppChrome";

export function StaffSignIn({
  badge,
  title,
  subtitle,
  identifierLabel,
  identifierPlaceholder,
  identifierValue,
  identifierLocked = false,
  submitLabel,
  onSubmit,
}: {
  badge: string;
  title: string;
  subtitle: string;
  identifierLabel?: string;
  identifierPlaceholder?: string;
  identifierValue?: string;
  identifierLocked?: boolean;
  submitLabel: string;
  onSubmit: (
    identifier: string,
    code: string,
  ) => string | null | Promise<string | null>;
}) {
  const [identifier, setIdentifier] = useState(identifierValue ?? "");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setSubmitting(true);
    try {
      const nextError = await onSubmit(
        identifierLocked ? (identifierValue ?? identifier) : identifier,
        code,
      );
      setError(nextError);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="bg-sand relative mx-auto flex h-dvh w-full max-w-[1920px] flex-col overflow-hidden">
      <AppHeader badge={badge} />
      <div className="relative z-10 mx-auto flex w-full max-w-md flex-1 flex-col overflow-y-auto px-5 pb-6">
        <p className="text-sea text-[11px] font-semibold uppercase tracking-[0.2em]">
          Connexion
        </p>
        <h1 className="display mt-2 text-4xl">{title}</h1>
        <p className="text-ink-muted mt-3 text-sm leading-6">{subtitle}</p>

        <form className="mt-6 space-y-3" method="dialog" onSubmit={handleSubmit}>
          {identifierLocked ? null : (
            <label className="block">
              <span className="text-ink-muted mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em]">
                {identifierLabel}
              </span>
              <input
                type="text"
                name="username"
                autoComplete="username"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                value={identifier}
                onChange={(event) => {
                  setIdentifier(event.target.value);
                  setError(null);
                }}
                placeholder={identifierPlaceholder}
                className="field h-12"
              />
            </label>
          )}
          <label className="block">
            <span className="text-ink-muted mb-1.5 block text-[10px] font-semibold uppercase tracking-[0.14em]">
              Code d’accès
            </span>
            <input
              type="password"
              name="password"
              autoComplete="current-password"
              value={code}
              onChange={(event) => {
                setCode(event.target.value);
                setError(null);
              }}
              placeholder="Code"
              className="field h-12"
            />
          </label>
          {error ? (
            <p className="text-coral text-sm" role="alert">
              {error}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={submitting}
            className="primary-button mt-2 flex w-full items-center justify-center"
          >
            {submitting ? "Connexion…" : submitLabel}
          </button>
        </form>
      </div>
    </div>
  );
}
