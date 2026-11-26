import { useEffect, useId, useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DISPLAY_TIME_ZONE } from "@/features/matches/model/match-presentation";
import {
  adminApi,
  isAdminSessionError,
  SyncAttemptOutcome,
  type SeasonSyncStatus,
} from "../api/admin-rounds";

const dateTime = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: DISPLAY_TIME_ZONE,
});

type LoadState = { status: "loading" | "error" } | { status: "ready"; data: SeasonSyncStatus };

function SyncTime({ instant }: { instant: string }) {
  return <time dateTime={instant}>{dateTime.format(new Date(instant))}</time>;
}

function SyncFacts({ lastSuccessfulAt, lastAttempt }: SeasonSyncStatus) {
  const failed = lastAttempt?.outcome === SyncAttemptOutcome.Failed;
  return (
    <dl className="admin-sync-facts">
      <div>
        <dt className="admin-muted">Ostatnie udane pobranie wyników</dt>
        <dd>
          {lastSuccessfulAt ? <SyncTime instant={lastSuccessfulAt} /> : "Brak danych o pobraniu"}
        </dd>
      </div>
      <div>
        <dt className="admin-muted">Ostatnia zakończona próba automatyczna</dt>
        <dd>
          {lastAttempt ? (
            <>
              <strong className="admin-sync-outcome" data-outcome={lastAttempt.outcome}>
                {failed ? "Nieudana" : "Udana"}
              </strong>
              <span className="admin-muted">
                Start · <SyncTime instant={lastAttempt.startedAt} />
              </span>
              <span className="admin-muted">
                Koniec · <SyncTime instant={lastAttempt.finishedAt} />
              </span>
            </>
          ) : (
            "Brak zapisanej próby"
          )}
        </dd>
      </div>
    </dl>
  );
}

export function SeasonSyncStatusPanel({
  seasonCode,
  onSessionExpired,
}: {
  seasonCode: string;
  onSessionExpired: () => void;
}) {
  const headingId = useId();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    void adminApi
      .seasonSyncStatus(seasonCode, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: "ready", data });
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        if (isAdminSessionError(error)) onSessionExpired();
        else setState({ status: "error" });
      });
    return () => controller.abort();
  }, [onSessionExpired, reload, seasonCode]);

  function refresh() {
    setState({ status: "loading" });
    setReload((value) => value + 1);
  }

  return (
    <section className="admin-panel admin-sync" aria-labelledby={headingId}>
      <div className="admin-sync-heading">
        <h2 id={headingId}>Synchronizacja wyników</h2>
        <Button
          type="button"
          variant="outline"
          disabled={state.status === "loading"}
          onClick={refresh}
        >
          <RefreshCw aria-hidden="true" /> Odśwież status
        </Button>
      </div>
      <div aria-live="polite" aria-atomic="true">
        {state.status === "loading" && (
          <p className="admin-muted">Sprawdzam status synchronizacji…</p>
        )}
        {state.status === "ready" && <SyncFacts {...state.data} />}
      </div>
      {state.status === "error" && (
        <p className="admin-error" role="alert">
          Nie udało się wczytać statusu synchronizacji. Spróbuj ponownie.
        </p>
      )}
    </section>
  );
}
