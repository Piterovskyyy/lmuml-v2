import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { LogIn, RefreshCw, Search, UsersRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PlayerAccountError } from "@/features/account/api/player-account";
import { MatchState } from "@/features/matches/model/match-status";
import { useMatchdayRefresh } from "@/features/matches/model/use-matchday-refresh";
import { usePublishedRounds } from "@/features/predictions/api/use-published-rounds";
import { fetchPlayersPredictions, type PlayersPredictions } from "./api/players-predictions";
import { PlayerPredictionsCard } from "./components/PlayerPredictionsCard";
import "./players-predictions.css";

type ReadState = {
  roundId: string;
  status: "loading" | "ready" | "error" | "sign-in" | "missing";
  data?: PlayersPredictions;
};

const refreshStates = new Set([
  MatchState.Scheduled,
  MatchState.Live,
  MatchState.Break,
  MatchState.Suspended,
  MatchState.Finished,
  MatchState.Awarded,
]);

function normalizedSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ł/gi, "l")
    .toLowerCase()
    .trim();
}

export function PlayersPredictionsPage({
  seasonCode,
  navigation,
}: {
  seasonCode: string;
  navigation?: ReactNode;
}) {
  const roundSelectId = useId();
  const searchId = useId();
  const playerDetailsId = useId();
  const {
    data: season,
    loading: loadingRounds,
    failed: roundsFailed,
    seasonMissing,
    reload: reloadRounds,
  } = usePublishedRounds(seasonCode);
  const [selectedRoundId, setSelectedRoundId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [expandedPlayerId, setExpandedPlayerId] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<ReadState>();
  const rounds = season?.rounds ?? [];
  const round = rounds.find(({ id }) => id === selectedRoundId) ?? rounds[0];
  const roundId = round?.id;
  const current = state?.roundId === roundId ? state : undefined;
  const data = current?.data;

  useEffect(() => {
    if (!roundId) return;
    const controller = new AbortController();
    setState((previous) => ({
      roundId,
      status: "loading",
      data: previous?.roundId === roundId ? previous.data : undefined,
    }));
    void fetchPlayersPredictions(roundId, controller.signal).then(
      (received) => {
        if (!controller.signal.aborted) setState({ roundId, status: "ready", data: received });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const status = error instanceof PlayerAccountError ? error.status : undefined;
        if (status === 401 || status === 403) setState({ roundId, status: "sign-in" });
        else if (status === 400 || status === 404) setState({ roundId, status: "missing" });
        else
          setState((previous) => ({
            roundId,
            status: "error",
            data: previous?.roundId === roundId ? previous.data : undefined,
          }));
      },
    );
    return () => controller.abort();
  }, [roundId, attempt]);

  function refresh() {
    if (current?.status === "loading") return;
    reloadRounds();
    setAttempt((value) => value + 1);
  }

  const kickoffs = useMemo(
    () =>
      round?.matches.flatMap((match) =>
        match.kickoffAt && refreshStates.has(match.status.state) ? [match.kickoffAt] : [],
      ),
    [round],
  );
  useMatchdayRefresh(kickoffs, refresh, {
    enabled: Boolean(data) && current?.status !== "loading",
  });
  const normalizedQuery = normalizedSearch(query);
  const players =
    data?.players.filter(({ displayName }) =>
      normalizedSearch(displayName).includes(normalizedQuery),
    ) ?? [];

  return (
    <main
      className="page-container players-predictions-page"
      tabIndex={-1}
      aria-labelledby="players-predictions-heading"
    >
      <header className="players-predictions-header">
        <span className="players-predictions-icon">
          <UsersRound aria-hidden="true" />
        </span>
        <div>
          <h1 id="players-predictions-heading">Typy graczy</h1>
          <p>{season?.season.name ?? "Porównaj typy w swojej rundzie."}</p>
        </div>
      </header>
      {navigation}

      {loadingRounds && !season && (
        <p className="shared-predictions-message" role="status">
          Wczytuję rundy…
        </p>
      )}
      {roundsFailed && (
        <div className="shared-predictions-message">
          <p role="alert">
            {seasonMissing
              ? "Ten sezon jest niedostępny."
              : season
                ? "Nie udało się odświeżyć rund. Pokazujemy poprzednio pobrane dane."
                : "Nie udało się wczytać rund."}
          </p>
          <Button variant="outline" onClick={reloadRounds}>
            Spróbuj ponownie
          </Button>
        </div>
      )}
      {season && rounds.length === 0 && (
        <p className="shared-predictions-message">
          Typy graczy pojawią się po opublikowaniu pierwszej rundy.
        </p>
      )}
      {round && (
        <>
          <div className="players-predictions-controls">
            <div>
              <label htmlFor={roundSelectId}>Wybierz rundę</label>
              <select
                id={roundSelectId}
                value={round.id}
                onChange={(event) => setSelectedRoundId(event.target.value)}
              >
                {rounds.map((item) => (
                  <option value={item.id} key={item.id}>
                    {item.name}
                  </option>
                ))}
              </select>
            </div>
            <Button
              variant="outline"
              aria-disabled={current?.status === "loading"}
              onClick={refresh}
            >
              <RefreshCw aria-hidden="true" size={17} /> Odśwież
            </Button>
          </div>
          {(!current || (current.status === "loading" && !data)) && (
            <p className="shared-predictions-message" role="status">
              Wczytuję typy graczy…
            </p>
          )}
          {current?.status === "sign-in" && (
            <div className="shared-predictions-message">
              <p>Zaloguj się, aby zobaczyć typy graczy.</p>
              <Button asChild>
                <a href="#konto">
                  <LogIn aria-hidden="true" /> Zaloguj się
                </a>
              </Button>
            </div>
          )}
          {current?.status === "missing" && (
            <p className="shared-predictions-message" role="alert">
              Ta runda jest niedostępna. Wybierz inną rundę.
            </p>
          )}
          {current?.status === "error" && (
            <div className="shared-predictions-message">
              <p role="alert">
                {data
                  ? "Nie udało się odświeżyć typów. Pokazujemy poprzednio pobrane dane."
                  : "Nie udało się wczytać typów graczy."}
              </p>
              <Button variant="outline" onClick={refresh}>
                Spróbuj ponownie
              </Button>
            </div>
          )}
          {data && (
            <>
              <div className="players-predictions-search">
                <label htmlFor={searchId}>Szukaj gracza</label>
                <div>
                  <Search aria-hidden="true" size={18} />
                  <Input
                    id={searchId}
                    type="search"
                    value={query}
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Wpisz nazwę gracza"
                  />
                </div>
              </div>
              <p className="players-predictions-rule">
                Typy poszczególnych meczów są dostępne po ich rozpoczęciu.
              </p>
              {players.length === 0 && (
                <p className="shared-predictions-message">
                  {data.players.length === 0
                    ? "Gracze pojawią się tutaj po zapisaniu typów w tej rundzie."
                    : "Nie znaleziono gracza o tej nazwie."}
                </p>
              )}
              <div className="shared-players-list" aria-busy={current?.status === "loading"}>
                {players.map((player) => (
                  <PlayerPredictionsCard
                    key={player.id}
                    player={player}
                    matches={round.matches}
                    serverNow={data.serverNow}
                    expanded={expandedPlayerId === player.id}
                    detailsId={`${playerDetailsId}-${player.id}`}
                    onToggle={() =>
                      setExpandedPlayerId(expandedPlayerId === player.id ? null : player.id)
                    }
                  />
                ))}
              </div>
            </>
          )}
        </>
      )}
    </main>
  );
}
