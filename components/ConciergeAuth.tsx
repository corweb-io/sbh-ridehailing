"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { ScreenLoading } from "@/components/AppChrome";
import { ConciergeApp } from "@/components/ConciergeApp";
import { StaffSignIn } from "@/components/StaffSignIn";
import { orgById } from "@/lib/hotels";
import {
  getConciergeSessionId,
  signInConcierge,
  signInConciergeOrg,
} from "@/lib/staff-auth";
import { useHydrated } from "@/lib/use-mock-store";

export function ConciergeHome() {
  const hydrated = useHydrated();
  const router = useRouter();
  const sessionId = hydrated ? getConciergeSessionId() : null;

  useEffect(() => {
    if (sessionId) router.replace(`/concierge/${sessionId}`);
  }, [router, sessionId]);

  if (hydrated && sessionId) return <ScreenLoading />;

  return (
    <StaffSignIn
      badge="RIDE · CONCIERGERIE"
      title="Connexion conciergerie"
      subtitle="Chaque hôtel et agence a son propre tableau. Eden Rock ne voit pas les courses de John Taylor, et inversement."
      identifierLabel="Hôtel ou agence"
      identifierPlaceholder="Eden Rock, John Taylor…"
      submitLabel="Se connecter"
      onSubmit={(identifier, code) => {
        const result = signInConcierge(identifier, code);
        if (!result.ok) return result.error;
        router.replace(`/concierge/${result.id}`);
        return null;
      }}
    />
  );
}

export function ConciergeOrgGate({ orgId }: { orgId: string }) {
  const hydrated = useHydrated();
  const router = useRouter();
  const org = orgById(orgId);
  const [signedInId, setSignedInId] = useState<string | null>(null);
  const sessionId =
    signedInId ?? (hydrated ? getConciergeSessionId() : null);

  useEffect(() => {
    if (sessionId && sessionId !== orgId) {
      router.replace(`/concierge/${sessionId}`);
    }
  }, [orgId, router, sessionId]);

  if (hydrated && sessionId && sessionId !== orgId) return <ScreenLoading />;
  if (hydrated && sessionId === orgId) return <ConciergeApp orgId={orgId} />;

  return (
    <StaffSignIn
      badge="RIDE · CONCIERGERIE"
      title={org?.name ?? "Conciergerie"}
      subtitle={`Tableau ${org?.name ?? "conciergerie"}. Entrez le code d’accès de l’établissement.`}
      identifierLocked
      identifierValue={org?.name}
      submitLabel="Accéder au tableau"
      onSubmit={(_identifier, code) => {
        const result = signInConciergeOrg(orgId, code);
        if (!result.ok) return result.error;
        setSignedInId(result.id);
        return null;
      }}
    />
  );
}
