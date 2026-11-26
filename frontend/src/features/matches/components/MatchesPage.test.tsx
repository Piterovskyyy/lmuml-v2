import { FinishType, MatchState } from "../model/match-status";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { FootballMatch, SeasonMatchesResponse } from "../api/season-matches";
import { TournamentStage } from "../model/competition-stage";
import { buildKnockoutBracket } from "../model/knockout-bracket";
import { KnockoutBracket } from "./KnockoutBracket";
import { MatchRow } from "./MatchRow";
import { MatchBrowser } from "./MatchesPage";

function fixture(index: number, overrides: Partial<FootballMatch> = {}): FootballMatch {
  const suffix = String(index).padStart(12, "0");
  return {
    id: `30000000-0000-4000-8000-${suffix}`,
    tournamentRound: "League Stage - 1",
    kickoffAt: "2026-10-25T00:30:00Z",
    status: {
      state: MatchState.Finished,
      finishType: FinishType.RegulationTime,
      elapsedMinutes: 90,
      extraMinutes: null,
    },
    homeTeam: {
      id: `10000000-0000-4000-8000-${suffix}`,
      name: `FC Północ ${index}`,
      logoUrl: null,
    },
    awayTeam: { id: `20000000-0000-4000-8000-${suffix}`, name: `Goście ${index}`, logoUrl: null },
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

function season(matches: FootballMatch[]): SeasonMatchesResponse {
  return {
    season: {
      id: "40000000-0000-4000-8000-000000000001",
      code: "demo-2026",
      name: "Sezon demonstracyjny",
      startYear: 2026,
    },
    competition: {
      id: "50000000-0000-4000-8000-000000000001",
      code: "demo-cup",
      name: "Puchar demonstracyjny",
      logoUrl: null,
    },
    matches,
  };
}

function matchWithState(index: number, state: MatchState): FootballMatch {
  return fixture(index, {
    status: { state, finishType: null, elapsedMinutes: null, extraMinutes: null },
  });
}

describe("MatchBrowser", () => {
  it("searches Polish team names and recovers from no results by clearing all filters", () => {
    render(<MatchBrowser data={season([fixture(1), matchWithState(2, MatchState.Scheduled)])} />);
    const search = screen.getByRole("searchbox", { name: "Szukaj drużyny lub rundy" });

    fireEvent.click(screen.getByRole("button", { name: "Nadchodzące" }));
    fireEvent.change(search, { target: { value: "POLNOC" } });
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article", { name: "FC Północ 2 — Goście 2" })).toBeInTheDocument();

    fireEvent.change(search, { target: { value: "nieistniejąca drużyna" } });
    expect(
      screen.getByRole("heading", { name: "Nie znaleźliśmy takich meczów" }),
    ).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pokaż wszystkie mecze" }));
    expect(search).toHaveValue("");
    expect(screen.getByRole("button", { name: "Wszystkie" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(
      screen.queryByRole("heading", { name: "Nie znaleźliśmy takich meczów" }),
    ).not.toBeInTheDocument();
  });

  it("switches between finished, upcoming, live and all matches without treating unknown states as upcoming", () => {
    render(
      <MatchBrowser
        data={season([
          fixture(1),
          matchWithState(2, MatchState.Scheduled),
          matchWithState(3, MatchState.TimeUnconfirmed),
          matchWithState(4, MatchState.Live),
          matchWithState(5, MatchState.Break),
          matchWithState(6, MatchState.Postponed),
          matchWithState(7, MatchState.Unknown),
        ])}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Zakończone" }));
    expect(screen.getAllByRole("article")).toHaveLength(1);
    expect(screen.getByRole("article", { name: "FC Północ 1 — Goście 1" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Nadchodzące" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("article", { name: "FC Północ 2 — Goście 2" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "FC Północ 3 — Goście 3" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Na żywo" }));
    expect(screen.getAllByRole("article")).toHaveLength(2);
    expect(screen.getByRole("article", { name: "FC Północ 4 — Goście 4" })).toBeInTheDocument();
    expect(screen.getByRole("article", { name: "FC Północ 5 — Goście 5" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Wszystkie" }));
    expect(screen.getAllByRole("article")).toHaveLength(7);
    expect(screen.getByText("Status nieznany")).toBeInTheDocument();
    expect(screen.getByText("Przełożony")).toBeInTheDocument();
  });

  it("reveals the next matches within active filters and starts from the first page when the search changes", () => {
    const upcoming = Array.from({ length: 50 }, (_, index) =>
      matchWithState(index + 1, MatchState.Scheduled),
    );
    const otherTeam = matchWithState(100, MatchState.Scheduled);
    otherTeam.homeTeam.name = "Zachód United";
    render(<MatchBrowser data={season([...upcoming, fixture(99), otherTeam])} />);
    const search = screen.getByRole("searchbox", { name: "Szukaj drużyny lub rundy" });
    const upcomingFilter = screen.getByRole("button", { name: "Nadchodzące" });

    fireEvent.click(upcomingFilter);
    fireEvent.change(search, { target: { value: "Północ" } });
    expect(screen.getAllByRole("article")).toHaveLength(24);
    expect(screen.getByText("Wyświetlono 24 z 50 meczów")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Pokaż kolejne mecze" }));
    expect(screen.getAllByRole("article")).toHaveLength(48);
    expect(screen.getByText("Wyświetlono 48 z 50 meczów")).toBeInTheDocument();
    expect(search).toHaveValue("Północ");
    expect(upcomingFilter).toHaveAttribute("aria-pressed", "true");

    fireEvent.change(search, { target: { value: "" } });
    expect(screen.getAllByRole("article")).toHaveLength(24);
    expect(screen.getByText("Wyświetlono 24 z 51 meczów")).toBeInTheDocument();
    expect(upcomingFilter).toHaveAttribute("aria-pressed", "true");
  });

  it("explains an empty season without presenting it as a failed search", () => {
    render(<MatchBrowser data={season([])} />);

    expect(
      screen.getByRole("heading", { name: "Ten sezon jeszcze czeka na mecze" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Wróć tutaj po uzupełnieniu terminarza.")).toBeInTheDocument();
    expect(screen.queryByRole("article")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pokaż kolejne mecze" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pokaż wszystkie mecze" })).not.toBeInTheDocument();
  });
});

describe("MatchRow details", () => {
  it.each([
    { finishType: FinishType.ExtraTime, penalties: false },
    { finishType: FinishType.Penalties, penalties: true },
  ])(
    "keeps the 90-minute result separate for $finishType and restores focus after Escape",
    async ({ finishType, penalties }) => {
      const match = fixture(1, {
        status: { state: MatchState.Finished, finishType, elapsedMinutes: 120, extraMinutes: 7 },
        scores: {
          total: { home: 1, away: 1 },
          halfTime: { home: 0, away: 0 },
          regulationTime: { home: 1, away: 0 },
          extraTime: { home: 0, away: 1 },
          penalties: { home: penalties ? 5 : null, away: penalties ? 4 : null },
        },
      });
      render(<MatchRow match={match} />);

      const row = screen.getByRole("article", { name: "FC Północ 1 — Goście 1" });
      expect(within(row).getByLabelText("Po 90 min: 1 : 0")).toBeInTheDocument();
      const trigger = within(row).getByRole("button", {
        name: "Szczegóły: FC Północ 1 — Goście 1",
      });
      trigger.focus();
      fireEvent.click(trigger);

      const dialog = await screen.findByRole("dialog", { name: "FC Północ 1 — Goście 1" });
      expect(within(dialog).getByText("Do przerwy").nextElementSibling).toHaveTextContent("0 : 0");
      expect(within(dialog).getByText("Po 90 minutach").nextElementSibling).toHaveTextContent(
        "1 : 0",
      );
      expect(within(dialog).getByText("Po dogrywce").nextElementSibling).toHaveTextContent("1 : 1");
      if (penalties) {
        expect(within(dialog).getByText("Karne").nextElementSibling).toHaveTextContent("5 : 4");
      } else {
        expect(within(dialog).queryByText("Karne")).not.toBeInTheDocument();
      }

      fireEvent.keyDown(dialog, { key: "Escape", code: "Escape" });
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
      await waitFor(() => expect(trigger).toHaveFocus());
    },
  );
});

it("shows each leg in home–away order and opens the details of the selected match", async () => {
  const first = fixture(1, { tournamentRound: TournamentStage.RoundOf16 });
  first.scores.total = { home: 2, away: 0 };
  first.scores.regulationTime = first.scores.total;
  const replay = fixture(2, {
    tournamentRound: first.tournamentRound,
    kickoffAt: "2026-11-01T00:30:00Z",
    homeTeam: first.awayTeam,
    awayTeam: first.homeTeam,
  });
  replay.scores.total = { home: 2, away: 1 };
  replay.scores.regulationTime = replay.scores.total;
  render(<KnockoutBracket rounds={buildKnockoutBracket([first, replay])} />);

  const firstButton = screen.getByRole("button", { name: /1\. mecz, FC Północ 1 — Goście 1/ });
  const replayButton = screen.getByRole("button", { name: /Rewanż, Goście 1 — FC Północ 1/ });
  expect(firstButton).toHaveTextContent("2 : 0");
  expect(replayButton).toHaveTextContent("2 : 1");

  fireEvent.click(firstButton);
  const firstDialog = await screen.findByRole("dialog", { name: "FC Północ 1 — Goście 1" });
  fireEvent.keyDown(firstDialog, { key: "Escape", code: "Escape" });
  await waitFor(() => expect(firstButton).toHaveFocus());

  fireEvent.click(replayButton);
  const replayDialog = await screen.findByRole("dialog", { name: "Goście 1 — FC Północ 1" });
  expect(within(replayDialog).getByText("Po 90 minutach").nextElementSibling).toHaveTextContent(
    "2 : 1",
  );
});
