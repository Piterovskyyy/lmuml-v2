import { FinishType, MatchState } from "../model/match-status";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { domAnimation, LazyMotion, MotionConfig } from "motion/react";
import { afterEach, expect, it, vi } from "vitest";
import { mockWebSocket } from "@/test/mock-web-socket";
import type { FootballMatch, SeasonMatchesResponse } from "../api/season-matches";
import { matchdayRefreshIntervalMs } from "../model/use-matchday-refresh";
import { MatchesPage } from "./MatchesPage";

const originalLocation = window.location.href;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", originalLocation);
});

function fixture(index: number, homeName: string): FootballMatch {
  const suffix = String(index).padStart(12, "0");
  return {
    id: `30000000-0000-0000-0000-${suffix}`,
    tournamentRound: "League Stage - 1",
    kickoffAt: "2026-10-25T00:30:00Z",
    status: {
      state: MatchState.Finished,
      finishType: FinishType.RegulationTime,
      elapsedMinutes: 90,
      extraMinutes: null,
    },
    homeTeam: { id: `10000000-0000-0000-0000-${suffix}`, name: homeName, logoUrl: null },
    awayTeam: { id: `20000000-0000-0000-0000-${suffix}`, name: `Goście ${index}`, logoUrl: null },
    scores: {
      total: { home: 0, away: 0 },
      halfTime: { home: null, away: null },
      regulationTime: { home: 0, away: 0 },
      extraTime: { home: null, away: null },
      penalties: { home: null, away: null },
    },
    homeWinner: null,
    awayWinner: null,
  };
}

function response(
  homeName = "FC Północ",
  fixturesCapturedAt?: string | null,
  matches = [fixture(1, homeName), fixture(2, "AC Wschód")],
): Response {
  const body: SeasonMatchesResponse = {
    season: {
      id: "40000000-0000-0000-0000-000000000001",
      code: "demo-2026",
      name: "Sezon demonstracyjny",
      startYear: 2026,
    },
    competition: {
      id: "50000000-0000-0000-0000-000000000001",
      code: "demo-cup",
      name: "Puchar demonstracyjny",
      logoUrl: null,
    },
    matches,
    fixturesCapturedAt,
  };
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

it("preserves the season, loaded matches and filters through a failed refresh and a successful retry", async () => {
  window.history.replaceState(null, "", "/?season=demo-2026#mecze");
  const firstCapture = "2026-10-25T00:30:00Z";
  const nextCapture = "2026-10-25T02:45:00Z";
  let completeRefresh!: (response: Response) => void;
  const refresh = new Promise<Response>((resolve) => {
    completeRefresh = resolve;
  });
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(response(undefined, firstCapture))
    .mockReturnValueOnce(refresh)
    .mockResolvedValueOnce(response("FC Północ po korekcie", nextCapture));
  vi.stubGlobal("fetch", fetchMock);

  render(
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="always">
        <MatchesPage reduceMotion />
      </MotionConfig>
    </LazyMotion>,
  );

  await screen.findByRole("article", { name: "FC Północ — Goście 1" });
  const captureTime = screen.getByText(/25 października 2026.*02:30/);
  expect(captureTime).toHaveAttribute("datetime", firstCapture);
  const search = screen.getByRole("searchbox", { name: "Szukaj drużyny lub rundy" });
  fireEvent.change(search, { target: { value: "Północ" } });
  fireEvent.click(screen.getByRole("button", { name: "Zakończone" }));
  expect(screen.queryByRole("article", { name: "AC Wschód — Goście 2" })).not.toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Odśwież mecze" }));
  await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  expect(screen.getByRole("article", { name: "FC Północ — Goście 1" })).toBeInTheDocument();
  expect(search).toHaveValue("Północ");

  await act(async () => {
    completeRefresh(new Response("Database unavailable", { status: 503 }));
  });
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent("Nie udało się odświeżyć meczów.");
  expect(alert).toHaveTextContent("Pokazujemy poprzednio wczytane dane.");
  expect(captureTime).toBeVisible();
  expect(captureTime).toHaveAttribute("datetime", firstCapture);
  expect(screen.getByRole("searchbox", { name: "Szukaj drużyny lub rundy" })).toBe(search);
  expect(search).toHaveValue("Północ");
  expect(screen.getByRole("button", { name: "Zakończone" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.getByRole("article", { name: "FC Północ — Goście 1" })).toBeInTheDocument();

  fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
  await screen.findByRole("article", { name: "FC Północ po korekcie — Goście 1" });
  expect(screen.getByText(/25 października 2026.*03:45/)).toHaveAttribute("datetime", nextCapture);
  expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  expect(search).toHaveValue("Północ");
  expect(screen.getByRole("button", { name: "Zakończone" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  expect(screen.queryByRole("article", { name: "AC Wschód — Goście 2" })).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(fetchMock.mock.calls.every(([url]) => url === "/api/v1/seasons/demo-2026/matches")).toBe(
    true,
  );
});

it.each([null, undefined])("hides the capture time when the API sends %s", async (capturedAt) => {
  window.history.replaceState(null, "", "/?season=demo-2026#mecze");
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response(undefined, capturedAt)));

  render(
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion="always">
        <MatchesPage reduceMotion />
      </MotionConfig>
    </LazyMotion>,
  );

  await screen.findByRole("article", { name: "FC Północ — Goście 1" });
  expect(screen.queryByText("Dane meczów pobrano")).not.toBeInTheDocument();
});

it("refreshes matches during the match window and keeps the active filters", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(new Date("2026-10-25T01:00:00Z"));
  window.history.replaceState(null, "", "/?season=demo-2026#mecze");

  const firstCapture = "2026-10-25T00:35:00Z";
  const nextCapture = "2026-10-25T01:00:00Z";
  const matches = [fixture(1, "FC Północ"), fixture(2, "AC Wschód")];
  const correctedMatches = [fixture(1, "FC Północ po korekcie"), matches[1]];
  const fetchMock = vi
    .fn()
    .mockResolvedValueOnce(response(undefined, firstCapture, matches))
    .mockResolvedValueOnce(response(undefined, nextCapture, correctedMatches));
  vi.stubGlobal("fetch", fetchMock);

  await act(async () => {
    render(
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="always">
          <MatchesPage reduceMotion />
        </MotionConfig>
      </LazyMotion>,
    );
  });

  expect(screen.getByRole("article", { name: "FC Północ — Goście 1" })).toBeInTheDocument();
  const search = screen.getByRole("searchbox", { name: "Szukaj drużyny lub rundy" });
  fireEvent.change(search, { target: { value: "Północ" } });

  await act(async () => {
    await vi.advanceTimersByTimeAsync(matchdayRefreshIntervalMs);
  });

  expect(
    screen.getByRole("article", { name: "FC Północ po korekcie — Goście 1" }),
  ).toBeInTheDocument();
  expect(screen.getByText(/25 października 2026.*02:00/)).toHaveAttribute("datetime", nextCapture);
  expect(search).toHaveValue("Północ");
  expect(screen.queryByRole("article", { name: "AC Wschód — Goście 2" })).not.toBeInTheDocument();
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock).toHaveBeenLastCalledWith(
    "/api/v1/seasons/demo-2026/matches",
    expect.anything(),
  );
});

it("updates matches through WebSocket and resumes polling after a disconnect", async () => {
  vi.useFakeTimers({ toFake: ["Date", "setTimeout", "clearTimeout"] });
  vi.setSystemTime(new Date("2026-10-25T01:00:00Z"));
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  window.history.replaceState(null, "", "/?season=demo-2026#mecze");
  const sockets = mockWebSocket();
  const firstCapture = "2026-10-25T00:35:00Z";
  const nextCapture = "2026-10-25T01:00:00Z";
  const fetchMatches = vi
    .fn()
    .mockResolvedValueOnce(response(undefined, firstCapture))
    .mockResolvedValueOnce(response("FC Północ po korekcie", nextCapture))
    .mockResolvedValueOnce(response("FC Północ po przerwie", "2026-10-25T01:15:00Z"));
  vi.stubGlobal("fetch", fetchMatches);

  await act(async () => {
    render(
      <LazyMotion features={domAnimation} strict>
        <MotionConfig reducedMotion="always">
          <MatchesPage reduceMotion />
        </MotionConfig>
      </LazyMotion>,
    );
  });
  act(() => sockets[0].open());
  act(() => sockets[0].fixtures(firstCapture));
  const search = screen.getByRole("searchbox", { name: "Szukaj drużyny lub rundy" });
  fireEvent.change(search, { target: { value: "Północ" } });
  await act(async () => sockets[0].fixtures(nextCapture));
  expect(screen.getByRole("article", { name: "FC Północ po korekcie — Goście 1" })).toBeVisible();
  expect(search).toHaveValue("Północ");

  await act(async () => vi.advanceTimersByTimeAsync(matchdayRefreshIntervalMs));
  expect(fetchMatches).toHaveBeenCalledTimes(2);
  await act(async () => sockets[0].disconnect());
  expect(screen.getByRole("article", { name: "FC Północ po przerwie — Goście 1" })).toBeVisible();
  expect(search).toHaveValue("Północ");
  expect(fetchMatches).toHaveBeenCalledTimes(3);
});
