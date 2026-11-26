import type { FootballMatch } from "../api/season-matches";
import { MatchState } from "./match-status";

export enum TournamentStage {
  League = "League Stage",
  KnockoutPlayOff = "Knockout Round Play-offs",
  RoundOf16 = "Round of 16",
  QuarterFinal = "Quarter-finals",
  SemiFinal = "Semi-finals",
  Final = "Final",
}

export enum CompetitionPhase {
  League = "league",
  Knockout = "knockout",
  FixturesOnly = "fixtures-only",
}

export const knockoutStages = [
  TournamentStage.KnockoutPlayOff,
  TournamentStage.RoundOf16,
  TournamentStage.QuarterFinal,
  TournamentStage.SemiFinal,
  TournamentStage.Final,
] as const;

export type KnockoutStage = (typeof knockoutStages)[number];

export const LEAGUE_TEAM_COUNT = 36;
export const LEAGUE_GAMES_PER_TEAM = 8;
const LEAGUE_FIXTURE_COUNT = (LEAGUE_TEAM_COUNT * LEAGUE_GAMES_PER_TEAM) / 2;

export function tournamentStage(round: string | null): TournamentStage | null {
  if (round === TournamentStage.League || /^League Stage - \d+$/.test(round ?? "")) {
    return TournamentStage.League;
  }
  return knockoutStages.find((stage) => stage === round) ?? null;
}

export function isLeagueMatch(match: FootballMatch): boolean {
  return tournamentStage(match.tournamentRound) === TournamentStage.League;
}

export function isResolvedMatch(match: FootballMatch): boolean {
  const { state } = match.status;
  return state === MatchState.Finished || state === MatchState.Awarded;
}

export function leaguePhaseComplete(matches: readonly FootballMatch[]): boolean {
  const league = matches.filter(isLeagueMatch);
  return league.length === LEAGUE_FIXTURE_COUNT && league.every(isResolvedMatch);
}

export function competitionPhase(matches: readonly FootballMatch[]): CompetitionPhase {
  const league = matches.some(isLeagueMatch);
  const knockout = matches.filter((match) => {
    const stage = tournamentStage(match.tournamentRound);
    return stage !== null && stage !== TournamentStage.League;
  });
  const startedKnockout = knockout.some((match) => {
    const { state } = match.status;
    return (
      state === MatchState.Live ||
      state === MatchState.Break ||
      state === MatchState.Suspended ||
      isResolvedMatch(match)
    );
  });

  if (knockout.length > 0 && (!league || leaguePhaseComplete(matches) || startedKnockout)) {
    return CompetitionPhase.Knockout;
  }
  return league ? CompetitionPhase.League : CompetitionPhase.FixturesOnly;
}
