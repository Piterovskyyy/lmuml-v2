import { useEffect, useState } from "react";
import { ArrowRight, ChartNoAxesColumn, Trophy, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlayerAccountError } from "@/features/account/api/player-account";
import { fetchPlayerRanking, type PlayerRanking } from "@/features/ranking/api/player-ranking";
import {
  fetchGameStatistics,
  type GameStatistics,
} from "@/features/statistics/api/prediction-statistics";
import "./home-game-overview.css";

const count = new Intl.NumberFormat("pl-PL");
const rate = new Intl.NumberFormat("pl-PL", { style: "percent", maximumFractionDigits: 1 });

type Read<T> = { status: "loading" | "error" } | { status: "ready"; data: T };
type GameRound = NonNullable<GameStatistics["rounds"]>[number];

function AccuracyBreakdown({ stats }: { stats: GameStatistics }) {
  const exactShare = stats.exactScores / stats.settledPredictions;
  const correctShare = stats.correctOutcomes / stats.settledPredictions;
  const parts = [
    { type: "exact", label: "Dokładny wynik", value: stats.exactScores },
    {
      type: "outcome",
      label: "Tylko rezultat 1/X/2",
      value: stats.correctOutcomes - stats.exactScores,
    },
    {
      type: "miss",
      label: "Nietrafione",
      value: stats.settledPredictions - stats.correctOutcomes,
    },
  ];

  return (
    <div className="home-game-chart">
      <h3>Jak typujemy?</h3>
      <div className="home-accuracy-body">
        <div
          className="home-accuracy-ring"
          style={{
            background: `conic-gradient(var(--primary) 0 ${exactShare * 100}%, var(--home-outcome) ${exactShare * 100}% ${correctShare * 100}%, var(--home-miss) ${correctShare * 100}% 100%)`,
          }}
        >
          <div className="home-accuracy-total">
            <strong>{rate.format(correctShare)}</strong>
            <span>trafione 1/X/2</span>
          </div>
        </div>
        <ul className="home-accuracy-legend" role="list">
          {parts.map(({ type, label, value }) => (
            <li key={type}>
              <span className="home-accuracy-swatch" data-part={type} aria-hidden="true" />
              <span>{label}</span>
              <strong title={count.format(value) + " typów"}>
                {rate.format(value / stats.settledPredictions)}
              </strong>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function RoundActivity({ rounds }: { rounds: readonly GameRound[] }) {
  const recentRounds = rounds.slice(-6);
  const maximum = Math.max(1, ...recentRounds.map((round) => round.settledPredictions));

  return (
    <div className="home-game-chart">
      <h3>Rozliczone typy w ostatnich rundach</h3>
      <ol className="home-round-activity" role="list">
        {recentRounds.map((round) => (
          <li
            key={round.number}
            title={round.name + " · " + round.settledPredictions + " rozliczonych typów"}
          >
            <span className="sr-only">{round.name}, rozliczone typy:</span>
            <strong>{count.format(round.settledPredictions)}</strong>
            <span className="home-round-activity-track" aria-hidden="true">
              <span style={{ height: (round.settledPredictions / maximum) * 100 + "%" }} />
            </span>
            <span aria-hidden="true">R{round.number}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function HomeGameOverview({ seasonCode }: { seasonCode: string }) {
  const [stats, setStats] = useState<Read<GameStatistics>>({ status: "loading" });
  const [ranking, setRanking] = useState<Read<PlayerRanking | null>>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetchGameStatistics(seasonCode, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setStats({ status: "ready", data });
      },
      () => {
        if (!controller.signal.aborted) setStats({ status: "error" });
      },
    );
    fetchPlayerRanking(seasonCode, null, "POINTS", controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setRanking({ status: "ready", data });
      },
      (error: unknown) => {
        if (controller.signal.aborted) return;
        const signedOut = error instanceof PlayerAccountError && [401, 403].includes(error.status);
        setRanking(signedOut ? { status: "ready", data: null } : { status: "error" });
      },
    );
    return () => controller.abort();
  }, [seasonCode, attempt]);

  function retry() {
    setStats((previous) => (previous.status === "error" ? { status: "loading" } : previous));
    setRanking((previous) => (previous.status === "error" ? { status: "loading" } : previous));
    setAttempt((value) => value + 1);
  }

  const game = stats.status === "ready" ? stats.data : undefined;
  const personalRanking = ranking.status === "ready" ? ranking.data : null;
  const currentPlayer = personalRanking?.entries.find((entry) => entry.isCurrentPlayer);

  return (
    <div className="home-game-overview">
      <section
        className="home-preview-panel home-game-leaders"
        aria-labelledby="home-ranking-title"
      >
        <h2 className="home-preview-heading" id="home-ranking-title">
          <Trophy size={21} aria-hidden="true" /> Ranking graczy
        </h2>
        {game && <p className="home-preview-season">{game.seasonName}</p>}
        {stats.status === "loading" && <p role="status">Wczytuję czołówkę rankingu…</p>}
        {stats.status === "error" && <p>Nie udało się wczytać czołówki rankingu.</p>}
        {game?.leaders?.length ? (
          <ol className="home-ranking-list" role="list">
            {game.leaders.map((entry, index) => (
              <li key={index} data-leader={entry.position === 1}>
                <span className="home-ranking-position">
                  <span className="sr-only">Miejsce </span>
                  {entry.position}.
                </span>
                <span>{entry.displayName}</span>
                <strong>{count.format(entry.points)} pkt</strong>
              </li>
            ))}
          </ol>
        ) : (
          game && (
            <p className="home-preview-empty">
              {game.settledPredictions > 0
                ? "Podgląd czołówki jest teraz niedostępny."
                : "Ranking pojawi się po rozliczeniu pierwszych typów."}
            </p>
          )
        )}
        <a className="home-preview-link" href="#ranking">
          Pełny ranking <ArrowRight size={16} aria-hidden="true" />
        </a>
      </section>
      <section className="home-game-counts home-preview-panel" aria-labelledby="home-game-title">
        <h2 className="home-preview-heading" id="home-game-title">
          <ChartNoAxesColumn size={21} aria-hidden="true" /> Gra w liczbach
        </h2>
        {game && (
          <>
            <dl className="home-game-metrics">
              <div>
                <dt>Gracze w rankingu</dt>
                <dd>{count.format(game.playersWithSettledPredictions)}</dd>
              </div>
              <div>
                <dt>Rozliczone typy</dt>
                <dd>{count.format(game.settledPredictions)}</dd>
              </div>
              <div>
                <dt>Dokładne wyniki</dt>
                <dd>{count.format(game.exactScores)}</dd>
              </div>
              <div>
                <dt>Trafione 1/X/2</dt>
                <dd>{count.format(game.correctOutcomes)}</dd>
              </div>
            </dl>
            {game.settledPredictions > 0 ? (
              <div className="home-game-charts">
                <AccuracyBreakdown stats={game} />
                {game.rounds && game.rounds.length > 0 && <RoundActivity rounds={game.rounds} />}
              </div>
            ) : (
              <p className="home-preview-empty">Wykresy pojawią się po pierwszych rozliczeniach.</p>
            )}
          </>
        )}
        {stats.status === "loading" && <p role="status">Wczytuję statystyki sezonu…</p>}
        {stats.status === "error" && <p role="alert">Nie udało się wczytać statystyk sezonu.</p>}
        <a className="home-preview-link" href="#statystyki">
          Zobacz statystyki <ArrowRight size={16} aria-hidden="true" />
        </a>
      </section>
      {personalRanking && (
        <section
          className="home-preview-panel home-personal-panel"
          aria-labelledby="home-personal-title"
        >
          <h2 className="home-preview-heading" id="home-personal-title">
            <UserRound size={21} aria-hidden="true" /> Twoja gra
          </h2>
          {currentPlayer ? (
            <dl className="home-game-metrics home-personal-metrics">
              <div>
                <dt>Miejsce</dt>
                <dd>{currentPlayer.position}.</dd>
              </div>
              <div>
                <dt>Punkty</dt>
                <dd>{count.format(currentPlayer.points)}</dd>
              </div>
              <div>
                <dt>Dokładne wyniki</dt>
                <dd>{count.format(currentPlayer.exactScores)}</dd>
              </div>
              <div>
                <dt>Skuteczność 1/X/2</dt>
                <dd>
                  {rate.format(currentPlayer.correctOutcomes / currentPlayer.settledPredictions)}
                </dd>
              </div>
            </dl>
          ) : (
            <p className="home-preview-empty">
              Twoje statystyki pojawią się po rozliczeniu pierwszego typu.
            </p>
          )}
          <a className="home-preview-link" href="#statystyki">
            Moje statystyki <ArrowRight size={16} aria-hidden="true" />
          </a>
        </section>
      )}
      {(stats.status === "error" || ranking.status === "error") && (
        <div className="home-game-retry">
          {ranking.status === "error" && (
            <p role="alert">Nie udało się wczytać Twoich statystyk.</p>
          )}
          <Button variant="outline" onClick={retry}>
            Spróbuj ponownie
          </Button>
        </div>
      )}
    </div>
  );
}
