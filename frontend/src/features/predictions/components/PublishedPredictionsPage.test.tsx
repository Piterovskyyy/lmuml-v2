import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { FootballMatch } from "@/features/matches/api/season-matches";
import { FinishType, MatchState } from "@/features/matches/model/match-status";
import type { PublishedRounds } from "../api/published-rounds";
import { PublishedPredictionsPage } from "./PublishedPredictionsPage";

const season = {
  id: "10000000-0000-0000-0000-000000000001",
  code: "sample-2024",
  name: "Liga Mistrzów 2024/25",
  startYear: 2024,
};
const competition = {
  id: "20000000-0000-0000-0000-000000000001",
  code: "sample",
  name: "Liga Mistrzów",
  logoUrl: null,
};
const olderId = "40000000-0000-0000-0000-000000000001";
const newerId = "40000000-0000-0000-0000-000000000002";
const apiPath = "/api/v1/seasons/sample-2024/betting-rounds";
const sessionPath = "/api/v1/player/session";
const predictionsPath = `/api/v1/player/betting-rounds/${newerId}/predictions`;
const player = {
  id: "60000000-0000-0000-0000-000000000001",
  displayName: "Kibic",
  email: "kibic@example.test",
};
const serverNow = "2025-04-29T18:00:00Z";

function fixture(index: number, kickoffAt: string, name: string): FootballMatch {
  const empty = { home: null, away: null };
  const score = { home: 2, away: 1 };
  return {
    id: `30000000-0000-0000-0000-00000000000${index}`,
    tournamentRound: "Semi-finals",
    kickoffAt,
    status: {
      state: MatchState.Finished,
      finishType: FinishType.RegulationTime,
      elapsedMinutes: 90,
      extraMinutes: null,
    },
    homeTeam: {
      id: `50000000-0000-0000-0000-00000000000${index}`,
      name,
      logoUrl: null,
    },
    awayTeam: {
      id: "50000000-0000-0000-0000-000000000004",
      name: "Inter",
      logoUrl: null,
    },
    scores: {
      total: score,
      halfTime: empty,
      regulationTime: score,
      extraTime: empty,
      penalties: empty,
    },
    homeWinner: true,
    awayWinner: false,
  };
}

function publishedRounds(): PublishedRounds {
  return {
    season,
    competition,
    rounds: [
      {
        id: olderId,
        number: 3,
        name: "Runda 3",
        publishedAt: "2025-04-01T10:00:00Z",
        awaitingFinal: false,
        matches: [fixture(1, "2025-04-08T19:00:00Z", "Arsenal")],
      },
      {
        id: newerId,
        number: 4,
        name: "Runda 4",
        publishedAt: "2025-04-27T10:00:00Z",
        awaitingFinal: true,
        matches: [
          fixture(2, "2025-04-29T19:00:00Z", "Bayern"),
          fixture(3, "2025-04-29T22:15:00Z", "Barcelona"),
        ],
      },
    ],
  };
}

afterEach(() => vi.unstubAllGlobals());

it("opens the latest round by number and keeps fixtures grouped by their Polish dates", async () => {
  const fetchMock = vi.fn(async (path: string) =>
    path === sessionPath
      ? Response.json({ authenticated: false, player: null, csrfToken: "guest-csrf" })
      : Response.json(publishedRounds()),
  );
  vi.stubGlobal("fetch", fetchMock);
  render(<PublishedPredictionsPage seasonCode={season.code} />);

  const selector = await screen.findByRole("combobox", { name: "Wybierz rundę" });
  expect(selector).toHaveValue(newerId);
  expect(within(selector).getByRole("option", { name: "Runda 4" })).toHaveValue(newerId);
  expect(fetchMock).toHaveBeenCalledWith(apiPath, expect.any(Object));
  const firstDay = screen.getByRole("region", { name: /29 kwietnia 2025/ });
  const secondDay = screen.getByRole("region", { name: /30 kwietnia 2025/ });
  expect(within(firstDay).getByRole("article", { name: "Bayern — Inter" })).toBeInTheDocument();
  expect(within(secondDay).getByRole("article", { name: "Barcelona — Inter" })).toBeInTheDocument();
  expect(screen.getByText(/Mecz finałowy pojawi się/)).toBeInTheDocument();
  expect(await screen.findByRole("link", { name: "Zaloguj się" })).toHaveAttribute(
    "href",
    "#konto",
  );

  fireEvent.change(selector, { target: { value: olderId } });
  expect(screen.getByRole("heading", { name: "Runda 3" })).toBeInTheDocument();
  expect(screen.getByRole("article", { name: "Arsenal — Inter" })).toBeInTheDocument();
  expect(screen.queryByText(/Mecz finałowy pojawi się/)).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
});

function editableRounds() {
  const published = publishedRounds();
  const matches = published.rounds[1].matches;
  const scheduled = (match: FootballMatch): FootballMatch => ({
    ...match,
    status: {
      state: MatchState.Scheduled,
      finishType: null,
      elapsedMinutes: null,
      extraMinutes: null,
    },
  });
  published.rounds[1].matches = matches.map(scheduled);
  published.rounds[1].matches.push(scheduled(fixture(4, "2025-04-30T19:00:00Z", "Milan")));
  return published;
}

it("overwrites ready changes in one request and preserves a newer draft and the previous locked score", async () => {
  const [bayern, barcelona] = editableRounds().rounds[1].matches;
  const previous = [
    { matchId: bayern.id, homeGoals: 2, awayGoals: 1, points: null },
    { matchId: barcelona.id, homeGoals: 1, awayGoals: 0, points: null },
  ];
  let completeSave!: (response: Response) => void;
  const response = new Promise<Response>((resolve) => {
    completeSave = resolve;
  });
  const fetchMock = vi.fn(async (path: string, options?: RequestInit) => {
    if (path === sessionPath) {
      return Response.json({ authenticated: true, player, csrfToken: "player-csrf" });
    }
    if (path === predictionsPath) {
      return options?.method === "POST"
        ? response
        : Response.json({ predictions: previous, serverNow });
    }
    return Response.json(editableRounds());
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<PublishedPredictionsPage seasonCode={season.code} />);

  const bayernGoals = await screen.findByRole("textbox", { name: /Gole: Bayern/ });
  const barcelonaGoals = screen.getByRole("textbox", { name: /Gole: Barcelona/ });
  expect(bayernGoals).toHaveValue("2");
  expect(barcelonaGoals).toHaveValue("1");
  expect(screen.queryByText("Oczekuje na punkty")).not.toBeInTheDocument();
  fireEvent.change(bayernGoals, { target: { value: "3" } });
  fireEvent.change(barcelonaGoals, { target: { value: "2" } });
  const incomplete = screen.getByRole("textbox", { name: /Gole: Milan/ });
  fireEvent.change(incomplete, { target: { value: "1" } });
  expect(screen.getAllByRole("button", { name: /^Zapisz typy/ })).toHaveLength(1);
  fireEvent.click(screen.getByRole("button", { name: "Zapisz typy (2)" }));
  expect(fetchMock).toHaveBeenCalledWith(
    predictionsPath,
    expect.objectContaining({
      method: "POST",
      headers: expect.objectContaining({ "X-CSRF-TOKEN": "player-csrf" }),
      body: JSON.stringify({
        predictions: [
          { matchId: bayern.id, homeGoals: 3, awayGoals: 1 },
          { matchId: barcelona.id, homeGoals: 2, awayGoals: 0 },
        ],
      }),
    }),
  );
  fireEvent.change(bayernGoals, { target: { value: "4" } });
  completeSave(
    Response.json({
      saved: [{ matchId: bayern.id, homeGoals: 3, awayGoals: 1 }],
      rejected: [{ matchId: barcelona.id, reason: "LOCKED" }],
      serverNow,
    }),
  );
  expect(await screen.findByText(/Zapisane typy: 1\. Odrzucone typy: 1\./)).toBeInTheDocument();
  expect(bayernGoals).toHaveValue("4");
  expect(incomplete).toHaveValue("1");
  const locked = within(screen.getByRole("article", { name: "Barcelona — Inter" }));
  expect(locked.queryByRole("textbox")).not.toBeInTheDocument();
  expect(locked.getByText("1 : 0")).toBeInTheDocument();
  expect(locked.getByText("Mecz został zamknięty przed zapisaniem zmian.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Zapisz typy (1)" })).toBeEnabled();
});

it("reloads the stored scores after a lost save response and keeps a newer edit", async () => {
  const [bayern] = editableRounds().rounds[1].matches;
  let storedGoals = 2;
  let loseSaveResponse!: () => void;
  const fetchMock = vi.fn(async (path: string, options?: RequestInit) => {
    if (path === sessionPath) {
      return Response.json({ authenticated: true, player, csrfToken: "player-csrf" });
    }
    if (path === predictionsPath) {
      if (options?.method === "POST") {
        storedGoals = 3;
        return new Promise<Response>((_, reject) => {
          loseSaveResponse = () => reject(new TypeError("Connection lost"));
        });
      }
      return Response.json({
        predictions: [{ matchId: bayern.id, homeGoals: storedGoals, awayGoals: 1, points: null }],
        serverNow,
      });
    }
    return Response.json(editableRounds());
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<PublishedPredictionsPage seasonCode={season.code} />);

  const goals = await screen.findByRole("textbox", { name: /Gole: Bayern/ });
  fireEvent.change(goals, { target: { value: "3" } });
  fireEvent.click(screen.getByRole("button", { name: "Zapisz typy (1)" }));
  fireEvent.change(goals, { target: { value: "2" } });
  loseSaveResponse();

  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Zapisz typy (1)" })).toBeEnabled(),
  );
  expect(screen.getByRole("textbox", { name: /Gole: Bayern/ })).toHaveValue("2");
  expect(
    fetchMock.mock.calls.filter(([path, options]) => path === predictionsPath && !options?.method),
  ).toHaveLength(2);
});

it("hides the previous player's scores while checking the session on return", async () => {
  const [bayern] = editableRounds().rounds[1].matches;
  let playerChanged = false;
  let completeSession!: (response: Response) => void;
  const newSession = new Promise<Response>((resolve) => {
    completeSession = resolve;
  });
  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path === sessionPath) {
        return playerChanged
          ? newSession
          : Response.json({ authenticated: true, player, csrfToken: "player-csrf" });
      }
      if (path === predictionsPath) {
        return Response.json({
          predictions: playerChanged
            ? []
            : [{ matchId: bayern.id, homeGoals: 2, awayGoals: 1, points: null }],
          serverNow,
        });
      }
      return Response.json(editableRounds());
    }),
  );
  const { rerender } = render(<PublishedPredictionsPage seasonCode={season.code} />);
  const bayernGoals = await screen.findByRole("textbox", { name: /Gole: Bayern/ });
  fireEvent.change(bayernGoals, { target: { value: "3" } });

  rerender(<PublishedPredictionsPage seasonCode={season.code} active={false} />);
  playerChanged = true;
  rerender(<PublishedPredictionsPage seasonCode={season.code} active />);
  expect(screen.queryByRole("textbox", { name: /Gole: Bayern/ })).not.toBeInTheDocument();
  completeSession(
    Response.json({
      authenticated: true,
      csrfToken: "another-csrf",
      player: { ...player, id: "60000000-0000-0000-0000-000000000002" },
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole("textbox", { name: /Gole: Bayern/ })).toHaveValue(""),
  );
});

it("shows points and pending results only for saved predictions", async () => {
  const rounds = publishedRounds();
  const [bayern, barcelona] = rounds.rounds[1].matches;
  const milan = fixture(4, "2025-04-30T19:00:00Z", "Milan");
  const chelsea = fixture(6, "2025-04-30T19:00:00Z", "Chelsea");
  milan.scores.regulationTime = { home: null, away: null };
  rounds.rounds[1].matches.push(milan, fixture(5, "2025-04-30T19:00:00Z", "Dortmund"), chelsea);

  vi.stubGlobal(
    "fetch",
    vi.fn(async (path: string) => {
      if (path === sessionPath) {
        return Response.json({ authenticated: true, player, csrfToken: "player-csrf" });
      }
      if (path === predictionsPath) {
        return Response.json({
          predictions: [
            { matchId: bayern.id, homeGoals: 0, awayGoals: 4, points: 0 },
            { matchId: barcelona.id, homeGoals: 0, awayGoals: 7, points: -3 },
            { matchId: milan.id, homeGoals: 1, awayGoals: 0, points: null },
            { matchId: chelsea.id, homeGoals: 2, awayGoals: 1, points: 10 },
          ],
          serverNow: "2025-05-01T18:00:00Z",
        });
      }
      return Response.json(rounds);
    }),
  );
  render(<PublishedPredictionsPage seasonCode={season.code} />);

  expect(await screen.findByText("0 pkt")).toBeInTheDocument();
  expect(
    within(screen.getByRole("article", { name: "Barcelona — Inter" })).getByText("-3 pkt"),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("article", { name: "Milan — Inter" })).getByText("Oczekuje na punkty"),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("article", { name: "Chelsea — Inter" })).getByText("10 pkt"),
  ).toBeInTheDocument();
  expect(
    within(screen.getByRole("article", { name: "Dortmund — Inter" })).queryByText(/pkt|punkty/),
  ).not.toBeInTheDocument();
});

it("retries an unavailable response and then shows the real empty state", async () => {
  vi.stubGlobal(
    "fetch",
    vi
      .fn()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(Response.json({ season, competition, rounds: [] })),
  );
  render(<PublishedPredictionsPage seasonCode={season.code} />);

  expect(await screen.findByRole("alert")).toHaveTextContent("Nie udało się pobrać rund");
  fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
  expect(
    await screen.findByRole("heading", { name: "Brak opublikowanych rund" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
});
