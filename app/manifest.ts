import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "RIDE · St. Barts",
    short_name: "RIDE",
    description: "Demandez un taxi agréé à Saint-Barthélemy, au tarif de la Collectivité.",
    start_url: "/ride?src=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait-primary",
    background_color: "#f2ece1",
    theme_color: "#f2ece1",
    categories: ["travel", "navigation"],
    icons: [
      {
        src: "/icons/ride-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/ride-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/ride-maskable-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/icons/ride-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
    shortcuts: [
      {
        name: "Demander un taxi",
        short_name: "Passager",
        url: "/ride?src=pwa-shortcut",
        icons: [
          {
            src: "/icons/ride-192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
      {
        name: "App chauffeur",
        short_name: "Chauffeur",
        url: "/driver?src=pwa-shortcut",
        icons: [
          {
            src: "/icons/ride-192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
      {
        name: "Conciergerie",
        short_name: "Concierge",
        url: "/concierge?src=pwa-shortcut",
        icons: [
          {
            src: "/icons/ride-192.png",
            sizes: "192x192",
            type: "image/png",
          },
        ],
      },
    ],
  };
}
