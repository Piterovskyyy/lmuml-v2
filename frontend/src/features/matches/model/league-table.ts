import type { FootballMatch, SeasonStandings } from "../api/season-matches";
import {
  isLeagueMatch,
  isResolvedMatch,
  leaguePhaseComplete,
  LEAGUE_GAMES_PER_TEAM,
  LEAGUE_TEAM_COUNT,
} from "./competition-stage";

type Team = FootballMatch["homeTeam"];

type Totals = {
  team: Team;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  awayGoals: number;
  awayWins: number;
  points: number;
  opponents: Set<string>;
};

type ProviderRow = SeasonStandings["rows"][number];
type LeagueRow = Omit<ProviderRow, "form"> & { form?: ProviderRow["form"] };

export type LeagueTableModel = {
  rows: LeagueRow[];
  countedMatches: number;
  isFinal: boolean;
  sharedPositions: boolean;
  capturedAt: string | null;
};

function recordResult(row: Totals, goalsFor: number, goalsAgainst: number, away: boolean) {
  row.played += 1;
  row.goalsFor += goalsFor;
  row.goalsAgainst += goalsAgainst;
  if (away) row.awayGoals += goalsFor;
  if (goalsFor > goalsAgainst) {
    row.won += 1;
    row.points += 3;
    if (away) row.awayWins += 1;
  } else if (goalsFor === goalsAgainst) {
    row.drawn += 1;
    row.points += 1;
  } else {
    row.lost += 1;
  }
}

export function buildLeagueTable(
  matches: readonly FootballMatch[],
  standings?: SeasonStandings | null,
): LeagueTableModel {
  if (standings?.rows.length) {
    const rows = standings.rows.slice().sort((a, b) => a.position - b.position);
    return {
      rows,
      countedMatches: rows.reduce((count, row) => count + row.played, 0) / 2,
      isFinal:
        rows.length === LEAGUE_TEAM_COUNT &&
        rows.every((row) => row.played === LEAGUE_GAMES_PER_TEAM),
      sharedPositions: new Set(rows.map((row) => row.position)).size < rows.length,
      capturedAt: standings.capturedAt,
    };
  }
  const teams = new Map<string, Totals>();
  const league = matches.filter(isLeagueMatch);
  let countedMatches = 0;

  function totalsFor(team: Team): Totals {
    const previous = teams.get(team.id);
    if (previous) return previous;
    const totals = {
      team,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      awayGoals: 0,
      awayWins: 0,
      points: 0,
      opponents: new Set<string>(),
    };
    teams.set(team.id, totals);
    return totals;
  }

  for (const match of league) {
    const home = totalsFor(match.homeTeam);
    const away = totalsFor(match.awayTeam);
    if (!isResolvedMatch(match)) continue;
    const regulation = match.scores.regulationTime;
    const score =
      regulation.home !== null && regulation.away !== null ? regulation : match.scores.total;
    if (score.home === null || score.away === null) continue;
    countedMatches += 1;
    recordResult(home, score.home, score.away, false);
    recordResult(away, score.away, score.home, true);
    home.opponents.add(away.team.id);
    away.opponents.add(home.team.id);
  }

  // Opponent totals apply after the league phase. The catalog has no disciplinary
  // points or coefficients, so a residual tie shares a position.
  const isFinal = leaguePhaseComplete(matches) && countedMatches === league.length;
  const ranked = Array.from(teams.values(), (row) => {
    const difference = row.goalsFor - row.goalsAgainst;
    const criteria = [row.points, difference, row.goalsFor, row.awayGoals, row.won, row.awayWins];
    if (isFinal) {
      let points = 0;
      let goalDifference = 0;
      let goals = 0;
      for (const opponentId of row.opponents) {
        const opponent = teams.get(opponentId)!;
        points += opponent.points;
        goalDifference += opponent.goalsFor - opponent.goalsAgainst;
        goals += opponent.goalsFor;
      }
      criteria.push(points, goalDifference, goals);
    }
    return { row, difference, criteria };
  });
  const compare = (a: (typeof ranked)[number], b: (typeof ranked)[number]) => {
    for (const [index, criterion] of a.criteria.entries()) {
      const difference = b.criteria[index] - criterion;
      if (difference) return difference;
    }
    return 0;
  };
  ranked.sort((a, b) => compare(a, b) || a.row.team.name.localeCompare(b.row.team.name, "pl"));

  let position = 0;
  let sharedPositions = false;
  const rows: LeagueRow[] = ranked.map((entry, index) => {
    if (index === 0 || compare(ranked[index - 1], entry) !== 0) {
      position = index + 1;
    } else {
      sharedPositions = true;
    }
    const { team, played, won, drawn, lost, goalsFor, goalsAgainst, points } = entry.row;
    return {
      team,
      played,
      won,
      drawn,
      lost,
      goalsFor,
      goalsAgainst,
      points,
      position,
      goalDifference: entry.difference,
    };
  });
  return { rows, countedMatches, isFinal, sharedPositions, capturedAt: null };
}
