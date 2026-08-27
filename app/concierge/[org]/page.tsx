import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ConciergeOrgGate } from "@/components/ConciergeAuth";
import { CONCIERGE_ORGS, orgById } from "@/lib/hotels";

export const dynamicParams = false;

export function generateStaticParams() {
  return CONCIERGE_ORGS.map((org) => ({ org: org.id }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ org: string }>;
}): Promise<Metadata> {
  const { org: orgId } = await params;
  const org = orgById(orgId);
  if (!org) return { title: "RIDE · Conciergerie" };
  return {
    title: `RIDE · ${org.name}`,
    description: `Tableau ${org.name} — commander des taxis agréés pour vos clients à Saint-Barthélemy.`,
  };
}

export default async function ConciergeOrgPage({
  params,
}: {
  params: Promise<{ org: string }>;
}) {
  const { org: orgId } = await params;
  const org = orgById(orgId);
  if (!org) notFound();
  return <ConciergeOrgGate orgId={org.id} />;
}

