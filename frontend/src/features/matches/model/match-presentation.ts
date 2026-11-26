import type { FootballMatch, ScorePair } from "../api/season-matches";
import { FinishType, MatchState } from "./match-status";

export const DISPLAY_TIME_ZONE = "Europe/Warsaw";

export type MatchFilter = "all" | "finished" | "upcoming" | "live";

export interface MatchDateGroup {
  key: string;
  label: string;
  matches: FootballMatch[];
}

export interface ScoreDetail {
  label: string;
  score: string;
}

const emptyScore: ScorePair = { home: null, away: null };
const statusLabels: Record<MatchState, string> = {
  [MatchState.TimeUnconfirmed]: "Termin niepotwierdzony",
  [MatchState.Scheduled]: "Zaplanowany",
  [MatchState.Live]: "Na żywo",
  [MatchState.Break]: "Przerwa",
  [MatchState.Suspended]: "Wstrzymany",
  [MatchState.Finished]: "Zakończony",
  [MatchState.Postponed]: "Przełożony",
  [MatchState.Cancelled]: "Odwołany",
  [MatchState.Abandoned]: "Niedokończony",
  [MatchState.Awarded]: "Wynik administracyjny",
  [MatchState.Unknown]: "Status nieznany",
};

export function statusLabel(match: FootballMatch): string {
  return statusLabels[match.status.state];
}

export function formatScore(score: ScorePair): string {
  return `${score.home ?? "—"} : ${score.away ?? "—"}`;
}

export function primaryScore(match: FootballMatch): ScorePair {
  const { state } = match.status;
  if (state === MatchState.Finished) return match.scores.regulationTime;
  if (
    [MatchState.Live, MatchState.Break, MatchState.Suspended, MatchState.Awarded].includes(state)
  ) {
    return match.scores.total;
  }
  return emptyScore;
}

export function primaryScoreLabel(match: FootballMatch): string {
  return match.status.state === MatchState.Finished ? "Po 90 min" : "Wynik meczu";
}

export function scoreDetails(match: FootballMatch): ScoreDetail[] {
  if (match.status.state !== MatchState.Finished) return [];
  const details: ScoreDetail[] = [];
  const finishType = match.status.finishType;
  if (finishType === FinishType.ExtraTime || finishType === FinishType.Penalties) {
    details.push({ label: "Po dogrywce", score: formatScore(match.scores.total) });
  }
  if (finishType === FinishType.Penalties) {
    details.push({ label: "Karne", score: formatScore(match.scores.penalties) });
  }
  return details;
}

export function formatKickoffTime(kickoffAt: string | null, timeZone = DISPLAY_TIME_ZONE): string {
  if (!kickoffAt || !Number.isFinite(Date.parse(kickoffAt))) return "—";
  return new Intl.DateTimeFormat("pl-PL", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(kickoffAt));
}

export function groupMatchesByDate(
  matches: readonly FootballMatch[],
  timeZone = DISPLAY_TIME_ZONE,
): MatchDateGroup[] {
  const dayFormatter = new Intl.DateTimeFormat("pl-PL", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const labelFormatter = new Intl.DateTimeFormat("pl-PL", {
    timeZone,
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
  const groups = new Map<string, MatchDateGroup>();
  for (const match of matches) {
    const date = match.kickoffAt ? new Date(match.kickoffAt) : null;
    const hasDate = date !== null && Number.isFinite(date.getTime());
    let key = "unknown";
    if (hasDate) {
      const parts = dayFormatter.formatToParts(date);
      const part = (type: Intl.DateTimeFormatPartTypes) =>
        parts.find((item) => item.type === type)?.value;
      key = `${part("year")}-${part("month")}-${part("day")}`;
    }
    const group = groups.get(key) ?? {
      key,
      label: hasDate ? labelFormatter.format(date) : "Termin do ustalenia",
      matches: [],
    };
    group.matches.push(match);
    groups.set(key, group);
  }
  return [...groups.values()].sort((a, b) => {
    if (a.key === "unknown") return b.key === "unknown" ? 0 : 1;
    if (b.key === "unknown") return -1;
    return a.key.localeCompare(b.key);
  });
}

export function normalizedSearch(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .replace(/ł/gi, "l")
    .toLocaleLowerCase("pl-PL");
}

export function filterMatches(
  matches: readonly FootballMatch[],
  query: string,
  filter: MatchFilter = "all",
): FootballMatch[] {
  const terms = normalizedSearch(query.trim()).split(/\s+/).filter(Boolean);
  return matches.filter((match) => {
    const { state } = match.status;
    const matchesFilter =
      filter === "all" ||
      (filter === "finished" && state === MatchState.Finished) ||
      (filter === "upcoming" &&
        [MatchState.Scheduled, MatchState.TimeUnconfirmed].includes(state)) ||
      (filter === "live" && [MatchState.Live, MatchState.Break].includes(state));
    const searchable = normalizedSearch(
      `${match.homeTeam.name} ${match.awayTeam.name} ${match.tournamentRound ?? ""}`,
    );
    return matchesFilter && terms.every((term) => searchable.includes(term));
  });
}
