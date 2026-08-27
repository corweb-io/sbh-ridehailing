import Link from "next/link";
import { LandingBeacon } from "@/components/LandingBeacon";
import { LandingMap } from "@/components/LandingMap";
import { SaveRideButton } from "@/components/SaveRideButton";

export default async function Home({ searchParams }: PageProps<"/">) {
  const params = await searchParams;
  const query = new URLSearchParams();
  const src =
    typeof params.src === "string"
      ? params.src
      : typeof params.utm_source === "string"
        ? params.utm_source
        : null;
  const internal = params.internal === "1";
  if (src) query.set("src", src);
  if (internal) query.set("internal", "1");
  const rideHref = query.size > 0 ? `/ride?${query.toString()}` : "/ride";

  return (
    <div className="bg-sand relative mx-auto min-h-dvh w-full max-w-[1920px] overflow-hidden">
      <LandingBeacon />
      <div className="absolute inset-x-0 top-0 h-[62%] overflow-hidden lg:inset-0 lg:h-full">
        <LandingMap />
      </div>
      <div className="from-sand/70 to-sand/40 pointer-events-none absolute inset-x-0 top-0 h-[62%] bg-linear-to-b via-transparent lg:inset-0 lg:h-full lg:bg-linear-to-r" />

      <header className="absolute inset-x-0 top-0 z-20 flex items-center justify-between px-6 pt-[max(1.5rem,env(safe-area-inset-top))] lg:px-10 lg:pt-8">
        <p className="text-ink text-sm font-bold tracking-[0.3em] lg:text-base">
          RIDE
        </p>
        <div className="map-pill flex items-center gap-2 px-3 py-2">
          <span className="bg-sea-bright h-1.5 w-1.5 rounded-full" />
          <p className="text-ink-soft text-[11px] font-medium">St. Barts</p>
        </div>
      </header>

      <main
        data-home-panel
        className="sheet lg:border-line absolute inset-x-0 bottom-0 z-10 flex min-h-[48%] flex-col rounded-t-[28px] px-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3 lg:inset-y-0 lg:left-auto lg:w-[min(34rem,44vw)] lg:justify-center lg:rounded-none lg:border-l lg:border-t-0 lg:px-12 lg:py-16"
      >
        <div className="mb-7 flex justify-center lg:hidden">
          <span className="sheet-handle" />
        </div>
        <div className="flex flex-1 flex-col lg:flex-none">
          <p className="text-sea text-[11px] font-semibold uppercase tracking-[0.22em]">
            Taxis agréés · Saint-Barth
          </p>
          <h1 className="display mt-3 max-w-[14ch] text-[3.1rem] leading-[0.96] sm:text-6xl lg:mt-5 lg:text-[4.5rem]">
            Déplacez-vous à Saint-Barth.
          </h1>
          <p className="text-ink-soft mt-4 max-w-[36ch] text-[15px] leading-6 lg:mt-6 lg:text-base lg:leading-7">
            Un taxi agréé, au tarif de la Collectivité. Passager, chauffeur, ou
            conciergerie d’un hôtel ou d’une agence.
          </p>

          <div className="mt-auto space-y-2 pt-7 lg:mt-10 lg:pt-0">
            <Link
              href={rideHref}
              className="primary-button relative flex w-full items-center justify-center"
            >
              App passager
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="absolute right-5 h-5 w-5"
                fill="none"
              >
                <path
                  d="M5 12h14M14 7l5 5-5 5"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </Link>
            <Link
              href="/driver"
              className="secondary-button relative flex w-full items-center justify-center"
            >
              App chauffeur
            </Link>
            <Link
              href="/concierge"
              className="secondary-button relative flex w-full items-center justify-center"
            >
              Conciergerie
            </Link>
            <SaveRideButton />
          </div>
        </div>
      </main>
    </div>
  );
}
