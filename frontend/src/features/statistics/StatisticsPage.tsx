import { useEffect, useState, type ReactNode } from "react";
import { BarChart3, LogIn, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlayerAccountError } from "@/features/account/api/player-account";
import { usePredictionSession } from "@/features/predictions/api/use-prediction-session";
import { GameStatisticsDetail } from "./components/GameStatisticsDetail";
import { PersonalPredictionInsights } from "./components/PersonalPredictionInsights";
import { TeamLeagueProgress } from "./components/TeamLeagueProgress";
import {
  fetchGameStatistics,
  fetchPlayerStatistics,
  type PlayerStatistics,
} from "./api/prediction-statistics";
import "../ranking/ranking.css";
import "./statistics.css";

type StatisticsResult<T> = { status: "ready"; data: T } | { status: "error"; error: unknown };
type StatisticsLoader<T> = (seasonCode: string, signal: AbortSignal) => Promise<T>;

function useStatistics<T>(seasonCode: string, load: StatisticsLoader<T>, scope: string | null) {
  const [snapshot, setSnapshot] = useState<{ key: string; result: StatisticsResult<T> }>();
  const [attempt, setAttempt] = useState(0);
  const key = JSON.stringify([seasonCode, scope, attempt]);

  useEffect(() => {
    if (scope === null) return;
    const controller = new AbortController();
    load(seasonCode, controller.signal).then(
      (data) => {
        if (!controller.signal.aborted) setSnapshot({ key, result: { status: "ready", data } });
      },
      (error: unknown) => {
        if (!controller.signal.aborted) setSnapshot({ key, result: { status: "error", error } });
      },
    );
    return () => controller.abort();
  }, [key, load, scope, seasonCode]);

  return {
    result: scope !== null && snapshot?.key === key ? snapshot.result : undefined,
    retry: () => setAttempt((value) => value + 1),
  };
}

const numberFormat = new Intl.NumberFormat("pl-PL");
const percentFormat = new Intl.NumberFormat("pl-PL", {
  style: "percent",
  maximumFractionDigits: 1,
});

type Stat = { label: string; value: number; detail?: string };

function StatsGrid({ stats }: { stats: readonly Stat[] }) {
  return (
    <dl className="statistics-grid">
      {stats.map(({ label, value, detail }) => (
        <div className="statistics-metric" key={label}>
          <dt>{label}</dt>
          <dd>
            <strong>{numberFormat.format(value)}</strong>
            {detail && <span>{detail}</span>}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function accuracy(hits: number, settled: number) {
  return settled > 0 ? `${percentFormat.format(hits / settled)} skuteczności` : undefined;
}

function RoundPoints({ rounds }: { rounds: PlayerStatistics["rounds"] }) {
  const maxPoints = rounds.reduce((max, { points }) => Math.max(max, Math.abs(points)), 1);

  return (
    <div className="statistics-rounds">
      <h3>Punkty w poszczególnych rundach</h3>
      <ol className="statistics-round-list">
        {rounds.map((round) => (
          <li className="statistics-round" key={round.id}>
            <div className="statistics-round-score">
              <span>{round.name}</span>
              <strong className={round.points < 0 ? "statistics-points-negative" : undefined}>
                {numberFormat.format(round.points)} pkt
              </strong>
            </div>
            <div className="statistics-bar-track" aria-hidden="true">
              <span
                className="statistics-bar-fill"
                data-negative={round.points < 0}
                style={{ width: `${(Math.abs(round.points) / maxPoints) * 50}%` }}
              />
            </div>
            <p className="statistics-round-counts">
              Trafione 1/X/2 {round.correctOutcomes}/{round.settledPredictions} · Dokładne{" "}
              {round.exactScores}/{round.settledPredictions}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PersonalResults({ data }: { data: PlayerStatistics }) {
  const { totals } = data;
  if (totals.settledPredictions === 0) {
    return (
      <p className="statistics-message">Twoje wyniki pojawią się po rozliczeniu pierwszego typu.</p>
    );
  }
  return (
    <>
      <StatsGrid
        stats={[
          { label: "Punkty", value: totals.points },
          { label: "Rozliczone typy", value: totals.settledPredictions },
          {
            label: "Dokładne wyniki",
            value: totals.exactScores,
            detail: accuracy(totals.exactScores, totals.settledPredictions),
          },
          {
            label: "Trafione 1/X/2",
            value: totals.correctOutcomes,
            detail: accuracy(totals.correctOutcomes, totals.settledPredictions),
          },
        ]}
      />
      {data.rounds.length > 0 && <RoundPoints rounds={data.rounds} />}
    </>
  );
}

function StatisticsError({ message, retry }: { message: string; retry: () => void }) {
  return (
    <div className="statistics-message statistics-message-action">
      <p role="alert">{message}</p>
      <Button type="button" variant="outline" onClick={retry}>
        <RefreshCw aria-hidden="true" /> Spróbuj ponownie
      </Button>
    </div>
  );
}

function SignIn() {
  return (
    <div className="statistics-message statistics-message-action">
      <p>Zaloguj się, aby zobaczyć swoje statystyki.</p>
      <Button asChild>
        <a href="#konto">
          <LogIn aria-hidden="true" /> Zaloguj się
        </a>
      </Button>
    </div>
  );
}

export function StatisticsPage({
  seasonCode,
  navigation,
  reduceMotion = false,
}: {
  seasonCode: string;
  navigation?: ReactNode;
  reduceMotion?: boolean;
}) {
  const game = useStatistics(seasonCode, fetchGameStatistics, "public");
  const session = usePredictionSession(true);
  const playerId = session.state.status === "ready" ? (session.player?.player.id ?? null) : null;
  const personal = useStatistics(seasonCode, fetchPlayerStatistics, playerId);
  const gameData = game.result?.status === "ready" ? game.result.data : undefined;
  const personalData = personal.result?.status === "ready" ? personal.result.data : undefined;
  const expiredSession =
    personal.result?.status === "error" &&
    personal.result.error instanceof PlayerAccountError &&
    (personal.result.error.status === 401 || personal.result.error.status === 403);
  const seasonName = gameData?.seasonName ?? personalData?.seasonName;
  const showPersonalFirst = Boolean(playerId) && !expiredSession;
  const personalPanel = (
    <section
      key="personal"
      className="ranking-panel statistics-panel"
      aria-labelledby="personal-stats-title"
    >
      <h2 id="personal-stats-title">Moje statystyki</h2>
      {session.state.status === "error" && (
        <StatisticsError message="Nie udało się sprawdzić sesji gracza." retry={session.refresh} />
      )}
      {(session.state.status === "checking" || (playerId && !personal.result)) && (
        <p className="statistics-message" role="status">
          Wczytuję Twoje statystyki…
        </p>
      )}
      {((session.state.status === "ready" && !playerId) || expiredSession) && <SignIn />}
      {personal.result?.status === "error" && !expiredSession && (
        <StatisticsError message="Nie udało się wczytać Twoich statystyk." retry={personal.retry} />
      )}
      {personalData && (
        <>
          <PersonalResults data={personalData} />
          <PersonalPredictionInsights data={personalData} />
        </>
      )}
    </section>
  );

  return (
    <main tabIndex={-1} className="ranking-page page-container" aria-labelledby="statistics-title">
      <header className="ranking-hero">
        <span className="ranking-hero-icon">
          <BarChart3 aria-hidden="true" />
        </span>
        <div>
          <h1 id="statistics-title">Statystyki</h1>
          {seasonName && <p>{seasonName}</p>}
        </div>
      </header>
      {navigation}
      <div className="statistics-panels">
        {showPersonalFirst && personalPanel}
        <TeamLeagueProgress seasonCode={seasonCode} reduceMotion={reduceMotion} />
        <section className="ranking-panel statistics-panel" aria-labelledby="game-stats-title">
          <h2 id="game-stats-title">Gra w liczbach</h2>
          {!game.result && (
            <p className="statistics-message" role="status">
              Wczytuję liczby sezonu…
            </p>
          )}
          {game.result?.status === "error" && (
            <StatisticsError message="Nie udało się wczytać liczb sezonu." retry={game.retry} />
          )}
          {gameData && (
            <>
              <StatsGrid
                stats={[
                  { label: "Gracze w klasyfikacji", value: gameData.playersWithSettledPredictions },
                  { label: "Rozliczone typy", value: gameData.settledPredictions },
                  { label: "Dokładne wyniki", value: gameData.exactScores },
                  { label: "Trafione 1/X/2", value: gameData.correctOutcomes },
                ]}
              />
              <GameStatisticsDetail data={gameData} />
            </>
          )}
        </section>
        {!showPersonalFirst && personalPanel}
      </div>
    </main>
  );
}
