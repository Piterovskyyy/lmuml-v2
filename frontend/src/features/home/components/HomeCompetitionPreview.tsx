import { ArrowRight, CalendarDays, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { FootballMatch } from "@/features/matches/api/season-matches";
import { useSeasonMatches } from "@/features/matches/api/use-season-matches";
import {
  competitionPhase,
  CompetitionPhase,
  isResolvedMatch,
} from "@/features/matches/model/competition-stage";
import { buildKnockoutBracket } from "@/features/matches/model/knockout-bracket";
import { buildLeagueTable } from "@/features/matches/model/league-table";
import { MatchState } from "@/features/matches/model/match-status";
import { HomeFixtureRow, HomePreviewTeam } from "./HomeFixtureRow";
import { HomeLeagueStatistics } from "./HomeLeagueStatistics";
import "./home-preview.css";

const PREVIEW_MATCHES = 3;
const PREVIEW_STANDINGS = 5;

function selectMatches(matches: readonly FootballMatch[], now: number) {
  const dated = matches.flatMap((match) =>
    match.kickoffAt ? [{ match, kickoff: Date.parse(match.kickoffAt) }] : [],
  );
  const upcoming = dated
    .filter(({ kickoff, match }) => kickoff > now && match.status.state === MatchState.Scheduled)
    .sort((a, b) => a.kickoff - b.kickoff);
  const recent = dated
    .filter(({ kickoff, match }) => kickoff <= now && isResolvedMatch(match))
    .sort((a, b) => b.kickoff - a.kickoff);
  const hasUpcoming = upcoming.length > 0;
  return {
    title: hasUpcoming || recent.length === 0 ? "Najbliższe mecze" : "Ostatnie wyniki",
    matches: (hasUpcoming ? upcoming : recent).slice(0, PREVIEW_MATCHES).map(({ match }) => match),
  };
}

export function HomeCompetitionPreview({ seasonCode }: { seasonCode: string }) {
  const { state, reload } = useSeasonMatches(seasonCode, true);
  const data = state.data?.season.code === seasonCode ? state.data : undefined;

  if (!data) {
    return (
      <div className="home-preview-panel home-preview-message">
        {state.status === "error" ? (
          <>
            <p role="alert">Nie udało się wczytać rozgrywek.</p>
            <Button type="button" variant="outline" onClick={reload}>
              Spróbuj ponownie
            </Button>
          </>
        ) : (
          <p role="status">Wczytujemy rozgrywki…</p>
        )}
      </div>
    );
  }

  const preview = selectMatches(data.matches, Date.now());
  const phase = competitionPhase(data.matches);
  const bracket = phase === CompetitionPhase.Knockout ? buildKnockoutBracket(data.matches) : [];
  const round =
    bracket.find(({ ties }) =>
      ties.some(({ legs }) => legs.some((match) => !isResolvedMatch(match))),
    ) ?? bracket.at(-1);
  const table = buildLeagueTable(data.matches, data.standings);
  const hasStandings = table.rows.length > 0 && table.countedMatches > 0;

  return (
    <div className="home-competition-preview">
      {state.status === "error" && (
        <div className="home-preview-panel home-preview-message" role="status">
          <p>Pokazujemy ostatnio wczytane wyniki.</p>
          <Button type="button" variant="outline" onClick={reload}>
            Odśwież
          </Button>
        </div>
      )}
      <section className="home-preview-panel" aria-labelledby="home-fixtures-title">
        <h2 id="home-fixtures-title" className="home-preview-heading">
          <CalendarDays aria-hidden="true" size={21} /> {preview.title}
        </h2>
        <p className="home-preview-season">{data.season.name}</p>
        {preview.matches.length > 0 ? (
          <ul className="home-fixture-list">
            {preview.matches.map((match) => (
              <li key={match.id}>
                <HomeFixtureRow match={match} />
              </li>
            ))}
          </ul>
        ) : (
          <p className="home-preview-empty">
            Nie ma jeszcze meczów z potwierdzoną datą lub wynikiem.
          </p>
        )}
        <a className="home-preview-link" href="#mecze">
          Pełny terminarz <ArrowRight aria-hidden="true" size={16} />
        </a>
      </section>
      <section className="home-preview-panel" aria-labelledby="home-standings-title">
        <h2 id="home-standings-title" className="home-preview-heading">
          <Trophy aria-hidden="true" size={21} /> {round ? "Drabinka" : "Czołówka tabeli"}
        </h2>
        {round ? (
          <>
            <h3 className="home-bracket-stage">{round.name}</h3>
            <ul className="home-bracket-list">
              {round.ties.slice(0, PREVIEW_MATCHES).map((tie) => (
                <li key={tie.id}>
                  {tie.teams.map((team, index) => (
                    <div className="home-bracket-team" key={team.id}>
                      <HomePreviewTeam team={team} />
                      {tie.aggregate && <strong>{tie.aggregate[index]}</strong>}
                    </div>
                  ))}
                  {tie.penalties && (
                    <p className="home-bracket-penalties">Karne {tie.penalties.join(":")}</p>
                  )}
                </li>
              ))}
            </ul>
            <a className="home-preview-link" href="#drabinka">
              Zobacz całą drabinkę <ArrowRight aria-hidden="true" size={16} />
            </a>
          </>
        ) : hasStandings ? (
          <>
            <table className="home-standings">
              <caption className="sr-only">Czołówka tabeli rozgrywek</caption>
              <thead>
                <tr>
                  <th scope="col">Lp.</th>
                  <th scope="col">Drużyna</th>
                  <th scope="col">
                    <abbr title="Mecze">M</abbr>
                  </th>
                  <th scope="col">Pkt</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.slice(0, PREVIEW_STANDINGS).map((row) => (
                  <tr key={row.team.id}>
                    <td>{row.position}</td>
                    <th scope="row">
                      <HomePreviewTeam team={row.team} />
                    </th>
                    <td>{row.played}</td>
                    <td>{row.points}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <a className="home-preview-link" href="#tabela">
              Zobacz całą tabelę <ArrowRight aria-hidden="true" size={16} />
            </a>
          </>
        ) : (
          <p className="home-preview-empty">Tabela pojawi się po rozegraniu meczów fazy ligowej.</p>
        )}
      </section>
      <HomeLeagueStatistics data={data} />
    </div>
  );
}
