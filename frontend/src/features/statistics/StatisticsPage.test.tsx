import { render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { StatisticsPage } from "./StatisticsPage";

const seasonCode = "demo-2026";
const gamePath = `/api/v1/seasons/${seasonCode}/prediction-statistics`;
const playerPath = `/api/v1/player/seasons/${seasonCode}/statistics`;
const sessionPath = "/api/v1/player/session";
const game = {
  seasonName: "Sezon demonstracyjny",
  playersWithSettledPredictions: 17,
  settledPredictions: 182,
  exactScores: 23,
  correctOutcomes: 75,
};

afterEach(() => vi.unstubAllGlobals());

it("shows season totals to guests without requesting personal results", async () => {
  const fetchStatistics = vi.fn(async (path: string) => {
    if (path === gamePath) return Response.json(game);
    if (path === sessionPath) {
      return Response.json({ authenticated: false, player: null, csrfToken: "guest-token" });
    }
    return new Response(null, { status: 401 });
  });
  vi.stubGlobal("fetch", fetchStatistics);

  render(<StatisticsPage seasonCode={seasonCode} />);

  expect(await screen.findByRole("link", { name: "Zaloguj się" })).toHaveAttribute(
    "href",
    "#konto",
  );
  expect(
    await within(screen.getByRole("region", { name: "Gra w liczbach" })).findByText("182"),
  ).toBeInTheDocument();
  expect(fetchStatistics).not.toHaveBeenCalledWith(playerPath, expect.anything());
});

it("shows signed points by round and accuracy from settled predictions", async () => {
  const fetchStatistics = vi.fn(async (path: string) => {
    if (path === gamePath) return Response.json(game);
    if (path === sessionPath) {
      return Response.json({
        authenticated: true,
        csrfToken: "player-token",
        player: {
          id: "50000000-0000-0000-0000-000000000001",
          displayName: "Ala",
          email: "ala@test",
        },
      });
    }
    if (path === playerPath) {
      return Response.json({
        seasonName: game.seasonName,
        totals: { points: 2, settledPredictions: 6, exactScores: 2, correctOutcomes: 3 },
        rounds: [4, 0, -2].map((points, index) => ({
          id: `60000000-0000-0000-0000-00000000000${index + 1}`,
          number: index + 1,
          name: `Runda ${index + 1}`,
          points,
          settledPredictions: 2,
          exactScores: points > 0 ? 2 : 0,
          correctOutcomes: points > 0 ? 2 : points === 0 ? 1 : 0,
        })),
      });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchStatistics);

  render(<StatisticsPage seasonCode={seasonCode} />);

  const personal = within(screen.getByRole("region", { name: "Moje statystyki" }));
  const rounds = await personal.findAllByRole("listitem");
  expect(within(rounds[0]).getByText("4 pkt")).toBeInTheDocument();
  expect(within(rounds[1]).getByText("0 pkt")).toBeInTheDocument();
  expect(within(rounds[2]).getByText("-2 pkt")).toBeInTheDocument();
  expect(personal.getByText("33,3% skuteczności")).toBeInTheDocument();
  expect(personal.getByText("50% skuteczności")).toBeInTheDocument();
  expect(fetchStatistics).toHaveBeenCalledWith(playerPath, expect.anything());
});
