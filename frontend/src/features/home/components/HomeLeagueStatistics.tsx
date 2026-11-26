import { ArrowRight, ChartNoAxesColumn } from "lucide-react";
import { TeamCrest } from "@/components/football/TeamCrest";
import type { FootballMatch, SeasonMatchesResponse } from "@/features/matches/api/season-matches";
import { MatchState } from "@/features/matches/model/match-status";
import "./home-league-statistics.css";

const numberFormat = new Intl.NumberFormat("pl-PL");
const averageFormat = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat("pl-PL", {
  style: "percent",
  maximumFractionDigits: 1,
});
const teamNameOrder = new Intl.Collator("pl-PL");

const outcomes = [
  { id: "home", label: "Wygrane gospodarzy" },
  { id: "draw", label: "Remisy" },
  { id: "away", label: "Wygrane gości" },
] as const;

type Team = FootballMatch["homeTeam"];

function summarizeSeason(matches: readonly FootballMatch[]) {
  const results = { home: 0, draw: 0, away: 0 };
  const goalsByTeam = new Map<string, { team: Team; goals: number }>();
  let played = 0;
  let goals = 0;

  function addGoals(team: Team, scored: number) {
    if (scored === 0) return;
    const previous = goalsByTeam.get(team.id)?.goals ?? 0;
    goalsByTeam.set(team.id, { team, goals: previous + scored });
  }

  for (const match of matches) {
    const { home, away } = match.scores.regulationTime;
    if (match.status.state !== MatchState.Finished || home === null || away === null) continue;

    played += 1;
    goals += home + away;
    if (home > away) results.home += 1;
    else if (home < away) results.away += 1;
    else results.draw += 1;
    addGoals(match.homeTeam, home);
    addGoals(match.awayTeam, away);
  }

  const topScoringTeams = [...goalsByTeam.values()]
    .sort((a, b) => b.goals - a.goals || teamNameOrder.compare(a.team.name, b.team.name))
    .slice(0, 3);
  return { played, goals, results, topScoringTeams };
}

export function HomeLeagueStatistics({ data }: { data: SeasonMatchesResponse }) {
  const { played, goals, results, topScoringTeams } = summarizeSeason(data.matches);
  const bestGoals = topScoringTeams[0]?.goals ?? 1;

  return (
    <section
      className="home-preview-panel home-league-statistics"
      id="home-league-statistics"
      aria-labelledby="home-league-statistics-title"
    >
      <h2 id="home-league-statistics-title" className="home-preview-heading">
        <ChartNoAxesColumn aria-hidden="true" size={21} /> Statystyki rozgrywek
      </h2>
      <p className="home-preview-season">{data.season.name}</p>
      {played === 0 ? (
        <p className="home-preview-empty">Statystyki pojawią się po pierwszym meczu z wynikiem.</p>
      ) : (
        <>
          <dl className="home-league-metrics">
            <div>
              <dt>Mecze z wynikiem</dt>
              <dd>{numberFormat.format(played)}</dd>
            </div>
            <div>
              <dt>Bramki</dt>
              <dd>{numberFormat.format(goals)}</dd>
            </div>
            <div>
              <dt>Bramki na mecz</dt>
              <dd>{averageFormat.format(goals / played)}</dd>
            </div>
          </dl>
          <div className="home-league-charts">
            <section aria-labelledby="home-league-outcomes-title">
              <h3 id="home-league-outcomes-title">Jak kończą się mecze</h3>
              <ul className="home-league-bars">
                {outcomes.map(({ id, label }) => {
                  const share = results[id] / played;
                  return (
                    <li key={id}>
                      <div className="home-league-bar-label">
                        <span>{label}</span>
                        <strong>{percentFormat.format(share)}</strong>
                      </div>
                      <div className="home-league-bar-track" aria-hidden="true">
                        <span data-outcome={id} style={{ width: `${share * 100}%` }} />
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
            <section aria-labelledby="home-league-scoring-title">
              <h3 id="home-league-scoring-title">Najwięcej bramek</h3>
              {topScoringTeams.length > 0 ? (
                <ol className="home-league-bars">
                  {topScoringTeams.map(({ team, goals }) => (
                    <li key={team.id}>
                      <div className="home-league-bar-label">
                        <span className="home-league-team">
                          <TeamCrest name={team.name} logoUrl={team.logoUrl} /> {team.name}
                        </span>
                        <strong>{numberFormat.format(goals)}</strong>
                      </div>
                      <div className="home-league-bar-track" aria-hidden="true">
                        <span style={{ width: `${(goals / bestGoals) * 100}%` }} />
                      </div>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="home-preview-empty">W tych meczach nie padły jeszcze bramki.</p>
              )}
            </section>
          </div>
          <p className="home-league-note">Wyniki po 90 minutach z zakończonych meczów sezonu.</p>
          <a className="home-preview-link" href="#statystyki">
            Punkty drużyn po kolejkach <ArrowRight size={16} aria-hidden="true" />
          </a>
        </>
      )}
    </section>
  );
}
