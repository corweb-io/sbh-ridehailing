"use client";

import { useEffect, useState } from "react";
import { trackEvent } from "@/lib/session";

type InstallChoice = {
  outcome: "accepted" | "dismissed";
  platform: string;
};

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<InstallChoice>;
}

type SaveMode = "native" | "ios" | "bookmark";

function isIos() {
  return /iPad|iPhone|iPod/.test(navigator.userAgent);
}

function isStandalone() {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    ("standalone" in navigator &&
      (navigator as Navigator & { standalone?: boolean }).standalone === true)
  );
}

export function SaveRideButton() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [saveMode, setSaveMode] = useState<SaveMode>("bookmark");
  const [instructionsOpen, setInstructionsOpen] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    const initialize = () => {
      const standalone = isStandalone();
      setInstalled(standalone);
      setSaveMode(isIos() ? "ios" : "bookmark");

      if (
        standalone &&
        sessionStorage.getItem("sbh_pwa_open_tracked") !== "1"
      ) {
        sessionStorage.setItem("sbh_pwa_open_tracked", "1");
        void trackEvent("pwa_opened");
      }
    };

    const handleInstallAvailable = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
      setSaveMode("native");
    };

    const handleInstalled = () => {
      setInstalled(true);
      setInstructionsOpen(false);
      setInstallPrompt(null);
    };

    const frame = window.requestAnimationFrame(initialize);
    window.addEventListener("beforeinstallprompt", handleInstallAvailable);
    window.addEventListener("appinstalled", handleInstalled);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener(
        "beforeinstallprompt",
        handleInstallAvailable,
      );
      window.removeEventListener("appinstalled", handleInstalled);
    };
  }, []);

  if (installed) return null;

  async function handleSave() {
    void trackEvent("app_install_clicked", { meta: { mode: saveMode } });

    if (installPrompt) {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      void trackEvent(
        choice.outcome === "accepted"
          ? "pwa_install_accepted"
          : "pwa_install_dismissed",
        { meta: { platform: choice.platform } },
      );
      if (choice.outcome === "accepted") {
        setInstalled(true);
      }
      setInstallPrompt(null);
      return;
    }

    setInstructionsOpen(true);
    void trackEvent(
      saveMode === "ios"
        ? "ios_install_instructions_shown"
        : "bookmark_instructions_shown",
    );
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleSave()}
        className="border-sea/30 bg-sea-soft hover:border-sea/60 hover:bg-sea/15 rounded-card mt-3 flex min-h-16 w-full items-center gap-3 border px-4 text-left transition"
      >
        <span className="bg-sea text-shell flex h-10 w-10 shrink-0 items-center justify-center rounded-full">
          <SaveIcon />
        </span>
        <span className="min-w-0 flex-1">
          <span className="text-ink block text-sm font-bold">
            Installer l&apos;app RIDE
          </span>
          <span className="text-ink-soft mt-0.5 block text-xs">
            Ajoutez RIDE à votre écran d&apos;accueil
          </span>
        </span>
        <span aria-hidden="true" className="text-sea text-lg">
          →
        </span>
      </button>

      {instructionsOpen ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="save-ride-title"
          className="bg-ink/40 fixed inset-0 z-50 flex items-end justify-center p-3 backdrop-blur-sm sm:items-center sm:p-6"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setInstructionsOpen(false);
            }
          }}
        >
          <div className="popover w-full max-w-sm p-5 text-left sm:p-6">
            <div className="flex items-start justify-between gap-5">
              <div>
                <p className="text-sea text-[10px] font-semibold uppercase tracking-[0.2em]">
                  L&apos;app RIDE
                </p>
                <h2 id="save-ride-title" className="display mt-2 text-3xl">
                  Installez RIDE
                </h2>
              </div>
              <button
                type="button"
                aria-label="Fermer"
                onClick={() => setInstructionsOpen(false)}
                className="bg-sunk text-ink-soft flex h-10 w-10 shrink-0 items-center justify-center rounded-full"
              >
                <CloseIcon />
              </button>
            </div>

            {saveMode === "ios" ? (
              <ol className="text-ink-soft mt-6 space-y-4 text-sm leading-6">
                <Instruction number="1">
                  Touchez le bouton Partager dans Safari.
                </Instruction>
                <Instruction number="2">
                  Choisissez « Sur l’écran d’accueil ».
                </Instruction>
                <Instruction number="3">
                  Touchez « Ajouter ». L’app RIDE apparaîtra sur votre écran
                  d’accueil.
                </Instruction>
              </ol>
            ) : (
              <div className="card mt-6 p-4">
                <p className="text-ink-soft text-sm leading-6">
                  Ajoutez cette page aux favoris avec{" "}
                  <kbd className="bg-raised border-line text-ink rounded-chip border px-2 py-1 font-mono text-xs">
                    {navigator.platform.toLowerCase().includes("mac")
                      ? "⌘ D"
                      : "Ctrl D"}
                  </kbd>
                  . Votre navigateur ne permet pas l’installation directe.
                </p>
              </div>
            )}

            <button
              type="button"
              onClick={() => setInstructionsOpen(false)}
              className="primary-button mt-6 flex w-full items-center justify-center"
            >
              Compris
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

function Instruction({
  number,
  children,
}: {
  number: string;
  children: React.ReactNode;
}) {
  return (
    <li className="flex gap-3">
      <span className="bg-sea-soft text-sea flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold">
        {number}
      </span>
      <span>{children}</span>
    </li>
  );
}

function SaveIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
    >
      <path
        d="M12 4v10m0 0 4-4m-4 4-4-4M5 17v2h14v-2"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className="h-4 w-4"
      fill="none"
    >
      <path
        d="m7 7 10 10M17 7 7 17"
        stroke="currentColor"
        strokeWidth="1.8"
        strokeLinecap="round"
      />
    </svg>
  );
}
