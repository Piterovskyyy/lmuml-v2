import { useCallback, useEffect, useState, type FormEvent } from "react";
import { LockKeyhole, LogOut } from "lucide-react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { AdminApiError, adminApi, type AdminSession } from "../api/admin-rounds";
import { RoundsWorkspace } from "./RoundsWorkspace";
import "../admin.css";

export default function AdminPage() {
  const [session, setSession] = useState<AdminSession | null>(null);
  const [sessionError, setSessionError] = useState("");
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState(false);

  const loadSession = useCallback(async (signal?: AbortSignal) => {
    setSessionError("");
    setLoading(true);
    try {
      setSession(await adminApi.session(signal));
    } catch (error) {
      if (signal?.aborted) return;
      setSession(null);
      setSessionError(
        error instanceof AdminApiError && error.status === 404
          ? "Panel administratora jest wyłączony w tym środowisku."
          : "Nie udało się sprawdzić sesji. Spróbuj ponownie.",
      );
    } finally {
      if (!signal?.aborted) setLoading(false);
    }
  }, []);

  const refreshSession = useCallback(() => void loadSession(), [loadSession]);

  useEffect(() => {
    document.title = "Panel administratora · LMuML";
    const controller = new AbortController();
    void loadSession(controller.signal);
    return () => controller.abort();
  }, [loadSession]);

  async function changeSession(operation: () => Promise<Response>, failureMessage: string) {
    setWorking(true);
    setSessionError("");
    try {
      await operation();
      await loadSession();
    } catch (error) {
      if (error instanceof AdminApiError && error.status === 403) {
        await loadSession();
        setSessionError("Sesja wygasła. Spróbuj ponownie.");
      } else {
        setSessionError(failureMessage);
      }
    } finally {
      setWorking(false);
    }
  }

  function login(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || working) return;
    const form = event.currentTarget;
    const password = new FormData(form).get("password");
    if (typeof password !== "string" || !password) return;
    form.reset();
    void changeSession(
      () => adminApi.login(session.csrfToken, password),
      "Logowanie nie powiodło się. Sprawdź hasło i spróbuj ponownie.",
    );
  }

  return (
    <main className="page-container admin-page" aria-labelledby="admin-title">
      <header className="admin-header">
        <a className="brand" href="/" aria-label="LMuML — wróć do aplikacji">
          <BrandMark />
          <span>LMuML</span>
        </a>
        {session?.authenticated && (
          <Button
            type="button"
            variant="outline"
            disabled={working}
            onClick={() =>
              void changeSession(
                () => adminApi.logout(session.csrfToken),
                "Nie udało się wylogować. Spróbuj ponownie.",
              )
            }
          >
            <LogOut aria-hidden="true" /> Wyloguj się
          </Button>
        )}
      </header>
      <p className="admin-kicker">
        <LockKeyhole size={16} aria-hidden="true" /> Administracja
      </p>
      <h1 id="admin-title">Panel administratora</h1>
      {sessionError && (
        <p className="admin-error" role="alert">
          {sessionError}
        </p>
      )}
      {loading ? (
        <p role="status">Sprawdzam dostęp do panelu…</p>
      ) : session?.authenticated ? (
        <RoundsWorkspace csrfToken={session.csrfToken} onSessionExpired={refreshSession} />
      ) : session ? (
        <form className="admin-panel admin-login" onSubmit={login}>
          <h2>Zaloguj się do panelu</h2>
          <label className="admin-field">
            Nazwa użytkownika
            <Input name="username" autoComplete="username" value="admin" readOnly />
          </label>
          <label className="admin-field">
            Hasło administratora
            <Input name="password" type="password" autoComplete="current-password" required />
          </label>
          <Button type="submit" disabled={working}>
            {working ? "Logowanie…" : "Zaloguj się"}
          </Button>
        </form>
      ) : (
        <Button type="button" variant="outline" onClick={() => void loadSession()}>
          Sprawdź ponownie
        </Button>
      )}
    </main>
  );
}
