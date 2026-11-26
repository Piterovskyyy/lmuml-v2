import type { FootballMatch } from "../api/season-matches";
import {
  isResolvedMatch,
  knockoutStages,
  tournamentStage,
  TournamentStage,
  type KnockoutStage,
} from "./competition-stage";
import { FinishType } from "./match-status";
import { roundLabel } from "./round-label";

type Team = FootballMatch["homeTeam"];
type Pair = [number, number];

export type KnockoutTie = {
  id: string;
  teams: [Team, Team];
  legs: FootballMatch[];
  aggregate: Pair | null;
  penalties: Pair | null;
  winnerId: string | null;
  nextTieId: string | null;
};

export type KnockoutRound = { id: KnockoutStage; name: string; ties: KnockoutTie[] };

function legOrder(a: FootballMatch, b: FootballMatch): number {
  const kickoff = (match: FootballMatch) =>
    match.kickoffAt ? Date.parse(match.kickoffAt) : Number.MAX_SAFE_INTEGER;
  return kickoff(a) - kickoff(b) || a.id.localeCompare(b.id);
}

function orientedScore(match: FootballMatch, firstId: string, penalties = false): Pair | null {
  const score = penalties ? match.scores.penalties : match.scores.total;
  const { home, away } = score;
  if (home === null || away === null) return null;
  return match.homeTeam.id === firstId ? [home, away] : [away, home];
}

function buildTie(id: string, fixtures: FootballMatch[], final: boolean): KnockoutTie {
  const legs = fixtures.slice().sort(legOrder);
  const teams: [Team, Team] = [legs[0].homeTeam, legs[0].awayTeam];
  const last = legs.at(-1)!;
  const scores = legs.map((match) => orientedScore(match, teams[0].id));
  const complete =
    legs.length === (final ? 1 : 2) &&
    legs.every(isResolvedMatch) &&
    (final || legs[0].homeTeam.id !== last.homeTeam.id);
  const aggregate =
    complete && scores.every((score) => score !== null)
      ? scores.reduce<Pair>((sum, score) => [sum[0] + score[0], sum[1] + score[1]], [0, 0])
      : null;
  const penalties =
    aggregate && aggregate[0] === aggregate[1] && last.status.finishType === FinishType.Penalties
      ? orientedScore(last, teams[0].id, true)
      : null;
  const deciding = penalties ?? aggregate;
  const winnerId =
    deciding && deciding[0] !== deciding[1] ? teams[deciding[0] > deciding[1] ? 0 : 1].id : null;
  return { id, teams, legs, aggregate, penalties, winnerId, nextTieId: null };
}

export function buildKnockoutBracket(matches: readonly FootballMatch[]): KnockoutRound[] {
  const rounds: KnockoutRound[] = [];
  for (const stage of knockoutStages) {
    const pairs = new Map<string, FootballMatch[]>();
    for (const match of matches) {
      if (tournamentStage(match.tournamentRound) !== stage) continue;
      const key = [match.homeTeam.id, match.awayTeam.id].sort().join(":");
      const pair = pairs.get(key) ?? [];
      pair.push(match);
      pairs.set(key, pair);
    }
    if (pairs.size === 0) continue;
    const ties = Array.from(pairs, ([key, fixtures]) =>
      buildTie(`${stage}:${key}`, fixtures, stage === TournamentStage.Final),
    );
    ties.sort((a, b) => legOrder(a.legs[0], b.legs[0]));
    rounds.push({ id: stage, name: roundLabel(stage), ties });
  }

  // Order each column by the path into the next confirmed round.
  for (let index = rounds.length - 2; index >= 0; index -= 1) {
    const current = rounds[index];
    const next = rounds[index + 1];
    if (knockoutStages.indexOf(next.id) !== knockoutStages.indexOf(current.id) + 1) continue;

    const positions = new Map<string, number>();
    next.ties.forEach((tie, position) => {
      positions.set(tie.id, position);
    });
    for (const tie of current.ties) {
      if (!tie.winnerId) continue;
      tie.nextTieId =
        next.ties.find((candidate) => candidate.teams.some((team) => team.id === tie.winnerId))
          ?.id ?? null;
    }
    const positionFor = (tie: KnockoutTie) =>
      tie.nextTieId ? (positions.get(tie.nextTieId) ?? Infinity) : Infinity;
    current.ties.sort((a, b) => positionFor(a) - positionFor(b) || legOrder(a.legs[0], b.legs[0]));
  }
  return rounds;
}
