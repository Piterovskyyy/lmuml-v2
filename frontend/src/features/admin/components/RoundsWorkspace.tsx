import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AdminApiError,
  adminApi,
  isAdminSessionError,
  type AdminSeason,
  type RoundWorkspace,
  type SaveDraft,
} from "../api/admin-rounds";
import { ActiveSeasonControl } from "./ActiveSeasonControl";
import { RoundBuilder } from "./RoundBuilder";
import { SavedRounds, type RoundAction } from "./SavedRounds";
import { SeasonSyncStatusPanel } from "./SeasonSyncStatusPanel";

export function RoundsWorkspace({
  csrfToken,
  onSessionExpired,
}: {
  csrfToken: string;
  onSessionExpired: () => void;
}) {
  const [seasons, setSeasons] = useState<AdminSeason[] | null>(null);
  const [seasonCode, setSeasonCode] = useState("");
  const [data, setData] = useState<RoundWorkspace | null>(null);
  const [reload, setReload] = useState(0);
  const [seasonReload, setSeasonReload] = useState(0);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [refreshRequired, setRefreshRequired] = useState(false);
  const pendingWrite = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    void adminApi
      .seasons(controller.signal)
      .then((available) => {
        if (controller.signal.aborted) return;
        const requestedSeason = new URLSearchParams(location.search).get("season");
        const initial = available.find((season) => season.code === requestedSeason) ?? available[0];
        setSeasons(available);
        setSeasonCode(initial?.code ?? "");
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isAdminSessionError(error)) onSessionExpired();
        else setError("Nie udało się wczytać sezonów. Spróbuj ponownie.");
      });
    return () => controller.abort();
  }, [onSessionExpired, seasonReload]);

  useEffect(() => {
    if (!seasonCode) return;
    const controller = new AbortController();
    void adminApi
      .rounds(seasonCode, controller.signal)
      .then((workspace) => {
        if (!controller.signal.aborted) setData(workspace);
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isAdminSessionError(error)) onSessionExpired();
        else setError("Nie udało się wczytać bloków i kolejek. Spróbuj ponownie.");
      });
    return () => controller.abort();
  }, [onSessionExpired, reload, seasonCode]);

  function reloadWorkspace() {
    setData(null);
    setError("");
    setRefreshRequired(false);
    setReload((value) => value + 1);
  }

  async function run(operation: () => Promise<Response>, success: string) {
    if (pendingWrite.current) return;
    pendingWrite.current = true;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await operation();
      setMessage(success);
      reloadWorkspace();
    } catch (error) {
      if (isAdminSessionError(error)) onSessionExpired();
      else if (error instanceof AdminApiError && [404, 409].includes(error.status)) {
        setRefreshRequired(true);
        setError(
          "Dane rundy się zmieniły albo blok jest już zajęty. Odśwież widok przed kolejną próbą.",
        );
      } else if (error instanceof AdminApiError && error.status === 400) {
        setError("Sprawdź numer rundy i wybrane bloki.");
      } else {
        setRefreshRequired(true);
        setError("Nie udało się potwierdzić operacji. Odśwież widok i sprawdź zapisane rundy.");
      }
    } finally {
      pendingWrite.current = false;
      setBusy(false);
    }
  }

  function save(draft: SaveDraft) {
    void run(() => adminApi.save(csrfToken, draft), "Szkic został zapisany.");
  }

  function changeRound(action: RoundAction) {
    switch (action.kind) {
      case "publish":
        void run(() => adminApi.publish(csrfToken, action.id), "Runda została opublikowana.");
        break;
      case "discard":
        void run(() => adminApi.discard(csrfToken, action.id), "Szkic został usunięty.");
        break;
      case "attachFinal":
        void run(
          () => adminApi.attachFinal(csrfToken, action.id, action.matchId),
          "Finał został dodany.",
        );
        break;
    }
  }

  if (!seasons) {
    return error ? (
      <div>
        <p role="alert" className="admin-error">
          {error}
        </p>
        <Button
          type="button"
          variant="outline"
          onClick={() => {
            setError("");
            setSeasonReload((value) => value + 1);
          }}
        >
          Spróbuj ponownie
        </Button>
      </div>
    ) : (
      <p role="status">Wczytuję sezony…</p>
    );
  }

  if (seasons.length === 0) return <p>Brak sezonów w katalogu.</p>;

  const selectedSeason = seasons.find((season) => season.code === seasonCode);

  return (
    <>
      <p className="admin-muted">Twórz rundy typowania z całych bloków meczowych.</p>
      <div className="admin-season-controls">
        <label className="admin-field">
          Sezon
          <select
            value={seasonCode}
            disabled={busy}
            onChange={(event) => {
              setData(null);
              setError("");
              setMessage("");
              setRefreshRequired(false);
              setSeasonCode(event.target.value);
            }}
          >
            {seasons.map((season) => (
              <option key={season.code} value={season.code}>
                {season.name}
              </option>
            ))}
          </select>
        </label>
        <Button type="button" variant="outline" disabled={busy} onClick={reloadWorkspace}>
          <RefreshCw aria-hidden="true" /> Odśwież dane
        </Button>
      </div>
      {selectedSeason && (
        <>
          <ActiveSeasonControl
            season={selectedSeason}
            seasons={seasons}
            csrfToken={csrfToken}
            onSessionExpired={onSessionExpired}
          />
          <SeasonSyncStatusPanel
            key={seasonCode}
            seasonCode={seasonCode}
            onSessionExpired={onSessionExpired}
          />
        </>
      )}
      {message && (
        <p className="admin-success" role="status">
          {message}
        </p>
      )}
      {error && (
        <p className="admin-error" role="alert">
          {error}
        </p>
      )}
      {data ? (
        <div className="admin-workspace">
          <RoundBuilder workspace={data} busy={busy || refreshRequired} onSave={save} />
          <SavedRounds workspace={data} busy={busy || refreshRequired} onAction={changeRound} />
        </div>
      ) : (
        !error && <p role="status">Wczytuję bloki meczowe…</p>
      )}
    </>
  );
}
