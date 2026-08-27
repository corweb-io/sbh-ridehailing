"use client";

import { useEffect, useState } from "react";
import { formatWait } from "@/lib/format";
import {
  dispatchRemainingMs,
  searchRemainingMs,
  type MockTrip,
} from "@/lib/mock-store";
import {
  callHref,
  taxiContacts,
  whatsappHref,
} from "@/lib/taxis";

export function DispatchWait({
  onlineCount,
  trip,
}: {
  onlineCount: number;
  trip: MockTrip;
}) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);
  const searchMs = searchRemainingMs(trip, now);
  const dispatchMs = dispatchRemainingMs(trip, now);
  const taxis =
    onlineCount === 0
      ? "Aucun taxi en ligne"
      : `${onlineCount} taxi${onlineCount > 1 ? "s" : ""} disponible${onlineCount > 1 ? "s" : ""}`;

  if (searchMs != null) {
    return (
      <p className="text-ink-muted text-xs leading-5">
        {taxis}. Offre envoyée au taxi éligible le plus proche, réponse sous{" "}
        {formatWait(searchMs)}.
      </p>
    );
  }
  if (dispatchMs != null) {
    return (
      <p className="text-ink-muted text-xs leading-5">
        Le taxi éligible le plus proche peut la réserver. Nouvelle recherche
        dans {formatWait(dispatchMs)} (15 min avant le départ).
      </p>
    );
  }
  return null;
}

export function DispatchFallback({
  message,
  timedOut,
}: {
  message: string;
  timedOut: boolean;
}) {
  return (
    <div className="border-sea/20 bg-sea-soft rounded-card border p-4">
      <p className="text-sm font-semibold">
        {timedOut ? "Contacter un taxi autrement" : "Alternative de dispatch"}
      </p>
      <p className="text-ink-muted mt-1 text-xs leading-5">
        {timedOut
          ? "Aucun chauffeur n’a accepté. Transmettez la course par WhatsApp ou appelez une station."
          : "Si la demande reste sans réponse, transmettez-la directement."}
      </p>
      <div className="mt-3 grid gap-2">
        {taxiContacts().map((contact) => {
          const isWhatsApp = contact.kind === "concierge";
          return (
            <a
              key={contact.id}
              href={
                isWhatsApp
                  ? whatsappHref(contact.phone, message)
                  : callHref(contact.phone)
              }
              target={isWhatsApp ? "_blank" : undefined}
              rel={isWhatsApp ? "noreferrer" : undefined}
              className="border-line bg-raised rounded-control flex min-h-11 items-center justify-between border px-3 text-sm font-semibold"
            >
              <span>{contact.name}</span>
              <span className="text-sea text-xs">
                {isWhatsApp ? "Envoyer" : "Appeler"}
              </span>
            </a>
          );
        })}
      </div>
    </div>
  );
}
