"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";

export const ADMIN_KEY_STORAGE = "ride-admin-key";

type AdminSession = {
  key: string;
  lock: () => void;
};

const AdminSessionContext = createContext<AdminSession | null>(null);

export function useAdminSession() {
  const session = useContext(AdminSessionContext);
  if (!session) {
    throw new Error("useAdminSession must be used within AdminGate");
  }
  return session;
}

export function AdminGate({ children }: { children: React.ReactNode }) {
  const [key, setKey] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const lock = useCallback(() => {
    sessionStorage.removeItem(ADMIN_KEY_STORAGE);
    setUnlocked(false);
    setKey("");
  }, []);

  const unlock = useCallback(async (candidate: string) => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/session", {
        headers: { "x-admin-key": candidate },
      });
      if (!response.ok) {
        sessionStorage.removeItem(ADMIN_KEY_STORAGE);
        setUnlocked(false);
        setError(
          response.status === 401
            ? "Mot de passe incorrect."
            : "Service indisponible. Réessayez.",
        );
        return false;
      }
      sessionStorage.setItem(ADMIN_KEY_STORAGE, candidate);
      setKey(candidate);
      setUnlocked(true);
      return true;
    } finally {
      setLoading(false);
      setReady(true);
    }
  }, []);

  useEffect(() => {
    const stored = sessionStorage.getItem(ADMIN_KEY_STORAGE);
    if (!stored) {
      setReady(true);
      return;
    }
    void unlock(stored);
  }, [unlock]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    await unlock(key);
  }

  if (!ready) {
    return <div className="bg-sand min-h-dvh" />;
  }

  if (!unlocked) {
    return (
      <div className="bg-sand text-ink flex min-h-dvh items-center justify-center px-4">
        <form
          className="border-line bg-raised shadow-raised rounded-card w-full max-w-md border p-5"
          onSubmit={(event) => void submit(event)}
        >
          <p className="text-ink-muted text-[10px] font-semibold tracking-[0.2em] uppercase">
            Administration
          </p>
          <h1 className="display mt-1 text-3xl">RIDE</h1>
          <p className="text-ink-muted mt-2 text-sm">
            Un mot de passe ouvre toutes les vues admin.
          </p>
          <label className="mt-5 block text-sm font-medium">
            Mot de passe
            <input
              type="password"
              autoComplete="current-password"
              value={key}
              onChange={(event) => setKey(event.target.value)}
              className="field mt-2 h-11 w-full"
              disabled={loading}
            />
          </label>
          <button
            type="submit"
            className="bg-ink text-shell rounded-control mt-3 h-11 w-full text-sm font-semibold"
            disabled={loading || !key}
          >
            {loading ? "Vérification…" : "Entrer"}
          </button>
          {error ? <p className="text-coral mt-3 text-sm">{error}</p> : null}
        </form>
      </div>
    );
  }

  return (
    <AdminSessionContext.Provider value={{ key, lock }}>
      {children}
    </AdminSessionContext.Provider>
  );
}
