import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { fetchActiveSeason } from "@/features/matches/api/active-season";
import { adminApi, isAdminSessionError, type AdminSeason } from "../api/admin-rounds";
import { ConfirmAction } from "./ConfirmAction";

export function ActiveSeasonControl({
  season,
  seasons,
  csrfToken,
  onSessionExpired,
}: {
  season: AdminSeason;
  seasons: AdminSeason[];
  csrfToken: string;
  onSessionExpired: () => void;
}) {
  const [activeCode, setActiveCode] = useState<string | null>();
  const [checking, setChecking] = useState(true);
  const [saving, setSaving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const pendingSave = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetchActiveSeason(controller.signal)
      .then(({ seasonCode }) => {
        if (!controller.signal.aborted) setActiveCode(seasonCode);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError("Nie udało się odczytać aktywnego sezonu.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false);
      });
    return () => controller.abort();
  }, [attempt]);

  async function activate() {
    if (checking || pendingSave.current || activeCode === season.code) return;
    pendingSave.current = true;
    setSaving(true);
    setError("");
    try {
      const result = await adminApi.setActiveSeason(csrfToken, season.code);
      if (result.seasonCode !== season.code) throw new Error("Unexpected active season");
      setActiveCode(result.seasonCode);
    } catch (failure) {
      if (isAdminSessionError(failure)) {
        onSessionExpired();
      } else {
        setError("Nie udało się potwierdzić zmiany aktywnego sezonu. Sprawdź obecne ustawienie.");
      }
    } finally {
      pendingSave.current = false;
      setSaving(false);
    }
  }

  function reload() {
    setChecking(true);
    setError("");
    setAttempt((value) => value + 1);
  }

  let activeName = "Nieznany";
  if (activeCode === null) activeName = "Nie ustawiono";
  if (activeCode) activeName = seasons.find(({ code }) => code === activeCode)?.name ?? activeCode;

  return (
    <section className="admin-active-season" aria-label="Aktywny sezon dla graczy">
      <p className="admin-active-season-selection" role="status">
        <span className="admin-muted">Aktywny sezon</span>
        <strong>{activeCode === undefined && checking ? "Sprawdzam…" : activeName}</strong>
      </p>
      <div className="admin-round-actions">
        <ConfirmAction
          label="Ustaw jako aktywny"
          title="Zmienić aktywny sezon?"
          description={`Po otwarciu aplikacji gracze zobaczą sezon „${season.name}”.`}
          busy={checking || saving || activeCode === season.code}
          onConfirm={() => void activate()}
        />
        {error && (
          <Button type="button" variant="outline" onClick={reload} disabled={checking || saving}>
            Sprawdź ustawienie
          </Button>
        )}
      </div>
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
