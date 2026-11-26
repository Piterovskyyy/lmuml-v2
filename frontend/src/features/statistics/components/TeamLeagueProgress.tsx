import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { Chart } from "chart.js";
import { ArrowRight, ChartNoAxesColumnIncreasing, RefreshCw } from "lucide-react";
import { TeamCrest } from "@/components/football/TeamCrest";
import { Button } from "@/components/ui/button";
import type { FootballMatch } from "@/features/matches/api/season-matches";
import { useSeasonMatches } from "@/features/matches/api/use-season-matches";
import { LEAGUE_TEAM_COUNT } from "@/features/matches/model/competition-stage";
import { MatchState } from "@/features/matches/model/match-status";
import { buildLeaguePlacementHistory, leagueMatchday } from "../model/league-placement-history";
import "./team-league-progress.css";

type Team = FootballMatch["homeTeam"];
type MatchdayResult = { points: number; goalsFor: number; goalsAgainst: number };
type ClubProgress = { team: Team; results: Map<number, MatchdayResult> };
type ChartPoint = { matchday: number; result: MatchdayResult | null };
type PlacementPoint = { matchday: number; position: number; shared: boolean };

const chartModes = [
  { id: "points", label: "Punkty" },
  { id: "goals", label: "Bramki" },
  { id: "placement", label: "Miejsce z wyników" },
] as const;
type ChartMode = (typeof chartModes)[number]["id"];

const clubOrder = new Intl.Collator("pl-PL");
const noMatches: readonly FootballMatch[] = [];

function collectLeagueProgress(matches: readonly FootballMatch[]) {
  const clubs = new Map<string, ClubProgress>();
  const matchdaysWithResults = new Set<number>();

  function progressFor(team: Team) {
    const existing = clubs.get(team.id);
    if (existing) return existing;
    const progress: ClubProgress = { team, results: new Map() };
    clubs.set(team.id, progress);
    return progress;
  }

  function recordResult(
    club: ClubProgress,
    matchday: number,
    goalsFor: number,
    goalsAgainst: number,
  ) {
    const points = goalsFor > goalsAgainst ? 3 : goalsFor === goalsAgainst ? 1 : 0;
    const previous = club.results.get(matchday);
    club.results.set(matchday, {
      points: (previous?.points ?? 0) + points,
      goalsFor: (previous?.goalsFor ?? 0) + goalsFor,
      goalsAgainst: (previous?.goalsAgainst ?? 0) + goalsAgainst,
    });
  }

  for (const match of matches) {
    const matchday = leagueMatchday(match);
    if (matchday === null) continue;

    const homeClub = progressFor(match.homeTeam);
    const awayClub = progressFor(match.awayTeam);
    const { home, away } = match.scores.regulationTime;
    if (match.status.state !== MatchState.Finished || home === null || away === null) continue;

    matchdaysWithResults.add(matchday);
    recordResult(homeClub, matchday, home, away);
    recordResult(awayClub, matchday, away, home);
  }

  return {
    clubs: [...clubs.values()].sort((a, b) => clubOrder.compare(a.team.name, b.team.name)),
    matchdays: [...matchdaysWithResults].sort((a, b) => a - b),
  };
}

function resultsByMatchday(club: ClubProgress, matchdays: readonly number[]): ChartPoint[] {
  let totalPoints = 0;
  return matchdays.map((matchday) => {
    const result = club.results.get(matchday);
    if (!result) return { matchday, result: null };
    totalPoints += result.points;
    return { matchday, result: { ...result, points: totalPoints } };
  });
}

function ClubProgressChart({
  club,
  matchdays,
  placements,
  mode,
  reduceMotion,
}: {
  club: ClubProgress;
  matchdays: number[];
  placements: readonly PlacementPoint[];
  mode: ChartMode;
  reduceMotion: boolean;
}) {
  const results = useMemo(() => resultsByMatchday(club, matchdays), [club, matchdays]);
  const canvas = useRef<HTMLCanvasElement>(null);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    const element = canvas.current;
    if (!element) return;

    let cancelled = false;
    let chart: Chart<"line", (number | null)[], string> | undefined;
    void import("chart.js")
      .then(
        ({
          Chart,
          CategoryScale,
          LinearScale,
          LineController,
          LineElement,
          PointElement,
          Tooltip,
          Filler,
        }) => {
          if (cancelled) return;

          Chart.register(
            CategoryScale,
            LinearScale,
            LineController,
            LineElement,
            PointElement,
            Tooltip,
            Filler,
          );
          const theme = getComputedStyle(element);
          const color = (token: string) => theme.getPropertyValue(token).trim();
          const primary = color("--primary");
          const warning = color("--warning");
          const muted = color("--muted-foreground");
          const grid = `color-mix(in srgb, ${muted} 18%, transparent)`;
          const lineStyle = {
            cubicInterpolationMode: "monotone" as const,
            borderWidth: 2,
            pointRadius: 3.5,
            pointHoverRadius: 5,
            pointBackgroundColor: color("--card"),
          };
          const series =
            mode === "points"
              ? [
                  {
                    ...lineStyle,
                    label: "Punkty",
                    data: results.map(({ result }) => result?.points ?? null),
                    borderColor: primary,
                    backgroundColor: `color-mix(in srgb, ${primary} 13%, transparent)`,
                    fill: "origin",
                  },
                ]
              : mode === "placement"
                ? [
                    {
                      ...lineStyle,
                      cubicInterpolationMode: "default" as const,
                      label: "Miejsce z wyników",
                      data: placements.map(({ position }) => position),
                      borderColor: primary,
                    },
                  ]
                : [
                    {
                      ...lineStyle,
                      label: "Zdobyte",
                      data: results.map(({ result }) => result?.goalsFor ?? null),
                      borderColor: primary,
                    },
                    {
                      ...lineStyle,
                      label: "Stracone",
                      data: results.map(({ result }) => result?.goalsAgainst ?? null),
                      borderColor: warning,
                      borderDash: [6, 4],
                      pointStyle: "rectRot" as const,
                    },
                  ];
          const isPlacement = mode === "placement";

          chart = new Chart(element, {
            type: "line",
            data: {
              labels: (isPlacement ? placements : results).map(({ matchday }) => String(matchday)),
              datasets: series,
            },
            options: {
              animation: reduceMotion ? false : { duration: 360 },
              maintainAspectRatio: false,
              interaction: { mode: "index", intersect: false },
              scales: {
                x: { grid: { display: false }, ticks: { color: muted } },
                y: {
                  min: isPlacement ? 1 : 0,
                  max: isPlacement ? LEAGUE_TEAM_COUNT : undefined,
                  reverse: isPlacement,
                  suggestedMax:
                    mode === "points" ? matchdays.length * 3 : isPlacement ? undefined : 3,
                  grid: { color: grid },
                  ticks: { color: muted, precision: 0, maxTicksLimit: 6 },
                },
              },
              plugins: {
                tooltip: {
                  displayColors: false,
                  callbacks: {
                    title: ([item]) => (item ? `Kolejka ${item.label}` : ""),
                    label: ({ dataset, formattedValue }) =>
                      mode === "points"
                        ? `${formattedValue} pkt`
                        : isPlacement
                          ? `${formattedValue}. miejsce`
                          : `${dataset.label}: ${formattedValue}`,
                  },
                },
              },
            },
          });
          setUnavailable(false);
        },
      )
      .catch(() => {
        if (!cancelled) setUnavailable(true);
      });

    return () => {
      cancelled = true;
      chart?.destroy();
    };
  }, [matchdays, mode, placements, reduceMotion, results]);

  return (
    <figure className="team-progress-figure">
      <figcaption className="team-progress-club">
        <TeamCrest name={club.team.name} logoUrl={club.team.logoUrl} />
        <strong>{club.team.name}</strong>
      </figcaption>
      {mode === "goals" && (
        <ul className="team-progress-legend" aria-label="Legenda wykresu bramek">
          <li>Zdobyte</li>
          <li data-conceded>Stracone</li>
        </ul>
      )}
      <div className="team-progress-canvas" hidden={unavailable} aria-hidden="true">
        <canvas ref={canvas} />
      </div>
      {unavailable && (
        <p className="statistics-message" role="status">
          Nie udało się wyświetlić wykresu. Wyniki są poniżej.
        </p>
      )}
      {mode === "placement" ? (
        <ol
          className="team-progress-values"
          data-mode={mode}
          aria-label="Miejsce z wyników po pełnych kolejkach"
        >
          {placements.map(({ matchday, position, shared }) => (
            <li key={matchday}>
              <span>Kolejka {matchday}</span>
              <strong>{position}. miejsce</strong>
              {shared && <span>Dzielone</span>}
            </li>
          ))}
        </ol>
      ) : (
        <ol
          className="team-progress-values"
          data-mode={mode}
          aria-label={
            mode === "points" ? "Punkty narastająco według kolejki" : "Bramki w każdej kolejce"
          }
        >
          {results.map(({ matchday, result }) => (
            <li key={matchday}>
              <span>Kolejka {matchday}</span>
              {result === null ? (
                <strong data-missing="true">
                  <span className="sr-only">Brak wyniku</span>
                  <span aria-hidden="true">—</span>
                </strong>
              ) : mode === "points" ? (
                <strong>{result.points} pkt</strong>
              ) : (
                <dl className="team-progress-goal-values">
                  <div>
                    <dt>Zdobyte</dt>
                    <dd>{result.goalsFor}</dd>
                  </div>
                  <div data-conceded>
                    <dt>Stracone</dt>
                    <dd>{result.goalsAgainst}</dd>
                  </div>
                </dl>
              )}
            </li>
          ))}
        </ol>
      )}
    </figure>
  );
}

export function TeamLeagueProgress({
  seasonCode,
  reduceMotion = false,
}: {
  seasonCode: string;
  reduceMotion?: boolean;
}) {
  const { state, reload } = useSeasonMatches(seasonCode, true);
  const data = state.data?.season.code === seasonCode ? state.data : undefined;
  const matches = data?.matches ?? noMatches;
  const { clubs, matchdays } = useMemo(() => collectLeagueProgress(matches), [matches]);
  const [selectedClubId, setSelectedClubId] = useState("");
  const [mode, setMode] = useState<ChartMode>("points");
  const placementHistory = useMemo(
    () => (mode === "placement" ? buildLeaguePlacementHistory(matches) : []),
    [matches, mode],
  );
  const id = useId();
  const club =
    clubs.find(({ team }) => team.id === selectedClubId) ??
    clubs.find(({ results }) => results.size > 0) ??
    clubs[0];
  const placements = useMemo(() => {
    if (!club) return [];
    return placementHistory.flatMap(({ matchday, positions, sharedPositions }) => {
      const position = positions.get(club.team.id);
      if (position === undefined) return [];
      const shared =
        sharedPositions &&
        [...positions].some(([id, place]) => id !== club.team.id && place === position);
      return [{ matchday, position, shared }];
    });
  }, [club, placementHistory]);

  return (
    <section
      className="ranking-panel statistics-panel team-league-progress"
      aria-labelledby={`${id}-title`}
    >
      <div className="team-progress-header">
        <h2 id={`${id}-title`}>
          <ChartNoAxesColumnIncreasing aria-hidden="true" /> Przebieg fazy ligowej
        </h2>
        {club && (
          <div className="team-progress-picker">
            <label htmlFor={`${id}-club`}>Wybierz drużynę</label>
            <select
              id={`${id}-club`}
              value={club.team.id}
              onChange={(event) => setSelectedClubId(event.target.value)}
            >
              {clubs.map(({ team }) => (
                <option key={team.id} value={team.id}>
                  {team.name}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      {state.status === "loading" && !data && (
        <p className="statistics-message" role="status">
          Wczytuję mecze fazy ligowej…
        </p>
      )}
      {state.status === "error" && (
        <div className="statistics-message statistics-message-action">
          <p role="alert">
            {data
              ? "Nie udało się odświeżyć meczów. Pokazuję wcześniej wczytane dane."
              : "Nie udało się wczytać meczów fazy ligowej."}
          </p>
          <Button type="button" variant="outline" onClick={reload}>
            <RefreshCw aria-hidden="true" /> Spróbuj ponownie
          </Button>
        </div>
      )}
      {data &&
        (!club ? (
          <p className="statistics-message">
            W tym sezonie nie ma meczów z numerem kolejki fazy ligowej.
          </p>
        ) : (
          <>
            <div className="team-progress-modes" role="group" aria-label="Dane na wykresie">
              {chartModes.map(({ id, label }) => (
                <Button
                  key={id}
                  type="button"
                  variant={mode === id ? "default" : "outline"}
                  aria-pressed={mode === id}
                  onClick={() => setMode(id)}
                >
                  {label}
                </Button>
              ))}
            </div>
            {mode === "placement" && placements.length === 0 ? (
              <p className="statistics-message">Brakuje pełnych wyników od pierwszej kolejki.</p>
            ) : mode !== "placement" && club.results.size === 0 ? (
              <p className="statistics-message">
                Ta drużyna nie ma jeszcze zakończonego meczu z pełnym wynikiem.
              </p>
            ) : (
              <ClubProgressChart
                club={club}
                matchdays={matchdays}
                placements={placements}
                mode={mode}
                reduceMotion={reduceMotion}
              />
            )}
            {mode === "placement" ? (
              <p className="team-progress-note">
                Szacowane miejsca na podstawie wyników po pełnych kolejkach. Przy remisie, którego
                nie rozstrzygają dostępne dane, kluby dzielą miejsce.
              </p>
            ) : (
              <p className="team-progress-note">
                {mode === "points"
                  ? "Punkty narastająco. Za wygraną 3 pkt, za remis 1 pkt."
                  : "Bramki zdobyte i stracone w każdej kolejce."}{" "}
                Dane po 90 minutach. Kreska oznacza brak pełnego wyniku w danej kolejce.
              </p>
            )}
            <a className="team-progress-link" href="#tabela">
              Tabela fazy ligowej <ArrowRight aria-hidden="true" size={16} />
            </a>
          </>
        ))}
    </section>
  );
}
