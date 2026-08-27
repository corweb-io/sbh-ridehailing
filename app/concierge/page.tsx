import type { Metadata } from "next";
import { ConciergeHome } from "@/components/ConciergeAuth";

export const metadata: Metadata = {
  title: "RIDE · Conciergerie",
  description:
    "Connexion conciergerie — chaque hôtel ou agence a son propre tableau.",
};

export default function ConciergePage() {
  return <ConciergeHome />;
}
