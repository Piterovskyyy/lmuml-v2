import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { RoundStatus, type RoundWorkspace } from "../api/admin-rounds";
import { RoundsWorkspace } from "./RoundsWorkspace";

afterEach(() => vi.unstubAllGlobals());

it("saves the full selected blocks and publishes only after confirmation", async () => {
  const roundId = "40000000-0000-0000-0000-000000000001";
  const firstId = "30000000-0000-0000-0000-000000000001";
  const secondId = "30000000-0000-0000-0000-000000000002";
  const season = { code: "sample-2024", name: "Sezon testowy" };
  const workspace: RoundWorkspace = {
    season,
    nextNumber: 1,
    groups: [
      {
        key: "first",
        label: "1/8 finału — pierwsze mecze",
        tournamentRound: "Round of 16",
        matches: [
          {
            id: firstId,
            kickoffAt: "2025-03-04T20:00:00Z",
            homeTeam: "Inter",
            awayTeam: "Arsenal",
          },
        ],
        assignedRoundId: null,
      },
      {
        key: "second",
        label: "1/8 finału — rewanże",
        tournamentRound: "Round of 16",
        matches: [
          {
            id: secondId,
            kickoffAt: "2025-03-11T20:00:00Z",
            homeTeam: "Arsenal",
            awayTeam: "Inter",
          },
        ],
        assignedRoundId: null,
      },
    ],
    rounds: [],
  };
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/admin/rounds/seasons") return Response.json([season]);
    if (url === "/api/v1/seasons/active") return Response.json({ seasonCode: null });
    if (url === `/api/admin/seasons/${season.code}/sync-status`) {
      return Response.json({ lastSuccessfulAt: null, lastAttempt: null });
    }
    if (url === "/api/admin/rounds?season=sample-2024") return Response.json(workspace);
    if (url === "/api/admin/rounds" && init?.method === "POST") {
      workspace.nextNumber = 2;
      workspace.groups.forEach((group) => {
        group.assignedRoundId = roundId;
      });
      workspace.rounds.push({
        id: roundId,
        number: 1,
        name: "Runda 1",
        status: RoundStatus.Draft,
        groupKeys: ["first", "second"],
        matchCount: 2,
        publishedAt: null,
        awaitingFinal: false,
        pendingFinalMatch: null,
      });
      return new Response(null, { status: 201 });
    }
    if (url === `/api/admin/rounds/${roundId}/publish` && init?.method === "POST") {
      workspace.rounds[0].status = RoundStatus.Published;
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<RoundsWorkspace csrfToken="test-csrf" onSessionExpired={vi.fn()} />);
  const firstBlock = await screen.findByRole("checkbox", { name: /pierwsze mecze/ });
  const secondBlock = screen.getByRole("checkbox", { name: /rewanże/ });
  fireEvent.click(firstBlock);
  fireEvent.click(secondBlock);
  expect(screen.getByRole("spinbutton", { name: "Numer rundy" })).toHaveValue(1);
  fireEvent.click(screen.getByRole("button", { name: "Zapisz szkic" }));

  const publish = await screen.findByRole("button", { name: "Opublikuj rundę" });
  expect(screen.getByRole("heading", { name: "Runda 1" })).toBeInTheDocument();
  expect(screen.getByRole("checkbox", { name: /pierwsze mecze/ })).toBeDisabled();
  const [, createRequest] = fetchMock.mock.calls.find(([url]) => url === "/api/admin/rounds")!;
  expect(new Headers(createRequest?.headers).get("X-CSRF-TOKEN")).toBe("test-csrf");
  expect(JSON.parse(String(createRequest?.body))).toEqual({
    seasonCode: season.code,
    number: 1,
    groups: [
      { key: "first", matchIds: [firstId] },
      { key: "second", matchIds: [secondId] },
    ],
  });

  fireEvent.click(publish);
  const dialog = await screen.findByRole("dialog");
  expect(fetchMock.mock.calls.some(([url]) => url.endsWith("/publish"))).toBe(false);
  fireEvent.click(within(dialog).getByRole("button", { name: "Opublikuj rundę" }));
  await waitFor(() => expect(screen.getByText("Opublikowana")).toBeInTheDocument());
});

it("changes the active season with confirmation and preserves the last verified choice after an error", async () => {
  const previous = { code: "sample-2024", name: "Sezon archiwalny" };
  const next = { code: "sample-2025", name: "Nowy sezon" };
  let activeCode = previous.code;
  let failWrite = true;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "/api/admin/rounds/seasons") return Response.json([previous, next]);
    if (url === "/api/v1/seasons/active") return Response.json({ seasonCode: activeCode });
    if (url.endsWith("/sync-status")) {
      return Response.json({ lastSuccessfulAt: null, lastAttempt: null });
    }
    if (url === "/api/admin/seasons/active" && init?.method === "PUT") {
      if (failWrite) return new Response(null, { status: 503 });
      activeCode = next.code;
      return Response.json({ seasonCode: activeCode });
    }
    if (url.startsWith("/api/admin/rounds?season=")) {
      const season = url.endsWith(next.code) ? next : previous;
      return Response.json({ season, nextNumber: 1, groups: [], rounds: [] });
    }
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);

  render(<RoundsWorkspace csrfToken="test-csrf" onSessionExpired={vi.fn()} />);
  const setting = await screen.findByRole("region", { name: "Aktywny sezon dla graczy" });
  const trigger = within(setting).getByRole("button", { name: "Ustaw jako aktywny" });
  const activeLabel = within(setting).getByRole("status");
  await waitFor(() => expect(activeLabel).toHaveTextContent(previous.name));
  expect(trigger).toBeDisabled();

  fireEvent.change(screen.getByRole("combobox", { name: "Sezon" }), {
    target: { value: next.code },
  });
  fireEvent.click(trigger);
  let dialog = await screen.findByRole("dialog", { name: "Zmienić aktywny sezon?" });
  expect(
    within(dialog).getByText(`Po otwarciu aplikacji gracze zobaczą sezon „${next.name}”.`),
  ).toBeInTheDocument();
  const writes = () => fetchMock.mock.calls.filter(([url]) => url === "/api/admin/seasons/active");
  expect(writes()).toHaveLength(0);
  fireEvent.click(within(dialog).getByRole("button", { name: "Anuluj" }));
  expect(writes()).toHaveLength(0);

  fireEvent.click(trigger);
  dialog = await screen.findByRole("dialog", { name: "Zmienić aktywny sezon?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Ustaw jako aktywny" }));
  expect(await within(setting).findByRole("alert")).toHaveTextContent("potwierdzić zmiany");
  expect(activeLabel).toHaveTextContent(previous.name);
  expect(writes()).toHaveLength(1);
  const [, request] = writes()[0];
  expect(request?.method).toBe("PUT");
  expect(new Headers(request?.headers).get("X-CSRF-TOKEN")).toBe("test-csrf");
  expect(JSON.parse(String(request?.body))).toEqual({ seasonCode: next.code });

  fireEvent.click(within(setting).getByRole("button", { name: "Sprawdź ustawienie" }));
  await waitFor(() => expect(trigger).toBeEnabled());
  failWrite = false;
  fireEvent.click(trigger);
  dialog = await screen.findByRole("dialog", { name: "Zmienić aktywny sezon?" });
  fireEvent.click(within(dialog).getByRole("button", { name: "Ustaw jako aktywny" }));
  await waitFor(() => expect(activeLabel).toHaveTextContent(next.name));
  expect(within(setting).queryByRole("alert")).not.toBeInTheDocument();
  expect(writes()).toHaveLength(2);
});

it("loads synchronization for the selected season and refreshes it independently of rounds", async () => {
  const first = { code: "first-2025", name: "Pierwszy sezon" };
  const second = { code: "second-2026", name: "Drugi sezon" };
  const capturedAt = "2026-11-24T19:00:00Z";
  let secondStatus = 503;
  const fetchMock = vi.fn(async (url: string) => {
    if (url === "/api/admin/rounds/seasons") return Response.json([first, second]);
    if (url === "/api/v1/seasons/active") return Response.json({ seasonCode: null });
    if (url.startsWith("/api/admin/rounds?season=")) {
      const season = url.endsWith(second.code) ? second : first;
      return Response.json({ season, nextNumber: 1, groups: [], rounds: [] });
    }
    if (url === `/api/admin/seasons/${first.code}/sync-status`) {
      return Response.json({
        lastSuccessfulAt: capturedAt,
        lastAttempt: {
          startedAt: "2026-11-24T19:15:00Z",
          finishedAt: "2026-11-24T19:16:00Z",
          outcome: "FAILED",
        },
      });
    }
    if (url === `/api/admin/seasons/${second.code}/sync-status`) {
      return secondStatus === 200
        ? Response.json({ lastSuccessfulAt: null, lastAttempt: null })
        : new Response(null, { status: secondStatus });
    }
    throw new Error(`Unexpected request ${url}`);
  });
  vi.stubGlobal("fetch", fetchMock);
  const onSessionExpired = vi.fn();
  render(<RoundsWorkspace csrfToken="test-csrf" onSessionExpired={onSessionExpired} />);

  const panel = () => within(screen.getByRole("region", { name: "Synchronizacja wyników" }));
  await screen.findByRole("region", { name: "Synchronizacja wyników" });
  expect(await panel().findByText("Nieudana")).toBeInTheDocument();
  expect(panel().getAllByRole("time")[0]).toHaveAttribute("datetime", capturedAt);

  fireEvent.change(screen.getByRole("combobox", { name: "Sezon" }), {
    target: { value: second.code },
  });
  expect(await panel().findByRole("alert")).toHaveTextContent("Nie udało się wczytać statusu");
  expect(panel().queryByText("Nieudana")).not.toBeInTheDocument();

  secondStatus = 200;
  fireEvent.click(panel().getByRole("button", { name: "Odśwież status" }));
  expect(await panel().findByText("Brak zapisanej próby")).toBeInTheDocument();
  expect(panel().getByText("Brak danych o pobraniu")).toBeInTheDocument();
  expect(
    fetchMock.mock.calls.filter(([url]) => url === `/api/admin/rounds?season=${second.code}`),
  ).toHaveLength(1);

  secondStatus = 401;
  fireEvent.click(panel().getByRole("button", { name: "Odśwież status" }));
  await waitFor(() => expect(onSessionExpired).toHaveBeenCalledOnce());
});
