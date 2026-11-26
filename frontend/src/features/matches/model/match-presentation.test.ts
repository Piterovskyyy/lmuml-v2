import { FinishType, MatchState } from "./match-status";
import { describe, expect, it } from "vitest";
import type { FootballMatch } from "../api/season-matches";
import {
  filterMatches,
  formatKickoffTime,
  formatScore,
  groupMatchesByDate,
  primaryScore,
  primaryScoreLabel,
  scoreDetails,
  statusLabel,
} from "./match-presentation";

function match(overrides: Partial<FootballMatch> = {}): FootballMatch {
  return {
    id: "30000000-0000-0000-0000-000000000001",
    tournamentRound: "League Stage - 1",
    kickoffAt: "2026-10-25T00:30:00Z",
    status: {
      state: MatchState.Finished,
      finishType: FinishType.RegulationTime,
      elapsedMinutes: 90,
      extraMinutes: null,
    },
    homeTeam: { id: "20000000-0000-0000-0000-000000000001", name: "FC Północ", logoUrl: null },
    awayTeam: { id: "20000000-0000-0000-0000-000000000002", name: "KS Południe", logoUrl: null },
    scores: {
      total: { home: 0, away: 0 },
      halfTime: { home: 0, away: 0 },
      regulationTime: { home: 0, away: 0 },
      extraTime: { home: null, away: null },
      penalties: { home: null, away: null },
    },
    homeWinner: null,
    awayWinner: null,
    ...overrides,
  };
}

describe("score presentation", () => {
  it("distinguishes 0:0, absent scores and a partially known score", () => {
    expect(formatScore({ home: 0, away: 0 })).toBe("0 : 0");
    expect(formatScore({ home: null, away: null })).toBe("— : —");
    expect(formatScore({ home: 1, away: null })).toBe("1 : —");
  });

  it.each([FinishType.ExtraTime, FinishType.Penalties])(
    "keeps 90 minutes separate from %s",
    (finishType) => {
      const fixture = match({
        status: { state: MatchState.Finished, finishType, elapsedMinutes: 120, extraMinutes: 7 },
        scores: {
          total: { home: 1, away: 1 },
          halfTime: { home: 0, away: 0 },
          regulationTime: { home: 1, away: 0 },
          extraTime: { home: 0, away: 1 },
          penalties: { home: 5, away: 4 },
        },
      });
      expect(primaryScore(fixture)).toEqual({ home: 1, away: 0 });
      expect(primaryScoreLabel(fixture)).toBe("Po 90 min");
      expect(scoreDetails(fixture)).toEqual(
        finishType === FinishType.Penalties
          ? [
              { label: "Po dogrywce", score: "1 : 1" },
              { label: "Karne", score: "5 : 4" },
            ]
          : [{ label: "Po dogrywce", score: "1 : 1" }],
      );
    },
  );

  it("does not fill missing regulation time with a different total score", () => {
    const fixture = match();
    fixture.scores.regulationTime = { home: null, away: null };
    fixture.scores.total = { home: 3, away: 2 };
    expect(formatScore(primaryScore(fixture))).toBe("— : —");
  });

  it("uses the running total for live matches without calling it a regulation-time result", () => {
    const fixture = match({
      status: { state: MatchState.Live, finishType: null, elapsedMinutes: 72, extraMinutes: null },
    });
    fixture.scores.total = { home: 2, away: 1 };
    expect(primaryScore(fixture)).toEqual({ home: 2, away: 1 });
    expect(primaryScoreLabel(fixture)).toBe("Wynik meczu");
    expect(scoreDetails(fixture)).toEqual([]);
  });

  it("gives an unknown status a safe label", () => {
    expect(
      statusLabel(
        match({
          status: {
            state: MatchState.Unknown,
            finishType: null,
            elapsedMinutes: null,
            extraMinutes: null,
          },
        }),
      ),
    ).toBe("Status nieznany");
  });
});

describe("dates in the display timezone", () => {
  it("groups by the Polish date rather than the UTC date", () => {
    const fixture = match({ kickoffAt: "2026-07-08T22:30:00Z" });
    expect(groupMatchesByDate([fixture])[0].key).toBe("2026-07-09");
    expect(formatKickoffTime(fixture.kickoffAt)).toBe("00:30");
  });

  it("handles the repeated wall-clock time across the daylight-saving transition", () => {
    const before = match({ kickoffAt: "2026-10-25T00:30:00Z" });
    const after = match({ id: "second", kickoffAt: "2026-10-25T01:30:00Z" });
    expect(formatKickoffTime(before.kickoffAt)).toBe("02:30");
    expect(formatKickoffTime(after.kickoffAt)).toBe("02:30");
    expect(groupMatchesByDate([before, after])).toHaveLength(1);
    expect(groupMatchesByDate([before, after])[0].matches).toEqual([before, after]);
  });

  it("orders date groups and leaves missing or invalid dates at the end", () => {
    const missing = match({ id: "unknown", kickoffAt: null });
    const invalid = match({ id: "invalid", kickoffAt: "not-a-date" });
    const later = match({ id: "later", kickoffAt: "2026-11-01T10:00:00Z" });
    const earlier = match({ id: "earlier", kickoffAt: "2026-07-01T10:00:00Z" });
    const groups = groupMatchesByDate([missing, later, earlier, invalid]);
    expect(groups.map((group) => group.key)).toEqual(["2026-07-01", "2026-11-01", "unknown"]);
    expect(groups[2].matches).toEqual([missing, invalid]);
    expect(formatKickoffTime(null)).toBe("—");
    expect(formatKickoffTime("not-a-date")).toBe("—");
  });
});

describe("search and filters", () => {
  it("matches Polish characters and ignores case, spaces and accents", () => {
    const fixture = match();
    expect(filterMatches([fixture], "  POLNOC  poludnie ")).toEqual([fixture]);
    expect(filterMatches([fixture], "Północ")).toEqual([fixture]);
    expect(filterMatches([fixture], "nieznana drużyna")).toEqual([]);
  });

  it("combines text with state without classifying postponed or unknown matches as upcoming", () => {
    const finished = match();
    const scheduled = match({
      id: "scheduled",
      status: {
        state: MatchState.Scheduled,
        finishType: null,
        elapsedMinutes: null,
        extraMinutes: null,
      },
    });
    const postponed = match({
      id: "postponed",
      status: {
        state: MatchState.Postponed,
        finishType: null,
        elapsedMinutes: null,
        extraMinutes: null,
      },
    });
    const unknown = match({
      id: "unknown",
      status: {
        state: MatchState.Unknown,
        finishType: null,
        elapsedMinutes: null,
        extraMinutes: null,
      },
    });
    const fixtures = [finished, scheduled, postponed, unknown];
    expect(filterMatches(fixtures, "polnoc", "finished")).toEqual([finished]);
    expect(filterMatches(fixtures, "", "upcoming")).toEqual([scheduled]);
    expect(filterMatches(fixtures, "", "live")).toEqual([]);
    expect(filterMatches(fixtures, "", "all")).toEqual(fixtures);
  });
});
