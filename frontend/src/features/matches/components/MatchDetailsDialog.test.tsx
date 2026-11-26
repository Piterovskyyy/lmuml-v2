import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FootballMatch } from "../api/season-matches";
import { MatchState } from "../model/match-status";
import { MatchDetailsDialog } from "./MatchDetailsDialog";

const matchId = "30000000-0000-4000-8000-000000000001";
const statisticsUrl = `/api/v1/matches/${matchId}/statistics`;
const eventsUrl = `/api/v1/matches/${matchId}/events`;
const lineupsUrl = `/api/v1/matches/${matchId}/lineups`;
const playerStatisticsUrl = `/api/v1/matches/${matchId}/player-statistics`;
const stats = {
  matchId,
  capturedAt: "2026-10-21T21:00:00Z",
  home: {
    shotsTotal: 12,
    shotsOnTarget: 0,
    possessionPercent: 57.5,
    corners: 2,
    fouls: 9,
    saves: null,
  },
  away: {
    shotsTotal: 7,
    shotsOnTarget: null,
    possessionPercent: 42.5,
    corners: 3,
    fouls: 8,
    saves: null,
  },
};
const matchEvents = {
  matchId,
  capturedAt: "2026-10-21T21:00:00Z",
  events: [
    {
      minute: 45,
      addedTime: 2,
      side: "HOME",
      kind: "GOAL",
      playerName: "Igor Bartoś",
      relatedPlayerName: "Michał Czajka",
    },
    {
      minute: 45,
      addedTime: 2,
      side: "AWAY",
      kind: "YELLOW_CARD",
      playerName: null,
      relatedPlayerName: null,
    },
    {
      minute: 68,
      addedTime: null,
      side: "AWAY",
      kind: "SUBSTITUTION",
      playerName: "Andrzej Żak",
      relatedPlayerName: "Piotr Zięba",
    },
    {
      minute: 72,
      addedTime: null,
      side: null,
      kind: "VIDEO_REVIEW_FUTURE",
      playerName: null,
      relatedPlayerName: null,
    },
  ],
};
const matchLineups = {
  matchId,
  capturedAt: "2026-10-21T20:00:00Z",
  home: {
    formation: "4-3-3",
    coachName: "Roman Ostoja",
    starters: [
      { name: "Igor Bartoś", number: 11, position: "FORWARD", gridRow: null, gridColumn: null },
    ],
    substitutes: [
      {
        name: "Michał Czajka",
        number: null,
        position: "MIDFIELDER",
        gridRow: null,
        gridColumn: null,
      },
    ],
  },
  away: {
    formation: "3-5-2",
    coachName: "Tomasz Polak",
    starters: [
      { name: "Piotr Zięba", number: 1, position: "GOALKEEPER", gridRow: 1, gridColumn: 1 },
    ],
    substitutes: [
      { name: "Andrzej Żak", number: 4, position: "DEFENDER", gridRow: null, gridColumn: null },
    ],
  },
};
const matchPlayerStats = {
  matchId,
  capturedAt: "2026-10-21T21:00:00Z",
  home: [
    {
      name: "Igor Bartoś",
      number: 11,
      position: "FORWARD",
      minutes: 90,
      rating: 8.5,
      goals: 2,
      assists: 0,
      shotsTotal: 4,
      shotsOnTarget: 3,
      passesTotal: 38,
      keyPasses: 5,
      tackles: 0,
      saves: null,
    },
    {
      name: "Michał Czajka",
      number: null,
      position: "MIDFIELDER",
      minutes: 55,
      rating: 6.9,
      goals: 0,
      assists: 1,
      shotsTotal: 0,
      shotsOnTarget: 0,
      passesTotal: 25,
      keyPasses: 2,
      tackles: 3,
      saves: null,
    },
    {
      name: "Witold Wrona",
      number: 20,
      position: "MIDFIELDER",
      minutes: null,
      rating: null,
      goals: null,
      assists: null,
      shotsTotal: null,
      shotsOnTarget: null,
      passesTotal: null,
      keyPasses: null,
      tackles: null,
      saves: null,
    },
  ],
  away: [
    {
      name: "Piotr Zięba",
      number: 1,
      position: "GOALKEEPER",
      minutes: 90,
      rating: null,
      goals: null,
      assists: null,
      shotsTotal: null,
      shotsOnTarget: null,
      passesTotal: 15,
      keyPasses: 0,
      tackles: 0,
      saves: 3,
    },
    {
      name: "Łukasz Pawlak",
      number: 10,
      position: "FORWARD",
      minutes: 0,
      rating: null,
      goals: null,
      assists: null,
      shotsTotal: null,
      shotsOnTarget: null,
      passesTotal: null,
      keyPasses: null,
      tackles: null,
      saves: null,
    },
  ],
};

function showMatch(state = MatchState.Finished) {
  const empty = { home: null, away: null };
  const match: FootballMatch = {
    id: matchId,
    tournamentRound: "League Stage - 2",
    kickoffAt: "2026-10-21T19:00:00Z",
    status: { state, finishType: null, elapsedMinutes: null, extraMinutes: null },
    homeTeam: { id: "10000000-0000-4000-8000-000000000001", name: "FC Północ", logoUrl: null },
    awayTeam: { id: "20000000-0000-4000-8000-000000000001", name: "Goście", logoUrl: null },
    scores: {
      total: { home: 1, away: 0 },
      regulationTime: { home: 1, away: 0 },
      halfTime: { home: 0, away: 0 },
      extraTime: empty,
      penalties: empty,
    },
    homeWinner: null,
    awayWinner: null,
  };
  render(
    <MatchDetailsDialog match={match}>
      <button type="button">Szczegóły meczu</button>
    </MatchDetailsDialog>,
  );
  return screen.getByRole("button", { name: "Szczegóły meczu" });
}

afterEach(() => vi.unstubAllGlobals());

function selectStatistics() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Statystyki" }), { button: 0 });
}

function selectLineups() {
  fireEvent.mouseDown(screen.getByRole("tab", { name: "Składy" }), { button: 0 });
}

describe("Match details statistics", () => {
  it("loads statistics on tab activation and shows zero, missing values and percentages separately", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === statisticsUrl ? Response.json(stats) : new Response(null, { status: 404 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const trigger = showMatch();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(eventsUrl, expect.anything());
    selectStatistics();

    const dialog = within(screen.getByRole("dialog"));
    const comparison = within(await dialog.findByRole("region", { name: "Statystyki meczu" }));
    expect(await comparison.findByText("57,5%")).toBeInTheDocument();
    expect(comparison.getByText("42,5%")).toBeInTheDocument();
    const onTarget = comparison.getByText("Strzały celne").nextElementSibling;
    expect(onTarget).toHaveTextContent("FC Północ: 0");
    expect(onTarget).toHaveTextContent("Goście: brak danych");
    expect(comparison.queryByText("Obrony bramkarza")).not.toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(2, statisticsUrl, expect.anything());
  });

  it("leaves score details visible when statistics are not imported", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
    fireEvent.click(showMatch());
    selectStatistics();

    const dialog = within(screen.getByRole("dialog"));
    expect(await dialog.findByText("Brak zapisanych statystyk do tego meczu.")).toBeInTheDocument();
    expect(dialog.getByText("Po 90 minutach")).toBeInTheDocument();
    expect(dialog.queryByRole("button", { name: "Ponów próbę" })).not.toBeInTheDocument();
  });

  it("retries a temporary error and aborts the pending read on close", async () => {
    const fetchMock = vi
      .fn<(url: string, options: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal("fetch", fetchMock);
    fireEvent.click(showMatch());
    selectStatistics();

    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(await dialog.findByRole("button", { name: "Ponów próbę" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));
    const signal = fetchMock.mock.calls[2]?.[1].signal;
    expect(signal?.aborted).toBe(false);
    fireEvent.click(dialog.getByRole("button", { name: "Zamknij" }));
    await waitFor(() => expect(signal?.aborted).toBe(true));
  });

  it("skips statistics and timeline when opening a scheduled match", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 404 }));
    vi.stubGlobal("fetch", fetchMock);
    fireEvent.click(showMatch(MatchState.Scheduled));

    const dialog = within(screen.getByRole("dialog"));
    expect(screen.queryByRole("tablist")).not.toBeInTheDocument();
    expect(await dialog.findByText("Składy tego meczu są niedostępne.")).toBeInTheDocument();
    expect(dialog.getByText("Po 90 minutach")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(lineupsUrl, expect.anything());
  });
});

describe("Match lineups", () => {
  function startingEleven(teamName: string, sizes: readonly number[]) {
    return sizes.flatMap((size, row) =>
      Array.from({ length: size }, (_, column) => ({
        name: `${teamName} ${row + 1}-${column + 1}`,
        number: null,
        position: "UNKNOWN",
        gridRow: row + 1,
        gridColumn: column + 1,
      })),
    );
  }

  it("loads on tab activation and shows both team summaries, starters and benches", async () => {
    const fetchMock = vi.fn(async (url: string) =>
      url === lineupsUrl ? Response.json(matchLineups) : new Response(null, { status: 404 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const trigger = showMatch();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(trigger);
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(eventsUrl, expect.anything());
    selectLineups();

    const panel = within(await screen.findByRole("region", { name: "Składy meczowe" }));
    const home = within(await panel.findByRole("region", { name: "FC Północ" }));
    const away = within(panel.getByRole("region", { name: "Goście" }));
    expect(home.getByRole("heading", { name: "FC Północ" })).toBeInTheDocument();
    expect(home.getByText("4-3-3")).toBeInTheDocument();
    expect(home.getByText("Roman Ostoja")).toBeInTheDocument();
    expect(away.getByRole("heading", { name: "Goście" })).toBeInTheDocument();
    expect(away.getByText("3-5-2")).toBeInTheDocument();
    expect(away.getByText("Tomasz Polak")).toBeInTheDocument();

    const homeStarters = within(panel.getByRole("region", { name: "Pierwszy skład · FC Północ" }));
    const awayStarters = within(panel.getByRole("region", { name: "Pierwszy skład · Goście" }));
    expect(homeStarters.getByRole("listitem")).toHaveTextContent("Igor Bartoś");
    expect(homeStarters.getByText("Napastnik")).toBeInTheDocument();
    expect(awayStarters.getByRole("listitem")).toHaveTextContent("Piotr Zięba");
    expect(awayStarters.getByText("Bramkarz")).toBeInTheDocument();

    const benchSummaries = panel.getAllByText("Rezerwowi (1)");
    expect(benchSummaries).toHaveLength(2);
    for (const summary of benchSummaries) {
      expect(summary.closest("details")).not.toHaveAttribute("open");
      fireEvent.click(summary);
    }
    expect(panel.getByText("Michał Czajka").closest("details")).toHaveAttribute("open");
    expect(panel.getByText("Andrzej Żak").closest("details")).toHaveAttribute("open");
    expect(fetchMock).toHaveBeenNthCalledWith(2, lineupsUrl, expect.anything());
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("orders both elevens by grid position on one pitch and shows player highlights", async () => {
    const homeStarters = startingEleven("Gospodarz", [1, 4, 3, 3]).map((player, index) =>
      index === 10
        ? {
            ...player,
            rating: 8.5,
            goals: 2,
            assists: 1,
            substitutedOn: null,
            substitutedOff: { minute: 90, addedTime: 2 },
          }
        : player,
    );
    const awayStarters = startingEleven("Gość", [1, 3, 5, 2]);
    const substitutes = matchLineups.home.substitutes.map((player) => ({
      ...player,
      rating: null,
      goals: 0,
      assists: null,
      substitutedOn: { minute: 90, addedTime: 2 },
      substitutedOff: null,
    }));
    const data = {
      ...matchLineups,
      home: { ...matchLineups.home, starters: homeStarters.slice().reverse(), substitutes },
      away: { ...matchLineups.away, starters: awayStarters.slice().reverse() },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
    fireEvent.click(showMatch(MatchState.Scheduled));

    const pitch = within(await screen.findByRole("region", { name: "Ustawienie na boisku" }));
    const homePlayers = within(
      pitch.getByRole("list", { name: "FC Północ na boisku" }),
    ).getAllByRole("listitem");
    const awayPlayers = within(pitch.getByRole("list", { name: "Goście na boisku" })).getAllByRole(
      "listitem",
    );
    expect(homePlayers).toHaveLength(11);
    expect(awayPlayers).toHaveLength(11);
    homePlayers.forEach((row, index) => {
      expect(row).toHaveTextContent(homeStarters[index].name);
    });
    awayPlayers.forEach((row, index) => {
      expect(row).toHaveTextContent(awayStarters[index].name);
    });
    const highlightedPlayer = within(homePlayers[10]);
    expect(highlightedPlayer.getByTitle("Ocena: 8,5")).toBeInTheDocument();
    expect(highlightedPlayer.getByTitle("Bramki: 2")).toBeInTheDocument();
    expect(highlightedPlayer.getByTitle("Asysty: 1")).toBeInTheDocument();
    expect(highlightedPlayer.getByTitle("Schodzi: 90+2′")).toBeInTheDocument();
    const legend = within(screen.getByRole("list", { name: "Oznaczenia na boisku" }));
    expect(legend.getAllByRole("listitem").map((item) => item.textContent?.trim())).toEqual([
      "Ocena",
      "Bramki",
      "Asysty",
      "Schodzi",
    ]);

    fireEvent.click(screen.getAllByText("Rezerwowi (1)")[0]);
    const substitute = screen.getByText("Michał Czajka").closest("li")!;
    expect(substitute).toHaveTextContent("Wchodzi 90+2′");
    expect(within(substitute).queryByText("Bramki")).not.toBeInTheDocument();
  });

  it("shows both starting lists when one team has a duplicate grid slot", async () => {
    const homeStarters = startingEleven("Gospodarz", [1, 4, 3, 3]);
    const awayStarters = startingEleven("Gość", [1, 3, 5, 2]).map((player, index) =>
      index === 1 ? { ...player, name: "Duplikat pola", gridRow: 1, gridColumn: 1 } : player,
    );
    const data = {
      ...matchLineups,
      home: { ...matchLineups.home, starters: homeStarters },
      away: { ...matchLineups.away, starters: awayStarters },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json(data)));
    fireEvent.click(showMatch(MatchState.Scheduled));

    expect(
      await screen.findByText("Brak danych do wyświetlenia ustawienia na boisku."),
    ).toBeInTheDocument();
    expect(screen.queryByRole("region", { name: "Ustawienie na boisku" })).not.toBeInTheDocument();
    const home = within(screen.getByRole("region", { name: "Pierwszy skład · FC Północ" }));
    const away = within(screen.getByRole("region", { name: "Pierwszy skład · Goście" }));
    expect(home.getAllByRole("listitem")).toHaveLength(11);
    expect(away.getAllByRole("listitem")).toHaveLength(11);
    expect(home.getByText("Gospodarz 1-1")).toBeInTheDocument();
    expect(away.getByText("Duplikat pola")).toBeInTheDocument();
  });
});

describe("Match player statistics", () => {
  it("loads separately from team comparison and shows searchable team rosters with expandable metrics", async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (url === statisticsUrl) return Response.json(stats);
      if (url === playerStatisticsUrl) return Response.json(matchPlayerStats);
      return new Response(null, { status: 404 });
    });
    vi.stubGlobal("fetch", fetchMock);
    fireEvent.click(showMatch());
    selectStatistics();
    expect(await screen.findByText("57,5%")).toBeInTheDocument();
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([eventsUrl, statisticsUrl]);

    fireEvent.keyDown(screen.getByRole("tab", { name: "Zawodnicy" }), { key: "Enter" });
    const panel = within(await screen.findByRole("region", { name: "Statystyki zawodników" }));
    const search = await panel.findByRole("searchbox", { name: "Szukaj zawodnika" });
    const list = within(panel.getByRole("list"));
    expect(list.getAllByRole("listitem")).toHaveLength(2);
    expect(panel.queryByText("Witold Wrona")).not.toBeInTheDocument();
    expect(panel.getByText("Oceny w skali od 0 do 10.")).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "bartos" } });
    const player = list.getByRole("listitem");
    expect(player).toHaveTextContent("Igor Bartoś");
    expect(player.querySelector("summary")).toHaveTextContent("90 min");
    expect(player.querySelector("summary")).toHaveTextContent("Ocena 8,5");
    expect(player.querySelector("details")).not.toHaveAttribute("open");
    fireEvent.click(list.getByText("Igor Bartoś"));
    expect(player.querySelector("details")).toHaveAttribute("open");
    expect(within(player).getByText("Bramki").nextElementSibling).toHaveTextContent("2");
    expect(within(player).getByText("Asysty").nextElementSibling).toHaveTextContent("0");
    expect(within(player).getByText("Obrony bramkarza").nextElementSibling).toHaveTextContent(
      "brak danych",
    );

    fireEvent.change(search, { target: { value: "Nieistniejący" } });
    expect(
      panel.getByText("Nie znaleziono zawodnika ze statystykami w tej drużynie."),
    ).toBeInTheDocument();
    fireEvent.click(panel.getByRole("button", { name: "Goście (goście)" }));
    expect(panel.getByRole("searchbox")).toHaveValue("");
    expect(panel.getByText("Piotr Zięba")).toBeInTheDocument();
    expect(panel.getByText("Łukasz Pawlak").closest("summary")).toHaveTextContent("0 min");
    expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([
      eventsUrl,
      statisticsUrl,
      playerStatisticsUrl,
    ]);
  });

  it("retries a failed request and keeps the team statistics and match score available", async () => {
    const fetchMock = vi
      .fn<(url: string, options: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json(stats))
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(Response.json(stats));
    vi.stubGlobal("fetch", fetchMock);
    fireEvent.click(showMatch());
    selectStatistics();
    expect(await screen.findByText("57,5%")).toBeInTheDocument();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Zawodnicy" }), { button: 0 });
    const playerPanel = within(screen.getByRole("region", { name: "Statystyki zawodników" }));
    fireEvent.click(await playerPanel.findByRole("button", { name: "Ponów próbę" }));
    expect(
      await playerPanel.findByText("Brak zapisanych statystyk zawodników do tego meczu."),
    ).toBeInTheDocument();
    expect(playerPanel.queryByRole("button", { name: "Ponów próbę" })).not.toBeInTheDocument();
    expect(screen.getByText("Po 90 minutach")).toBeInTheDocument();

    fireEvent.mouseDown(screen.getByRole("tab", { name: "Drużyny" }), { button: 0 });
    expect(await screen.findByText("57,5%")).toBeInTheDocument();
    expect(fetchMock).toHaveBeenNthCalledWith(3, playerStatisticsUrl, expect.anything());
    expect(fetchMock).toHaveBeenNthCalledWith(4, playerStatisticsUrl, expect.anything());
  });
});

describe("Match details timeline", () => {
  it("loads on opening and preserves event order, added minutes and player roles", async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(matchEvents));
    vi.stubGlobal("fetch", fetchMock);
    const trigger = showMatch();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(trigger);

    const rows = await screen.findAllByRole("listitem");
    expect(fetchMock).toHaveBeenCalledExactlyOnceWith(eventsUrl, expect.anything());
    expect(rows).toHaveLength(4);
    expect(rows[0]).toHaveTextContent("45+2′");
    expect(rows[0]).toHaveTextContent("Asysta · Michał Czajka");
    expect(rows[0]).toHaveTextContent("FC Północ");
    expect(rows[1]).toHaveTextContent("45+2′");
    expect(rows[1]).toHaveTextContent("Żółta kartka");
    expect(rows[1]).toHaveTextContent("Brak danych o zawodniku");
    expect(rows[2]).toHaveTextContent("SchodziAndrzej Żak");
    expect(rows[2]).toHaveTextContent("WchodziPiotr Zięba");
    expect(rows[2]).toHaveTextContent("Goście");
    expect(rows[3]).toHaveTextContent("Inne zdarzenie");
  });

  it("distinguishes an empty snapshot and a missing snapshot without hiding the score", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce(Response.json({ ...matchEvents, events: [] }))
        .mockResolvedValueOnce(new Response(null, { status: 404 })),
    );
    const trigger = showMatch();
    fireEvent.click(trigger);

    const dialog = within(screen.getByRole("dialog"));
    expect(await dialog.findByText("Brak zdarzeń w zapisanych danych.")).toBeInTheDocument();
    expect(dialog.getByText("Po 90 minutach")).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Zamknij" }));
    fireEvent.click(trigger);

    expect(await screen.findByText("Dane o przebiegu meczu są niedostępne.")).toBeInTheDocument();
    expect(within(screen.getByRole("dialog")).getByText("Po 90 minutach")).toBeInTheDocument();
  });

  it("retries timeline failures and cancels pending reads when switching tabs with the keyboard", async () => {
    const fetchMock = vi
      .fn<(url: string, options: RequestInit) => Promise<Response>>()
      .mockResolvedValueOnce(new Response(null, { status: 503 }))
      .mockImplementationOnce(() => new Promise(() => {}))
      .mockResolvedValueOnce(Response.json(stats));
    vi.stubGlobal("fetch", fetchMock);
    fireEvent.click(showMatch());

    const retry = await screen.findByRole("button", { name: "Ponów próbę" });
    fireEvent.click(retry);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    const signal = fetchMock.mock.calls[1]?.[1].signal;
    expect(signal?.aborted).toBe(false);

    const eventsTab = screen.getByRole("tab", { name: "Przebieg" });
    const statisticsTab = screen.getByRole("tab", { name: "Statystyki" });
    eventsTab.focus();
    fireEvent.keyDown(eventsTab, { key: "ArrowRight" });
    await waitFor(() => expect(statisticsTab).toHaveFocus());
    expect(statisticsTab).toHaveAttribute("aria-selected", "false");
    fireEvent.keyDown(statisticsTab, { key: "Enter" });
    await waitFor(() => expect(signal?.aborted).toBe(true));
    expect(await screen.findByText("57,5%")).toBeInTheDocument();
  });
});
