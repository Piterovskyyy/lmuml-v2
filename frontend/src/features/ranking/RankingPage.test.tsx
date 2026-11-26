import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { matchdayRefreshIntervalMs } from "@/features/matches/model/use-matchday-refresh";
import { mockWebSocket } from "@/test/mock-web-socket";
import type { PlayerRanking } from "./api/player-ranking";
import { RankingPage } from "./RankingPage";

const seasonCode = "demo-2026";
const endpoint = `/api/v1/player/seasons/${seasonCode}/ranking`;
const roundId = "50000000-0000-0000-0000-000000000001";
const roundEndpoint = `${endpoint}?roundId=${roundId}`;
const season: PlayerRanking = {
  seasonName: "Sezon demonstracyjny",
  rounds: [{ id: roundId, number: 3, name: "Runda 3" }],
  roundId: null,
  entries: [
    {
      position: 1,
      displayName: "Ala",
      points: 60,
      exactScores: 0,
      correctOutcomes: 2,
      settledPredictions: 2,
      isCurrentPlayer: true,
    },
    {
      position: 1,
      displayName: "Ola",
      points: 0,
      exactScores: 0,
      correctOutcomes: 1,
      settledPredictions: 1,
      isCurrentPlayer: false,
    },
    {
      position: 3,
      displayName: "Michał",
      points: -3,
      exactScores: 0,
      correctOutcomes: 0,
      settledPredictions: 1,
      isCurrentPlayer: false,
    },
  ],
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("shows the latest round contribution beside season points and hides it in a single-round ranking", async () => {
  const deltas = [20, 0, -5];
  const scoredSeason: PlayerRanking = {
    ...season,
    latestScoredRound: season.rounds[0],
    entries: season.entries.map((entry, index) => ({ ...entry, latestRoundPoints: deltas[index] })),
  };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) =>
      Response.json({
        ...scoredSeason,
        roundId: path.includes("roundId=") ? roundId : null,
      }),
    ),
  );

  render(<RankingPage seasonCode={seasonCode} />);
  const table = await screen.findByRole("table", { name: "Klasyfikacja sezonu" });
  const points = () =>
    within(table)
      .getAllByRole("row")
      .slice(1)
      .map((row) => within(row).getAllByRole("cell").at(-1)?.textContent);
  expect(points()).toEqual(["60 (+20)", "0 (0)", "-3 (-5)"]);
  expect(screen.getByText(/W nawiasie punkty z rundy 3\./)).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Dokładne wyniki" }));
  expect(await screen.findByRole("columnheader", { name: "Dokładne wyniki" })).toHaveAttribute(
    "aria-sort",
    "descending",
  );
  const playerDetail = screen
    .getByRole("rowheader", { name: /Ala/ })
    .querySelector(".ranking-player-detail");
  expect(playerDetail).toHaveTextContent("Punkty: 60 (+20)");

  fireEvent.change(screen.getByLabelText("Zakres rankingu"), { target: { value: roundId } });
  const roundTable = await screen.findByRole("table", { name: "Runda 3" });
  expect(roundTable.querySelector(".ranking-round-points")).not.toBeInTheDocument();
  expect(screen.queryByText(/W nawiasie punkty/)).not.toBeInTheDocument();
});

it("shows the signed-in player's shared place and reads a selected round from the API", async () => {
  const fetchRanking = vi.fn(async (path: string) => {
    if (path === endpoint) return Response.json(season);
    if (path === roundEndpoint) return Response.json({ ...season, roundId, entries: [] });
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchRanking);

  render(<RankingPage seasonCode={seasonCode} />);

  const table = await screen.findByRole("table", { name: "Klasyfikacja sezonu" });
  const rows = within(table).getAllByRole("row").slice(1);
  expect(rows.map((row) => within(row).getAllByRole("cell")[0].textContent)).toEqual([
    "1",
    "1",
    "3",
  ]);
  expect(rows.map((row) => within(row).getAllByRole("cell").at(-1)?.textContent)).toEqual([
    "60",
    "0",
    "-3",
  ]);
  expect(within(rows[0]).getByText("Ty")).toBeInTheDocument();
  expect(rows[0]).toHaveAttribute("data-current-player", "true");

  const scope = screen.getByRole("combobox", { name: "Zakres rankingu" });
  expect(within(scope).getByRole("option", { name: "Tylko runda 3" })).toHaveValue(roundId);
  fireEvent.change(scope, { target: { value: roundId } });

  expect(await screen.findByRole("heading", { name: "Runda 3" })).toBeInTheDocument();
  expect(
    screen.getByText("Ranking pojawi się po rozliczeniu pierwszych typów."),
  ).toBeInTheDocument();
  expect(fetchRanking).toHaveBeenLastCalledWith(
    roundEndpoint,
    expect.objectContaining({ credentials: "same-origin", cache: "no-store" }),
  );
  expect(screen.queryByText("Michał")).not.toBeInTheDocument();
});

it("removes personal results and shows the sign-in link if the session expires on refresh", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(Response.json(season))
      .mockResolvedValueOnce(new Response(null, { status: 401 })),
  );

  render(<RankingPage seasonCode={seasonCode} />);
  await screen.findByRole("table");
  fireEvent.click(screen.getByRole("button", { name: "Odśwież" }));

  expect(await screen.findByRole("link", { name: "Zaloguj się" })).toHaveAttribute(
    "href",
    "#konto",
  );
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  expect(screen.queryByText("Ala")).not.toBeInTheDocument();
});

it("keeps the selected scope and classification and ignores a superseded response", async () => {
  const exactEndpoint = `${roundEndpoint}&sort=EXACT_SCORES`;
  const roundOutcomesEndpoint = `${roundEndpoint}&sort=OUTCOMES`;
  const seasonOutcomesEndpoint = `${endpoint}?sort=OUTCOMES`;
  let finishExactScores: (response: Response) => void = () => {};
  const exactScoresResponse = new Promise<Response>((resolve) => {
    finishExactScores = resolve;
  });
  const fetchRanking = vi.fn(async (path: string) => {
    if (path === exactEndpoint) return exactScoresResponse;
    if (path === roundEndpoint || path === roundOutcomesEndpoint) {
      return Response.json({ ...season, roundId });
    }
    if (path === endpoint || path === seasonOutcomesEndpoint) return Response.json(season);
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchRanking);

  render(<RankingPage seasonCode={seasonCode} />);
  await screen.findByRole("table", { name: "Klasyfikacja sezonu" });
  const scope = screen.getByLabelText("Zakres rankingu");
  fireEvent.change(scope, { target: { value: roundId } });
  await screen.findByRole("table", { name: "Runda 3" });

  fireEvent.click(screen.getByRole("button", { name: "Dokładne wyniki" }));
  expect(fetchRanking).toHaveBeenLastCalledWith(exactEndpoint, expect.anything());
  fireEvent.click(screen.getByRole("button", { name: "1/X/2" }));

  const column = await screen.findByRole("columnheader", { name: "Trafione 1/X/2" });
  expect(column).toHaveAttribute("aria-sort", "descending");
  expect(scope).toHaveValue(roundId);
  expect(fetchRanking).toHaveBeenLastCalledWith(roundOutcomesEndpoint, expect.anything());

  await act(async () => {
    finishExactScores(Response.json({ ...season, roundId, entries: [] }));
  });
  expect(screen.getByRole("table", { name: "Runda 3" })).toBeInTheDocument();

  fireEvent.change(scope, { target: { value: "" } });
  await screen.findByRole("table", { name: "Klasyfikacja sezonu" });
  expect(screen.getByRole("button", { name: "1/X/2", pressed: true })).toBeInTheDocument();
  expect(fetchRanking).toHaveBeenLastCalledWith(seasonOutcomesEndpoint, expect.anything());
});

it("retries a failed loading request with the same scope", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockRejectedValueOnce(new Error("Network error"))
      .mockResolvedValueOnce(Response.json(season)),
  );

  render(<RankingPage seasonCode={seasonCode} />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Nie udało się wczytać rankingu.");
  fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
  expect(await screen.findByRole("table", { name: "Klasyfikacja sezonu" })).toBeInTheDocument();
});

it("refreshes the selected ranking in place and stops when the session expires", async () => {
  const kickoff = "2026-11-17T20:00:00Z";
  const matchday = { ...season, roundId, refreshKickoffs: [kickoff] };
  const outcomesEndpoint = `${roundEndpoint}&sort=OUTCOMES`;
  vi.useFakeTimers();
  vi.setSystemTime(new Date(kickoff));
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);

  let completeRefresh!: (response: Response) => void;
  const refreshing = new Promise<Response>((resolve) => {
    completeRefresh = resolve;
  });
  const fetchRanking = vi
    .fn()
    .mockResolvedValueOnce(Response.json(season))
    .mockResolvedValueOnce(Response.json(matchday))
    .mockResolvedValueOnce(Response.json(matchday))
    .mockReturnValueOnce(refreshing)
    .mockResolvedValueOnce(
      Response.json({ ...matchday, entries: [{ ...matchday.entries[0], correctOutcomes: 8 }] }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 401 }));
  vi.stubGlobal("fetch", fetchRanking);

  async function advance(milliseconds = 0) {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(milliseconds);
    });
  }

  render(<RankingPage seasonCode={seasonCode} />);
  await advance();
  fireEvent.change(screen.getByLabelText("Zakres rankingu"), { target: { value: roundId } });
  await advance();
  fireEvent.click(screen.getByRole("button", { name: "1/X/2" }));
  await advance();
  const table = screen.getByRole("table", { name: "Runda 3" });

  await advance(matchdayRefreshIntervalMs);
  expect(fetchRanking).toHaveBeenCalledTimes(4);
  expect(fetchRanking).toHaveBeenLastCalledWith(outcomesEndpoint, expect.anything());
  expect(table).toBeInTheDocument();
  const refreshButton = screen.getByRole("button", { name: "Odśwież" });
  expect(refreshButton).toHaveAttribute("aria-disabled", "true");
  fireEvent.click(refreshButton);
  expect(fetchRanking).toHaveBeenCalledTimes(4);

  await act(async () => completeRefresh(new Response(null, { status: 503 })));
  expect(screen.getByRole("status")).toHaveTextContent("Pokazujemy poprzednie wyniki.");
  expect(table).toBeInTheDocument();
  expect(screen.getByLabelText("Zakres rankingu")).toHaveValue(roundId);
  expect(screen.getByRole("button", { name: "1/X/2", pressed: true })).toBeInTheDocument();

  await advance(matchdayRefreshIntervalMs);
  expect(fetchRanking).toHaveBeenCalledTimes(5);
  expect(fetchRanking).toHaveBeenLastCalledWith(outcomesEndpoint, expect.anything());
  expect(within(table).getByRole("cell", { name: "8" })).toBeInTheDocument();
  expect(screen.queryByRole("status")).not.toBeInTheDocument();

  await advance(matchdayRefreshIntervalMs);
  expect(screen.getByRole("link", { name: "Zaloguj się" })).toBeInTheDocument();
  expect(screen.queryByRole("table")).not.toBeInTheDocument();
  await advance(matchdayRefreshIntervalMs);
  expect(fetchRanking).toHaveBeenCalledTimes(6);
});

it("reconciles the ranking after reconnecting during a round request", async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  const capture = "2026-11-17T20:00:00Z";
  const corrected = "2026-11-17T20:15:00Z";
  const original = { ...season, fixturesCapturedAt: capture };
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const sockets = mockWebSocket();
  let resolveStaleRank!: (response: Response) => void;
  const staleRank = new Promise<Response>((resolve) => {
    resolveStaleRank = resolve;
  });
  const fetchRanking = vi
    .fn()
    .mockResolvedValueOnce(Response.json(original))
    .mockReturnValueOnce(staleRank)
    .mockResolvedValueOnce(
      Response.json({
        ...original,
        roundId,
        fixturesCapturedAt: corrected,
        entries: [{ ...original.entries[0], points: 80 }],
      }),
    )
    .mockResolvedValueOnce(new Response(null, { status: 401 }));
  vi.stubGlobal("fetch", fetchRanking);
  await act(async () => {
    render(<RankingPage seasonCode={seasonCode} />);
  });

  expect(screen.getByRole("table", { name: "Klasyfikacja sezonu" })).toBeInTheDocument();
  act(() => sockets[0].open());
  act(() => sockets[0].fixtures(capture));
  expect(fetchRanking).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("Zakres rankingu"), { target: { value: roundId } });
  expect(fetchRanking).toHaveBeenCalledTimes(2);
  expect(sockets).toHaveLength(1);

  act(() => sockets[0].disconnect());
  act(() => vi.advanceTimersByTime(1_000));
  act(() => sockets[1].open());
  await act(async () => sockets[1].fixtures(corrected));
  const table = screen.getByRole("table", { name: "Runda 3" });
  expect(within(table).getByText("80")).toBeInTheDocument();
  expect(fetchRanking.mock.calls[1][1].signal.aborted).toBe(true);
  expect(fetchRanking).toHaveBeenLastCalledWith(roundEndpoint, expect.anything());
  await act(async () => resolveStaleRank(Response.json({ ...original, roundId })));
  expect(within(table).getByText("80")).toBeInTheDocument();

  await act(async () => sockets[1].fixtures("2026-11-17T20:30:00Z"));
  expect(screen.getByRole("link", { name: "Zaloguj się" })).toBeInTheDocument();
  expect(sockets[1].close).toHaveBeenCalledOnce();
});
