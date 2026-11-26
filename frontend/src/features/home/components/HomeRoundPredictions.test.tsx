import { fireEvent, render, screen, within } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { MatchState } from "@/features/matches/model/match-status";
import type { PublishedRounds } from "@/features/predictions/api/published-rounds";
import { HomeRoundPredictions } from "./HomeRoundPredictions";

const seasonCode = "sample-2026";
const roundsPath = `/api/v1/seasons/${seasonCode}/betting-rounds`;
const sessionPath = "/api/v1/player/session";
const roundId = "40000000-0000-0000-0000-000000000001";
const laterRoundId = "40000000-0000-0000-0000-000000000002";
const matchId = "30000000-0000-0000-0000-000000000001";
const secondMatchId = "30000000-0000-0000-0000-000000000005";
const predictionsPath = `/api/v1/player/betting-rounds/${roundId}/predictions`;
const changedScores = [
  { matchId, homeGoals: 3, awayGoals: 1 },
  { matchId: secondMatchId, homeGoals: 0, awayGoals: 0 },
];

function makeFixture(
  id: number,
  homeName: string,
  kickoffAt: string,
  state: MatchState = MatchState.Scheduled,
) {
  const emptyScore = { home: null, away: null };
  return {
    id: `30000000-0000-0000-0000-00000000000${id}`,
    tournamentRound: null,
    kickoffAt,
    status: { state, finishType: null, elapsedMinutes: null, extraMinutes: null },
    homeTeam: {
      id: `50000000-0000-0000-0000-00000000000${id}`,
      name: homeName,
      logoUrl: null,
    },
    awayTeam: { id: "60000000-0000-0000-0000-000000000001", name: "Milan", logoUrl: null },
    scores: {
      total: emptyScore,
      regulationTime: emptyScore,
      halfTime: emptyScore,
      extraTime: emptyScore,
      penalties: emptyScore,
    },
    homeWinner: null,
    awayWinner: null,
  };
}

it("opens multiple match days and saves the completed edits in one request for the closest round", async () => {
  const now = Date.now();
  const time = (minutes: number) => new Date(now + minutes * 60_000).toISOString();
  const publishedAt = time(-60);
  const rounds: PublishedRounds = {
    season: {
      id: "10000000-0000-0000-0000-000000000001",
      code: seasonCode,
      name: "Liga Mistrzów 2026/27",
      startYear: 2026,
    },
    competition: {
      id: "20000000-0000-0000-0000-000000000001",
      code: "sample",
      name: "Liga Mistrzów",
      logoUrl: null,
    },
    rounds: [
      {
        id: laterRoundId,
        number: 2,
        name: "Runda 2",
        publishedAt,
        awaitingFinal: false,
        matches: [makeFixture(2, "Real Madryt", time(45))],
      },
      {
        id: roundId,
        number: 1,
        name: "Runda 1",
        publishedAt,
        awaitingFinal: false,
        matches: [
          makeFixture(3, "Liverpool", time(-10)),
          makeFixture(4, "Inter", time(10), MatchState.Postponed),
          makeFixture(1, "Arsenal", time(30)),
          makeFixture(5, "Barcelona", time(30 + 48 * 60)),
        ],
      },
    ],
  };
  const fetchMock = vi.fn(async (path: string, options?: RequestInit) => {
    if (path === roundsPath) return Response.json(rounds);
    if (path === sessionPath) {
      return Response.json({
        authenticated: true,
        csrfToken: "player-csrf",
        player: {
          id: "70000000-0000-0000-0000-000000000001",
          displayName: "Kibic",
          email: "kibic@example.test",
        },
      });
    }
    if (path === predictionsPath) {
      if (options?.method === "POST") {
        return Response.json({
          saved: changedScores,
          rejected: [],
          serverNow: time(0),
        });
      }
      return Response.json({
        predictions: [{ matchId, homeGoals: 2, awayGoals: 1, points: null }],
        serverNow: time(0),
      });
    }
    throw new Error(`Unexpected request: ${path}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  try {
    render(<HomeRoundPredictions seasonCode={seasonCode} />);

    const toggle = await screen.findByRole("button", { name: "Typuj rundę" });
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Mecze do typowania:")).toHaveTextContent("Mecze do typowania: 2");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("heading", { name: "Typy w rundzie 1" })).toHaveFocus();

    const homeGoals = await screen.findByRole("textbox", { name: /^Gole: Arsenal/ });
    const awayGoals = screen.getByRole("textbox", { name: /^Gole: Milan, mecz Arsenal/ });
    expect(homeGoals).toHaveValue("2");
    expect(awayGoals).toHaveValue("1");
    const form = screen.getByRole("form", { name: "Typy w kolejce" });
    expect(within(form).getAllByRole("heading", { level: 3 })).toHaveLength(2);
    expect(within(form).getAllByRole("textbox")).toHaveLength(4);
    expect(within(form).queryByText("Inter")).not.toBeInTheDocument();
    expect(within(form).queryByText("Liverpool")).not.toBeInTheDocument();
    expect(within(form).queryByText("Real Madryt")).not.toBeInTheDocument();
    expect(screen.getByText("Runda 1")).toBeInTheDocument();

    fireEvent.change(homeGoals, { target: { value: "3" } });
    expect(
      screen.queryByRole("button", { name: "Odśwież mecze do typowania" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Zwiń panel typowania" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(toggle).toHaveFocus();
    fireEvent.click(screen.getByRole("button", { name: "Typuj rundę" }));
    expect(await screen.findByRole("textbox", { name: /^Gole: Arsenal/ })).toHaveValue("3");

    fireEvent.change(screen.getByRole("textbox", { name: /^Gole: Barcelona/ }), {
      target: { value: "0" },
    });
    fireEvent.change(screen.getByRole("textbox", { name: /^Gole: Milan, mecz Barcelona/ }), {
      target: { value: "0" },
    });
    await screen.findByText("Gotowe do zapisania: 2.");
    fireEvent.click(screen.getByRole("button", { name: "Zapisz typy (2)" }));
    await screen.findByText("Zapisane typy: 2.");
    expect(fetchMock.mock.calls.filter(([, request]) => request?.method === "POST")).toEqual([
      [
        predictionsPath,
        expect.objectContaining({
          method: "POST",
          headers: expect.objectContaining({ "X-CSRF-TOKEN": "player-csrf" }),
          body: JSON.stringify({ predictions: changedScores }),
        }),
      ],
    ]);
    expect(screen.getAllByText("Typ zapisany")).toHaveLength(2);
    expect(screen.getByRole("link", { name: "Moje typy" })).toHaveAttribute("href", "#typy");
  } finally {
    vi.unstubAllGlobals();
  }
});
