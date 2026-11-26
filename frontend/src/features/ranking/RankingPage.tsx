import { useEffect, useId, useState, type ReactNode } from "react";
import { LogIn, RefreshCw, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlayerAccountError } from "@/features/account/api/player-account";
import { useMatchdayRefresh } from "@/features/matches/model/use-matchday-refresh";
import { useSeasonUpdates } from "@/features/matches/model/use-season-updates";
import { fetchPlayerRanking, type PlayerRanking, type RankingSort } from "./api/player-ranking";
import "./ranking.css";

type LoadState =
  | { status: "loading" | "error"; data?: PlayerRanking }
  | { status: "sign-in" | "missing"; data?: never }
  | { status: "ready"; data: PlayerRanking };

const pointsFormat = new Intl.NumberFormat("pl-PL");
const pointsChangeFormat = new Intl.NumberFormat("pl-PL", { signDisplay: "exceptZero" });

const metricLabels = {
  exactScores: "Dokładne wyniki",
  correctOutcomes: "Trafione 1/X/2",
  settledPredictions: "Rozliczone typy",
  points: "Punkty",
} as const;

type Metric = keyof typeof metricLabels;
type RankingEntry = PlayerRanking["entries"][number];
type ScoredRound = NonNullable<PlayerRanking["latestScoredRound"]>;

const rankingModes = {
  POINTS: {
    label: "Punkty",
    metric: "points",
    tiebreak: "exactScores",
    order: "Decydują punkty, potem liczba dokładnych wyników.",
  },
  EXACT_SCORES: {
    label: "Dokładne wyniki",
    metric: "exactScores",
    tiebreak: "points",
    order: "Decyduje liczba dokładnych wyników, potem punkty.",
  },
  OUTCOMES: {
    label: "1/X/2",
    metric: "correctOutcomes",
    tiebreak: "points",
    order: "Decyduje liczba trafień 1/X/2, potem punkty.",
  },
} as const satisfies Record<
  RankingSort,
  { label: string; metric: Metric; tiebreak: Metric; order: string }
>;

const rankingSorts = Object.keys(rankingModes) as RankingSort[];
const metrics = Object.keys(metricLabels) as Metric[];

function formatMetric(entry: RankingEntry, metric: Metric, latestRound?: ScoredRound) {
  if (metric !== "points") return entry[metric];

  return (
    <>
      {pointsFormat.format(entry.points)}
      {latestRound && entry.latestRoundPoints != null && (
        <>
          {" "}
          <span
            className="ranking-round-points"
            data-negative={entry.latestRoundPoints < 0}
            data-positive={entry.latestRoundPoints > 0}
            title={`Punkty z rundy ${latestRound.number}`}
          >
            ({pointsChangeFormat.format(entry.latestRoundPoints)})
          </span>
        </>
      )}
    </>
  );
}

function RankingTable({
  entries,
  sort,
  latestRound,
}: {
  entries: RankingEntry[];
  sort: RankingSort;
  latestRound?: ScoredRound;
}) {
  const { metric: primary, tiebreak } = rankingModes[sort];
  const columns = [...metrics.filter((metric) => metric !== primary), primary];

  return (
    <table
      className="ranking-table"
      aria-labelledby="ranking-scope-heading"
      aria-describedby="ranking-order"
    >
      <thead>
        <tr>
          <th scope="col">
            <span aria-hidden="true">#</span>
            <span className="sr-only">Miejsce</span>
          </th>
          <th scope="col">Gracz</th>
          {columns.map((metric) => (
            <th
              key={metric}
              scope="col"
              className={metric === primary ? undefined : "ranking-table-detail"}
              aria-sort={metric === primary ? "descending" : undefined}
            >
              {metricLabels[metric]}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, index) => (
          <tr key={`${entry.displayName}-${index}`} data-current-player={entry.isCurrentPlayer}>
            <td>
              <span className="ranking-position" data-leader={entry.position === 1}>
                {entry.position}
              </span>
            </td>
            <th scope="row">
              <span className="ranking-player-name">{entry.displayName}</span>
              {entry.isCurrentPlayer && <span className="ranking-player-self">Ty</span>}
              <span className="ranking-player-detail">
                {metricLabels[tiebreak]}: {formatMetric(entry, tiebreak, latestRound)} · Rozliczone
                typy: {entry.settledPredictions}
              </span>
            </th>
            {columns.map((metric) => (
              <td
                key={metric}
                className={metric === primary ? "ranking-table-primary" : "ranking-table-detail"}
                data-negative={metric === "points" && entry.points < 0}
              >
                {formatMetric(entry, metric, latestRound)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function RankingPage({
  seasonCode,
  navigation,
}: {
  seasonCode: string;
  navigation?: ReactNode;
}) {
  const scopeId = useId();
  const [roundId, setRoundId] = useState<string | null>(null);
  const [sort, setSort] = useState<RankingSort>("POINTS");
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [metadata, setMetadata] = useState<
    Pick<PlayerRanking, "seasonName" | "rounds" | "fixturesCapturedAt"> & { seasonCode: string }
  >();

  useEffect(() => {
    const controller = new AbortController();
    fetchPlayerRanking(seasonCode, roundId, sort, controller.signal).then(
      (data) => {
        if (controller.signal.aborted) return;
        setMetadata({
          seasonCode,
          seasonName: data.seasonName,
          rounds: data.rounds,
          fixturesCapturedAt: data.fixturesCapturedAt,
        });
        setState({ status: "ready", data });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const status = error instanceof PlayerAccountError ? error.status : undefined;
        if (status === 401 || status === 403) {
          setMetadata(undefined);
          setState({ status: "sign-in" });
        } else if (status === 404) {
          setState({ status: "missing" });
        } else {
          setState((previous) => ({ status: "error", data: previous.data }));
        }
      },
    );
    return () => controller.abort();
  }, [seasonCode, roundId, sort, attempt]);

  function reload() {
    setState((previous) => ({ status: "loading", data: previous.data }));
    setAttempt((previous) => previous + 1);
  }

  function refresh() {
    if (state.status !== "loading") reload();
  }

  const streaming = useSeasonUpdates(seasonCode, reload, {
    enabled: metadata?.seasonCode === seasonCode && state.status !== "missing",
    fixturesCapturedAt: metadata?.fixturesCapturedAt,
  });
  useMatchdayRefresh(state.data?.refreshKickoffs, refresh, {
    enabled: state.status !== "loading",
    active: !streaming || state.status === "error",
  });

  const selectedRound = metadata?.rounds.find((round) => round.id === roundId);
  const scopeTitle = selectedRound?.name ?? "Klasyfikacja sezonu";
  const latestRound =
    roundId === null && state.data?.roundId === null
      ? (state.data.latestScoredRound ?? undefined)
      : undefined;

  return (
    <main tabIndex={-1} className="ranking-page page-container" aria-labelledby="ranking-title">
      <header className="ranking-hero">
        <span className="ranking-hero-icon">
          <Trophy aria-hidden="true" />
        </span>
        <div>
          <h1 id="ranking-title">Ranking</h1>
          {metadata && <p>{metadata.seasonName}</p>}
        </div>
      </header>
      {navigation}
      <section className="ranking-panel" aria-label="Klasyfikacja graczy">
        {metadata && (
          <>
            <div className="ranking-modes" role="group" aria-label="Klasyfikacja rankingu">
              {rankingSorts.map((mode) => (
                <Button
                  key={mode}
                  type="button"
                  variant={mode === sort ? "default" : "outline"}
                  aria-pressed={mode === sort}
                  onClick={() => {
                    if (mode === sort) return;
                    setState({ status: "loading" });
                    setSort(mode);
                  }}
                >
                  {rankingModes[mode].label}
                </Button>
              ))}
            </div>
            <div className="ranking-controls">
              <div>
                <label htmlFor={scopeId}>Zakres rankingu</label>
                <select
                  id={scopeId}
                  value={roundId ?? ""}
                  onChange={(event) => {
                    const nextRoundId = event.target.value || null;
                    if (nextRoundId === roundId) return;
                    setState({ status: "loading" });
                    setRoundId(nextRoundId);
                  }}
                >
                  <option value="">Cały sezon</option>
                  {metadata.rounds.map((round) => (
                    <option key={round.id} value={round.id}>
                      Tylko runda {round.number}
                    </option>
                  ))}
                </select>
              </div>
              <Button
                type="button"
                variant="outline"
                onClick={refresh}
                aria-disabled={state.status === "loading"}
              >
                <RefreshCw aria-hidden="true" /> Odśwież
              </Button>
            </div>
          </>
        )}
        {state.status === "loading" && !state.data && (
          <p className="ranking-status" role="status">
            Wczytuję ranking…
          </p>
        )}
        {state.status === "sign-in" && (
          <div className="ranking-status">
            <p>Zaloguj się, aby zobaczyć ranking graczy.</p>
            <Button asChild>
              <a href="#konto">
                <LogIn aria-hidden="true" /> Zaloguj się
              </a>
            </Button>
          </div>
        )}
        {((state.status === "error" && !state.data) || state.status === "missing") && (
          <div className="ranking-status">
            <p role="alert">
              {state.status === "missing"
                ? roundId
                  ? "Ta runda jest niedostępna."
                  : "Ranking tego sezonu jest niedostępny."
                : "Nie udało się wczytać rankingu."}
            </p>
            <Button type="button" variant="outline" onClick={refresh}>
              Spróbuj ponownie
            </Button>
          </div>
        )}
        {state.data && (
          <>
            <div className="ranking-scope">
              <h2 id="ranking-scope-heading">{scopeTitle}</h2>
            </div>
            {state.status === "error" && (
              <p className="ranking-status" role="status">
                Nie udało się odświeżyć rankingu. Pokazujemy poprzednie wyniki.
              </p>
            )}
            {state.data.entries.length > 0 ? (
              <>
                <RankingTable entries={state.data.entries} sort={sort} latestRound={latestRound} />
                <p className="ranking-order" id="ranking-order">
                  {latestRound && `W nawiasie punkty z rundy ${latestRound.number}. `}
                  {rankingModes[sort].order} Pełny remis oznacza wspólne miejsce.
                  {sort === "OUTCOMES" &&
                    " 1 to wygrana gospodarzy, X to remis, 2 to wygrana gości."}
                </p>
              </>
            ) : (
              <p className="ranking-status">Ranking pojawi się po rozliczeniu pierwszych typów.</p>
            )}
          </>
        )}
      </section>
    </main>
  );
}
