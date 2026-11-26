import { expect, it } from "vitest";
import type { FootballMatch } from "../api/season-matches";
import { competitionPhase, CompetitionPhase, TournamentStage } from "./competition-stage";
import { buildKnockoutBracket } from "./knockout-bracket";
import { buildLeagueTable } from "./league-table";
import { FinishType, MatchState } from "./match-status";

const firstTeam = { id: "a", name: "FC Północ", logoUrl: null };
const secondTeam = { id: "b", name: "KS Południe", logoUrl: null };
const missingScore = { home: null, away: null };

function fixture(overrides: Partial<FootballMatch> = {}): FootballMatch {
  return {
    id: "first",
    tournamentRound: "League Stage - 1",
    kickoffAt: "2025-02-11T20:00:00Z",
    status: {
      state: MatchState.Finished,
      finishType: FinishType.RegulationTime,
      elapsedMinutes: 90,
      extraMinutes: null,
    },
    homeTeam: firstTeam,
    awayTeam: secondTeam,
    scores: {
      total: { home: 2, away: 1 },
      regulationTime: { home: 2, away: 1 },
      halfTime: missingScore,
      extraTime: missingScore,
      penalties: missingScore,
    },
    homeWinner: null,
    awayWinner: null,
    ...overrides,
  };
}

it("keeps the league table active until knockout begins when the league is incomplete", () => {
  const league = fixture();
  const playOff = fixture({ tournamentRound: TournamentStage.KnockoutPlayOff });
  playOff.status.state = MatchState.Scheduled;
  expect(competitionPhase([league, playOff])).toBe(CompetitionPhase.League);

  playOff.status.state = MatchState.Live;
  expect(competitionPhase([league, playOff])).toBe(CompetitionPhase.Knockout);
});

it("only scores completed league games and keeps clubs with an upcoming league match", () => {
  const game = fixture();
  const qualifier = fixture({ id: "qualifier", tournamentRound: "Play-offs" });
  const upcoming = fixture({
    id: "upcoming",
    awayTeam: { id: "c", name: "AC Wschód", logoUrl: null },
  });
  upcoming.status.state = MatchState.Scheduled;
  const table = buildLeagueTable([game, qualifier, upcoming]);

  expect(table.countedMatches).toBe(1);
  expect(table.rows.map((row) => [row.position, row.team.id, row.played, row.points])).toEqual([
    [1, "a", 1, 3],
    [2, "c", 0, 0],
    [3, "b", 1, 0],
  ]);
});

it("uses the imported rank when the provider table is available", () => {
  const game = fixture();
  const [winner, loser] = buildLeagueTable([game]).rows;
  const table = buildLeagueTable([game], {
    capturedAt: "2026-11-04T16:30:00Z",
    rows: [
      { ...winner, position: 2, form: null },
      { ...loser, position: 1, form: null },
    ],
  });

  expect(table.rows.map((row) => row.team.id)).toEqual([secondTeam.id, firstTeam.id]);
  expect(table.capturedAt).toBe("2026-11-04T16:30:00Z");
});

it("orients reversed legs, decides a tied aggregate on penalties and links the winner", () => {
  const first = fixture({ tournamentRound: TournamentStage.RoundOf16 });
  const second = fixture({
    id: "second",
    tournamentRound: TournamentStage.RoundOf16,
    kickoffAt: "2025-02-18T20:00:00Z",
    homeTeam: secondTeam,
    awayTeam: firstTeam,
  });
  second.status.finishType = FinishType.Penalties;
  second.scores.penalties = { home: 4, away: 5 };
  const next = fixture({
    id: "next",
    tournamentRound: TournamentStage.QuarterFinal,
    awayTeam: { id: "c", name: "AC Wschód", logoUrl: null },
  });

  expect(buildKnockoutBracket([first])[0].ties[0].aggregate).toBeNull();
  const [round, following] = buildKnockoutBracket([next, second, first]);
  expect(round.ties[0]).toMatchObject({
    aggregate: [3, 3],
    penalties: [5, 4],
    winnerId: firstTeam.id,
    nextTieId: following.ties[0].id,
  });
});
