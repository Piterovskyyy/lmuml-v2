import { expect, it } from "vitest";
import type { FootballMatch } from "@/features/matches/api/season-matches";
import { LEAGUE_TEAM_COUNT } from "@/features/matches/model/competition-stage";
import { FinishType, MatchState } from "@/features/matches/model/match-status";
import { buildLeaguePlacementHistory, leagueMatchday } from "./league-placement-history";

const missingScore = { home: null, away: null };
const halfLeague = LEAGUE_TEAM_COUNT / 2;

function team(index: number) {
  return { id: `team-${index}`, name: `Klub ${index}`, logoUrl: null };
}

function matchday(day: number): FootballMatch[] {
  return Array.from({ length: halfLeague }, (_, fixture) => ({
    id: `${day}-${fixture}`,
    tournamentRound: `League Stage - ${day}`,
    kickoffAt: null,
    status: {
      state: MatchState.Finished,
      finishType: FinishType.RegulationTime,
      elapsedMinutes: 90,
      extraMinutes: null,
    },
    homeTeam: team(fixture),
    awayTeam: team(halfLeague + ((fixture + day - 1) % halfLeague)),
    scores: {
      total: { home: 2, away: 1 },
      regulationTime: { home: 2, away: 1 },
      halfTime: missingScore,
      extraTime: missingScore,
      penalties: missingScore,
    },
    homeWinner: true,
    awayWinner: false,
  }));
}

it("parses league matchdays without assigning a number to other rounds", () => {
  const fixture = matchday(3)[0];
  expect(leagueMatchday(fixture)).toBe(3);
  for (const tournamentRound of [null, "League Stage", "League Stage - 0", "Play-offs - 1"]) {
    expect(leagueMatchday({ ...fixture, tournamentRound })).toBeNull();
  }
});

it("recalculates positions after each complete round, keeping ties and excluding other rounds", () => {
  const first = matchday(1);
  const second = matchday(2);
  second[0].scores.regulationTime = { home: 0, away: 3 };
  const qualifier = { ...first[0], id: "qualifier", tournamentRound: "Play-offs" };
  const history = buildLeaguePlacementHistory([
    ...second,
    qualifier,
    ...matchday(3).slice(1),
    ...first,
  ]);

  expect(history.map(({ matchday }) => matchday)).toEqual([1, 2]);
  expect(history[0].positions.size).toBe(LEAGUE_TEAM_COUNT);
  expect(history[0].sharedPositions).toBe(true);
  expect(history.map(({ positions }) => positions.get(team(0).id))).toEqual([1, 19]);
});

it("requires every prior matchday and the same clubs in every included round", () => {
  const first = matchday(1);
  const second = matchday(2);
  const third = matchday(3);
  expect(buildLeaguePlacementHistory([...first, ...third])).toHaveLength(1);
  second[0].homeTeam = team(LEAGUE_TEAM_COUNT);
  expect(buildLeaguePlacementHistory([...first, ...second, ...third])).toHaveLength(1);
  second[0].homeTeam = second[1].homeTeam;
  expect(buildLeaguePlacementHistory([...first, ...second, ...third])).toHaveLength(1);
  expect(buildLeaguePlacementHistory(third)).toEqual([]);
});

it("requires a resolved regulation result or a complete awarded result", () => {
  const first = matchday(1);
  const second = matchday(2);
  const fixture = second[0];
  fixture.status.state = MatchState.Live;
  expect(buildLeaguePlacementHistory([...first, ...second])).toHaveLength(1);

  fixture.status.state = MatchState.Finished;
  fixture.scores.regulationTime = { home: null, away: 1 };
  expect(buildLeaguePlacementHistory([...first, ...second])).toHaveLength(1);

  fixture.status.state = MatchState.Awarded;
  expect(buildLeaguePlacementHistory([...first, ...second])).toHaveLength(2);
  fixture.scores.total = { home: 2, away: null };
  expect(buildLeaguePlacementHistory([...first, ...second])).toHaveLength(1);
});
