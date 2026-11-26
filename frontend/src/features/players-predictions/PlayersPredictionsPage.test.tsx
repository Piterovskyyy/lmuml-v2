import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { FootballMatch } from "@/features/matches/api/season-matches";
import { FinishType, MatchState } from "@/features/matches/model/match-status";
import type { PublishedRounds } from "@/features/predictions/api/published-rounds";
import type { PlayersPredictions } from "./api/players-predictions";
import { PlayersPredictionsPage } from "./PlayersPredictionsPage";

const seasonCode = "demo-2026";
const roundsEndpoint = `/api/v1/seasons/${seasonCode}/betting-rounds`;
const roundId = "50000000-0000-4000-8000-000000000003";
const previousRoundId = "50000000-0000-4000-8000-000000000002";
const matchId = (number: number) => `60000000-0000-4000-8000-${String(number).padStart(12, "0")}`;
const playerId = "70000000-0000-4000-8000-000000000001";
const serverNow = "2030-01-10T20:00:00Z";
const endpoint = (id: string) => `/api/v1/player/betting-rounds/${id}/players-predictions`;

function match(
  number: number,
  state = MatchState.Finished,
  kickoffAt: string | null = "2030-01-09T20:00:00Z",
): FootballMatch {
  const score = state === MatchState.Finished ? { home: 2, away: 1 } : { home: null, away: null };
  return {
    id: matchId(number),
    tournamentRound: "League Stage - 3",
    kickoffAt,
    status: {
      state,
      finishType: state === MatchState.Finished ? FinishType.RegulationTime : null,
      elapsedMinutes: null,
      extraMinutes: null,
    },
    homeTeam: {
      id: "80000000-0000-4000-8000-000000000001",
      name: `Gospodarze ${number}`,
      logoUrl: null,
    },
    awayTeam: {
      id: "80000000-0000-4000-8000-000000000002",
      name: `Goście ${number}`,
      logoUrl: null,
    },
    scores: {
      total: score,
      regulationTime: score,
      halfTime: { home: 1, away: 0 },
      extraTime: { home: null, away: null },
      penalties: { home: null, away: null },
    },
    homeWinner: null,
    awayWinner: null,
  };
}

const matches = [
  match(1),
  match(2, MatchState.Live),
  match(3, MatchState.Scheduled, "2030-01-11T20:00:00Z"),
  match(4, MatchState.Postponed),
  match(5, MatchState.Cancelled),
  match(6, MatchState.TimeUnconfirmed),
  match(7, MatchState.Unknown),
  match(8, MatchState.Scheduled),
  match(9, MatchState.Scheduled, null),
];
const rounds: PublishedRounds = {
  season: {
    id: "90000000-0000-4000-8000-000000000001",
    code: seasonCode,
    name: "Sezon demonstracyjny",
    startYear: 2026,
  },
  competition: {
    id: "90000000-0000-4000-8000-000000000002",
    code: "demo",
    name: "Liga demonstracyjna",
    logoUrl: null,
  },
  rounds: [
    {
      id: roundId,
      number: 3,
      name: "Runda 3",
      publishedAt: "2029-12-01T12:00:00Z",
      awaitingFinal: false,
      matches,
    },
    {
      id: previousRoundId,
      number: 2,
      name: "Runda 2",
      publishedAt: "2029-11-01T12:00:00Z",
      awaitingFinal: false,
      matches: [match(10)],
    },
  ],
};
const predictions: PlayersPredictions = {
  roundId,
  serverNow,
  players: [
    {
      id: playerId,
      displayName: "Żółw z trybun",
      isCurrentPlayer: true,
      predictions: [
        { matchId: matchId(1), homeGoals: 2, awayGoals: 1, points: 9 },
        { matchId: matchId(2), homeGoals: 0, awayGoals: 0, points: null },
      ],
    },
    {
      id: "70000000-0000-4000-8000-000000000002",
      displayName: "Bartek",
      isCurrentPlayer: false,
      predictions: [
        { matchId: matchId(1), homeGoals: 0, awayGoals: 3, points: -3 },
        { matchId: matchId(2), homeGoals: 0, awayGoals: 2, points: 0 },
      ],
    },
  ],
};

function installFetch(
  read: (path: string) => Promise<Response> = async () => Response.json(predictions),
) {
  const fetchMock = vi.fn(async (path: string) =>
    path === roundsEndpoint ? Response.json(rounds) : read(path),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => vi.unstubAllGlobals());

it("shows per-match picks and points, hidden future picks and the current player", async () => {
  installFetch();
  render(<PlayersPredictionsPage seasonCode={seasonCode} />);
  const player = await screen.findByRole("button", { name: /Żółw z trybun/ });
  expect(within(player).getByText("Ty")).toBeInTheDocument();
  expect(within(player).getByText("9 pkt")).toBeInTheDocument();
  expect(within(player).getByText("Ujawnione typy: 2 · Rozliczone: 1")).toBeInTheDocument();
  fireEvent.click(player);
  expect(player).toHaveAttribute("aria-expanded", "true");
  const first = screen.getByRole("article", { name: "Gospodarze 1 — Goście 1" });
  expect(within(first).getAllByText("2 : 1")).toHaveLength(2);
  expect(within(first).getByText("9")).toBeInTheDocument();
  expect(within(first).queryByText("+9")).not.toBeInTheDocument();
  expect(
    within(screen.getByRole("article", { name: "Gospodarze 2 — Goście 2" })).getByText(
      "Oczekuje na rozliczenie",
    ),
  ).toBeInTheDocument();
  for (const number of [3, 4, 5, 6, 7, 9]) {
    const hidden = screen.getByRole("article", { name: `Gospodarze ${number} — Goście ${number}` });
    expect(within(hidden).getByText("Typy dostępne po rozpoczęciu meczu")).toBeInTheDocument();
    expect(within(hidden).queryByText("Brak typu")).not.toBeInTheDocument();
  }
  expect(
    within(screen.getByRole("article", { name: "Gospodarze 8 — Goście 8" })).getByText("Brak typu"),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /Bartek/ }));
  expect(screen.getByText("-3 pkt")).toBeInTheDocument();
  expect(screen.getByText("0")).toBeInTheDocument();
  expect(player).toHaveAttribute("aria-expanded", "false");
});

it("searches names without Polish diacritics and provides an empty search result", async () => {
  installFetch();
  render(<PlayersPredictionsPage seasonCode={seasonCode} />);
  const search = await screen.findByRole("searchbox", { name: "Szukaj gracza" });
  fireEvent.change(search, { target: { value: "  ZOLW  " } });
  expect(screen.getByRole("button", { name: /Żółw z trybun/ })).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /Bartek/ })).not.toBeInTheDocument();
  fireEvent.change(search, { target: { value: "nieistniejący gracz" } });
  expect(screen.getByText("Nie znaleziono gracza o tej nazwie.")).toBeInTheDocument();
});

it("loads the selected round and ignores a response from a superseded selection", async () => {
  let finishPrevious!: (response: Response) => void;
  const previousResponse = new Promise<Response>((resolve) => {
    finishPrevious = resolve;
  });
  const fetchMock = installFetch(async (path) =>
    path === endpoint(previousRoundId) ? previousResponse : Response.json(predictions),
  );
  render(<PlayersPredictionsPage seasonCode={seasonCode} />);
  await screen.findByRole("button", { name: /Żółw z trybun/ });
  const select = screen.getByRole("combobox", { name: "Wybierz rundę" });
  fireEvent.change(select, { target: { value: previousRoundId } });
  expect(screen.queryByRole("button", { name: /Żółw z trybun/ })).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenLastCalledWith(
    endpoint(previousRoundId),
    expect.objectContaining({ cache: "no-store", credentials: "same-origin" }),
  );
  fireEvent.change(select, { target: { value: roundId } });
  await screen.findByRole("button", { name: /Żółw z trybun/ });
  await act(async () => {
    finishPrevious(Response.json({ ...predictions, roundId: previousRoundId, players: [] }));
  });
  expect(select).toHaveValue(roundId);
  expect(screen.getByRole("button", { name: /Żółw z trybun/ })).toBeInTheDocument();
});

it("removes private data after session expiry on refresh", async () => {
  let privateReads = 0;
  installFetch(async () =>
    ++privateReads === 1 ? Response.json(predictions) : new Response(null, { status: 401 }),
  );
  render(<PlayersPredictionsPage seasonCode={seasonCode} />);
  fireEvent.click(await screen.findByRole("button", { name: /Żółw z trybun/ }));
  fireEvent.click(screen.getByRole("button", { name: "Odśwież" }));
  expect(await screen.findByRole("link", { name: "Zaloguj się" })).toHaveAttribute(
    "href",
    "#konto",
  );
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  expect(screen.queryByText("Żółw z trybun")).not.toBeInTheDocument();
  expect(screen.queryByRole("searchbox")).not.toBeInTheDocument();
});

it("preserves expanded player and search during a failed refresh and refreshes match metadata", async () => {
  let privateReads = 0;
  let roundReads = 0;
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path === roundsEndpoint) {
        const updated = structuredClone(rounds);
        if (++roundReads > 1)
          updated.rounds[0].matches[0].scores.regulationTime = { home: 3, away: 1 };
        return Response.json(updated);
      }
      if (++privateReads > 1) throw new Error("Offline");
      return Response.json(predictions);
    }),
  );
  render(<PlayersPredictionsPage seasonCode={seasonCode} />);
  fireEvent.click(await screen.findByRole("button", { name: /Żółw z trybun/ }));
  fireEvent.change(screen.getByRole("searchbox"), { target: { value: "zolw" } });
  fireEvent.click(screen.getByRole("button", { name: "Odśwież" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Pokazujemy poprzednio pobrane dane.");
  expect(screen.getByRole("searchbox")).toHaveValue("zolw");
  expect(screen.getByRole("button", { name: /Żółw z trybun/ })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(
    within(screen.getByRole("article", { name: "Gospodarze 1 — Goście 1" })).getByText("3 : 1"),
  ).toBeInTheDocument();
  expect(roundReads).toBe(2);
});

it("opens full match details from a player's prediction", async () => {
  installFetch();
  render(<PlayersPredictionsPage seasonCode={seasonCode} />);
  fireEvent.click(await screen.findByRole("button", { name: /Żółw z trybun/ }));
  fireEvent.click(screen.getByRole("button", { name: "Szczegóły: Gospodarze 1 — Goście 1" }));
  const dialog = await screen.findByRole("dialog", { name: "Gospodarze 1 — Goście 1" });
  expect(within(dialog).getByText("Po 90 minutach")).toBeInTheDocument();
  expect(within(dialog).getByText("Do przerwy")).toBeInTheDocument();
});

it("shows the round's no-participants state and allows retry after a failed read", async () => {
  let privateReads = 0;
  installFetch(async () =>
    ++privateReads === 1
      ? new Response(null, { status: 500 })
      : Response.json({ ...predictions, players: [] }),
  );
  render(<PlayersPredictionsPage seasonCode={seasonCode} />);
  expect(await screen.findByRole("alert")).toHaveTextContent("Nie udało się wczytać typów graczy.");
  fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
  expect(
    await screen.findByText("Gracze pojawią się tutaj po zapisaniu typów w tej rundzie."),
  ).toBeInTheDocument();
});
