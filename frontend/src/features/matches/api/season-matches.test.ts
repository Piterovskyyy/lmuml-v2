import { afterEach, describe, expect, it, vi } from "vitest";
import { FinishType, MatchState } from "../model/match-status";
import {
  ApiError,
  fetchSeasonMatches,
  FormResult,
  type SeasonMatchesPayload,
} from "./season-matches";

function seasonResponse(): SeasonMatchesPayload {
  return {
    season: {
      id: "10000000-0000-0000-0000-000000000001",
      code: "demo-2026",
      name: "Sezon demonstracyjny 2026",
      startYear: 2026,
    },
    competition: {
      id: "40000000-0000-0000-0000-000000000001",
      code: "demo-cup",
      name: "Puchar demonstracyjny",
      logoUrl: "https://assets.example.test/cup.png",
    },
    matches: [
      {
        id: "30000000-0000-0000-0000-000000000001",
        tournamentRound: null,
        kickoffAt: "2026-10-25T00:30:00Z",
        status: {
          state: "FINISHED",
          finishType: "REGULATION_TIME",
          elapsedMinutes: 90,
          extraMinutes: null,
        },
        homeTeam: { id: "20000000-0000-0000-0000-000000000001", name: "FC Północ", logoUrl: null },
        awayTeam: {
          id: "20000000-0000-0000-0000-000000000002",
          name: "KS Południe",
          logoUrl: null,
        },
        scores: {
          total: { home: 0, away: 0 },
          halfTime: { home: null, away: null },
          regulationTime: { home: 0, away: 0 },
          extraTime: { home: null, away: null },
          penalties: { home: null, away: null },
        },
        homeWinner: null,
        awayWinner: null,
      },
    ],
  };
}

function jsonResponse(value: unknown): Response {
  return new Response(JSON.stringify(value), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("season API boundary", () => {
  it("reads imported rankings and maps the provider form into known results", async () => {
    const body = seasonResponse();
    body.standings = {
      capturedAt: "2026-11-04T16:30:00Z",
      rows: [
        {
          position: 1,
          team: body.matches[0].homeTeam,
          played: 3,
          won: 1,
          drawn: 1,
          lost: 1,
          goalsFor: 3,
          goalsAgainst: 2,
          goalDifference: 1,
          points: 4,
          form: "WDL",
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body)));

    const result = await fetchSeasonMatches("demo-2026");

    expect(result.standings?.rows[0]).toMatchObject({
      position: 1,
      points: 4,
      form: [FormResult.Win, FormResult.Draw, FormResult.Loss],
    });
  });

  it("accepts the backend contract and maps known statuses to enums while preserving zero and null", async () => {
    const body = seasonResponse();
    const fetchMock = vi
      .fn()
      .mockResolvedValue(jsonResponse({ ...body, futureField: { available: true } }));
    vi.stubGlobal("fetch", fetchMock);

    const result = await fetchSeasonMatches("demo-2026");

    expect(fetchMock).toHaveBeenCalledWith("/api/v1/seasons/demo-2026/matches", {
      signal: expect.any(AbortSignal),
      headers: { Accept: "application/json" },
    });
    expect(result).toEqual(body);
    expect(result.matches[0].scores.regulationTime).toEqual({ home: 0, away: 0 });
    expect(result.matches[0].scores.halfTime).toEqual({ home: null, away: null });
    expect(result.matches[0].status.state).toBe(MatchState.Finished);
    expect(result.matches[0].status.finishType).toBe(FinishType.RegulationTime);
  });

  it.each(["NEW_BACKEND_STATE", "__proto__", "constructor"])(
    "handles the unfamiliar state %s without losing the match",
    async (state) => {
      const body = seasonResponse();
      body.matches[0].status.state = state;
      body.matches[0].status.finishType = "NEW_FINISH_TYPE";
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(jsonResponse(body)));

      const result = await fetchSeasonMatches("demo-2026");

      expect(result.matches[0].status.state).toBe(MatchState.Unknown);
      expect(result.matches[0].status.finishType).toBeNull();
    },
  );

  const invalidResponses = [
    {
      name: "malformed JSON",
      response: () => new Response('{"matches":', { status: 200 }),
    },
    {
      name: "an unsafe logo protocol",
      response: () => {
        const body = seasonResponse();
        body.competition.logoUrl = "javascript:alert(1)";
        return jsonResponse(body);
      },
    },
    {
      name: "a kickoff without a timezone",
      response: () => {
        const body = seasonResponse();
        body.matches[0].kickoffAt = "2026-10-25T02:30:00";
        return jsonResponse(body);
      },
    },
    {
      name: "a malformed score value",
      response: () => {
        const body = seasonResponse();
        return jsonResponse({
          ...body,
          matches: [
            {
              ...body.matches[0],
              scores: { ...body.matches[0].scores, regulationTime: { home: "0", away: 0 } },
            },
          ],
        });
      },
    },
  ];

  it.each(invalidResponses)("rejects $name as a safe contract error", async ({ response }) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response()));

    await expect(fetchSeasonMatches("demo-2026")).rejects.toMatchObject({
      name: "ApiError",
      status: null,
      kind: "invalid-response",
      message: "Nie udało się pobrać meczów.",
    });
  });

  it("preserves an HTTP error status without exposing arbitrary server content", async () => {
    const response = new Response("SELECT secret_password FROM internal_database", { status: 503 });
    const readBody = vi.spyOn(response, "text");
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);

    await expect(fetchSeasonMatches("unsafe/code")).rejects.toMatchObject({
      name: "ApiError",
      status: 503,
      kind: "http",
      message: "Nie udało się pobrać meczów.",
    });
    expect(readBody).not.toHaveBeenCalled();
    expect(fetchMock.mock.calls[0][0]).toBe("/api/v1/seasons/unsafe%2Fcode/matches");
  });

  it("classifies a rejected network request without exposing its internal message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockRejectedValue(new TypeError("internal host and connection details")),
    );

    await expect(fetchSeasonMatches("demo-2026")).rejects.toMatchObject({
      name: "ApiError",
      status: null,
      kind: "network",
      message: "Nie udało się pobrać meczów.",
    });
  });

  it("classifies a request stopped by its time limit", async () => {
    const timeout = new AbortController();
    timeout.abort(new DOMException("Request timed out", "TimeoutError"));
    const timeoutFactory = vi.spyOn(AbortSignal, "timeout").mockReturnValue(timeout.signal);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(timeout.signal.reason));

    await expect(fetchSeasonMatches("demo-2026")).rejects.toMatchObject({
      name: "ApiError",
      status: null,
      kind: "timeout",
    });
    expect(timeoutFactory).toHaveBeenCalledWith(12_000);
  });

  it("preserves caller cancellation instead of presenting it as a network failure", async () => {
    const caller = new AbortController();
    const reason = new DOMException("The view was closed", "AbortError");
    caller.abort(reason);
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(reason));

    await expect(fetchSeasonMatches("demo-2026", caller.signal)).rejects.toBe(reason);
    expect(reason).not.toBeInstanceOf(ApiError);
  });
});
