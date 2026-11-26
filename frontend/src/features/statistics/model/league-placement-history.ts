import type { FootballMatch } from "@/features/matches/api/season-matches";
import {
  isLeagueMatch,
  LEAGUE_GAMES_PER_TEAM,
  LEAGUE_TEAM_COUNT,
} from "@/features/matches/model/competition-stage";
import { buildLeagueTable } from "@/features/matches/model/league-table";
import { MatchState } from "@/features/matches/model/match-status";

export type LeaguePlacement = {
  matchday: number;
  positions: ReadonlyMap<string, number>;
  sharedPositions: boolean;
};

export function leagueMatchday(match: FootballMatch): number | null {
  if (!isLeagueMatch(match)) return null;
  const day = Number(match.tournamentRound?.split(" - ")[1]);
  return Number.isSafeInteger(day) && day > 0 ? day : null;
}

function hasCompleteResult(match: FootballMatch): boolean {
  const { regulationTime, total } = match.scores;
  const regulationComplete = regulationTime.home !== null && regulationTime.away !== null;
  if (match.status.state === MatchState.Finished) return regulationComplete;
  return (
    match.status.state === MatchState.Awarded &&
    (regulationComplete || (total.home !== null && total.away !== null))
  );
}

function completeMatchdayTeams(fixtures: readonly FootballMatch[]): Set<string> | null {
  if (fixtures.length !== LEAGUE_TEAM_COUNT / 2) return null;
  const teams = new Set<string>();
  for (const match of fixtures) {
    const home = match.homeTeam.id;
    const away = match.awayTeam.id;
    if (home === away || teams.has(home) || teams.has(away) || !hasCompleteResult(match)) {
      return null;
    }
    teams.add(home);
    teams.add(away);
  }
  return teams;
}

export function buildLeaguePlacementHistory(matches: readonly FootballMatch[]): LeaguePlacement[] {
  const byMatchday = new Map<number, FootballMatch[]>();
  for (const match of matches) {
    const day = leagueMatchday(match);
    if (day === null || day > LEAGUE_GAMES_PER_TEAM) continue;
    const fixtures = byMatchday.get(day);
    if (fixtures) fixtures.push(match);
    else byMatchday.set(day, [match]);
  }

  let leagueTeams: Set<string> | null = null;
  const played: FootballMatch[] = [];
  const history: LeaguePlacement[] = [];
  for (let matchday = 1; matchday <= LEAGUE_GAMES_PER_TEAM; matchday += 1) {
    const fixtures = byMatchday.get(matchday);
    if (!fixtures) break;
    const teams = completeMatchdayTeams(fixtures);
    if (!teams || (leagueTeams && [...leagueTeams].some((team) => !teams.has(team)))) break;

    leagueTeams ??= teams;
    played.push(...fixtures);
    const table = buildLeagueTable(played);
    history.push({
      matchday,
      positions: new Map(table.rows.map(({ team, position }) => [team.id, position])),
      sharedPositions: table.sharedPositions,
    });
  }
  return history;
}
