import { useId, useState } from "react";
import { Clock, ListOrdered, RefreshCw, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { usePredictionSession } from "../api/use-prediction-session";
import { usePublishedRounds } from "../api/use-published-rounds";
import { PlayerRoundPredictions } from "./PlayerRoundPredictions";
import { PublishedRoundMatches } from "./PublishedRoundMatches";
import "../published-rounds.css";

export function PublishedPredictionsPage({
  seasonCode,
  active = true,
}: {
  seasonCode: string;
  active?: boolean;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const roundSelectId = useId();
  const { data, loading, failed, seasonMissing, reload } = usePublishedRounds(seasonCode);
  const rounds = data ? [...data.rounds].sort((a, b) => b.number - a.number) : [];
  const round = rounds.find(({ id }) => id === selectedId) ?? rounds[0];
  const { state: sessionState, player, refresh } = usePredictionSession(active && Boolean(round));
  const canShowPredictions = active && sessionState.status === "ready" && Boolean(player);

  return (
    <main
      tabIndex={-1}
      className="page-container published-rounds"
      aria-labelledby="published-rounds-title"
    >
      <header className="published-heading">
        <div>
          <div className="section-kicker">
            <span className="line-accent" /> {data?.competition.name ?? "Rundy typowania"}
          </div>
          <h1 id="published-rounds-title">
            Moje <span>typy</span>
          </h1>
          <p>Typuj wyniki meczów z opublikowanych rund.</p>
        </div>
        {data && <p className="published-season">{data.season.name}</p>}
      </header>

      {loading && !data && (
        <p className="published-message" role="status">
          Wczytuję rundy…
        </p>
      )}
      {failed && (
        <div className="published-message">
          <p role="alert">
            {seasonMissing
              ? "Nie znaleziono tego sezonu."
              : data
                ? "Nie udało się odświeżyć danych. Pokazujemy ostatnio pobrane rundy."
                : "Nie udało się pobrać rund. Spróbuj ponownie."}
          </p>
          {!data && (
            <Button type="button" variant="outline" onClick={reload}>
              Spróbuj ponownie
            </Button>
          )}
        </div>
      )}

      {data && (
        <section aria-labelledby="published-current-heading">
          <div className="published-controls">
            {round && (
              <div>
                <label htmlFor={roundSelectId}>Wybierz rundę</label>
                <select
                  id={roundSelectId}
                  value={round.id}
                  onChange={(event) => setSelectedId(event.target.value)}
                >
                  {rounds.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <Button type="button" variant="outline" disabled={loading} onClick={reload}>
              <RefreshCw aria-hidden="true" /> {loading ? "Odświeżam…" : "Odśwież"}
            </Button>
          </div>
          {round ? (
            <>
              <h2 id="published-current-heading" className="published-round-title">
                {round.name}
              </h2>
              {round.awaitingFinal && (
                <p className="published-message published-final">
                  <Clock size={18} aria-hidden="true" />
                  Mecz finałowy pojawi się w tej rundzie, gdy administrator potwierdzi spotkanie.
                </p>
              )}
              {!canShowPredictions && (
                <>
                  {sessionState.status === "ready" && (
                    <div className="published-sign-in">
                      <p>Zaloguj się, aby zapisywać i zmieniać swoje typy.</p>
                      <Button asChild>
                        <a href="#konto">
                          <UserRound aria-hidden="true" /> Zaloguj się
                        </a>
                      </Button>
                    </div>
                  )}
                  {sessionState.status === "checking" && (
                    <p className="published-message" role="status">
                      Sprawdzam sesję gracza…
                    </p>
                  )}
                  {sessionState.status === "error" && (
                    <div className="published-message">
                      <p role="alert">Nie udało się sprawdzić sesji gracza.</p>
                      <Button type="button" variant="outline" onClick={refresh}>
                        Spróbuj ponownie
                      </Button>
                    </div>
                  )}
                  <PublishedRoundMatches matches={round.matches} />
                </>
              )}
              {player && (
                <PlayerRoundPredictions
                  key={player.player.id}
                  round={round}
                  active={canShowPredictions}
                  csrfToken={player.csrfToken}
                  refreshSession={refresh}
                />
              )}
            </>
          ) : (
            <div className="published-message published-empty">
              <ListOrdered size={24} aria-hidden="true" />
              <div>
                <h2 id="published-current-heading">Brak opublikowanych rund</h2>
                <p>Gdy administrator opublikuje rundę w tym sezonie, pojawi się tutaj.</p>
              </div>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
