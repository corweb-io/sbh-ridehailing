import type { Metadata } from "next";
import { DriverApp } from "@/components/DriverApp";

export const metadata: Metadata = {
  title: "RIDE · Chauffeur",
  description: "App chauffeur — taxis agréés à Saint-Barthélemy.",
};

export default function DriverPage() {
  return <DriverApp />;
}
