import type { Metadata, Viewport } from "next";
import { Geist, Instrument_Serif } from "next/font/google";
import { PwaBeacon } from "@/components/PwaBeacon";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const displaySerif = Instrument_Serif({
  variable: "--font-display",
  subsets: ["latin"],
  weight: "400",
});

export const metadata: Metadata = {
  title: "RIDE · St. Barts",
  description: "Taxis agréés à Saint-Barthélemy, au tarif officiel de la Collectivité.",
  applicationName: "RIDE",
  icons: {
    icon: "/icons/ride-192.png",
    apple: "/icons/ride-apple.png",
  },
  appleWebApp: {
    capable: true,
    title: "RIDE",
    statusBarStyle: "default",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f2ece1",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="fr"
      className={`${geistSans.variable} ${displaySerif.variable} ${geistSans.className} h-full antialiased`}
    >
      <body className="bg-sand text-ink min-h-full font-sans">
        <PwaBeacon />
        {children}
      </body>
    </html>
  );
}
