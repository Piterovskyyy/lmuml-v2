import { act, renderHook } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { mockWebSocket } from "@/test/mock-web-socket";
import { useSeasonUpdates } from "./use-season-updates";

const baseline = "2026-11-25T21:00:00.123456Z";
const second = "2026-11-25T21:00:00.123457Z";
const third = "2026-11-25T21:15:00Z";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it("subscribes on open, reconciles each connection with REST, and deduplicates revisions", () => {
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const sockets = mockWebSocket();
  const refresh = vi.fn();
  const { result, rerender } = renderHook(
    (fixturesCapturedAt: string | null) =>
      useSeasonUpdates("demo-2026", refresh, { enabled: true, fixturesCapturedAt }),
    { initialProps: baseline },
  );

  expect(result.current).toBe(false);
  expect(sockets[0].url.host).toBe(window.location.host);
  expect(sockets[0].url.pathname).toBe("/api/v1/season-updates");
  expect(sockets[0].url.protocol).toBe("ws:");
  expect(sockets[0].send).not.toHaveBeenCalled();
  act(() => sockets[0].open());
  expect(sockets[0].send).toHaveBeenCalledExactlyOnceWith(
    JSON.stringify({ type: "subscribe", seasonCode: "demo-2026" }),
  );
  act(() => sockets[0].receive("invalid JSON"));
  act(() => sockets[0].fixtures("invalid revision"));
  expect(result.current).toBe(false);
  act(() => sockets[0].fixtures(baseline));
  expect(result.current).toBe(true);
  expect(refresh).not.toHaveBeenCalled();

  act(() => sockets[0].fixtures(second));
  act(() => sockets[0].fixtures(second));
  expect(refresh).toHaveBeenCalledTimes(1);
  act(() => sockets[0].fixtures(third));
  expect(refresh).toHaveBeenCalledTimes(2);
  rerender(third);
  expect(sockets).toHaveLength(1);

  act(() => sockets[0].disconnect());
  expect(result.current).toBe(false);
  act(() => vi.advanceTimersByTime(1_000));
  act(() => sockets[1].open());
  act(() => sockets[1].fixtures(third));
  expect(result.current).toBe(true);
  expect(refresh).toHaveBeenCalledTimes(2);
  act(() => sockets[1].disconnect());
  act(() => vi.advanceTimersByTime(1_000));
  act(() => sockets[2].open());
  act(() => sockets[2].fixtures("2026-11-25T21:30:00Z"));
  expect(refresh).toHaveBeenCalledTimes(3);
});

it("keeps polling before the first imported revision and closes the socket when hidden", () => {
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const sockets = mockWebSocket();
  const refresh = vi.fn();
  const { rerender, result, unmount } = renderHook(
    (seasonCode: string) =>
      useSeasonUpdates(seasonCode, refresh, { enabled: true, fixturesCapturedAt: null }),
    { initialProps: "demo-2026" },
  );
  act(() => sockets[0].open());
  act(() => sockets[0].fixtures(null));
  expect(result.current).toBe(false);
  expect(refresh).not.toHaveBeenCalled();

  hidden.mockReturnValue(true);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(result.current).toBe(false);
  expect(sockets[0].close).toHaveBeenCalledOnce();
  act(() => sockets[0].fixtures(second));
  expect(refresh).not.toHaveBeenCalled();

  hidden.mockReturnValue(false);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  act(() => sockets[1].open());
  act(() => sockets[1].fixtures(second));
  expect(result.current).toBe(true);
  expect(refresh).toHaveBeenCalledOnce();
  rerender("demo-2027");
  expect(sockets[1].close).toHaveBeenCalledOnce();
  act(() => sockets[2].open());
  expect(sockets[2].send).toHaveBeenCalledExactlyOnceWith(
    JSON.stringify({ type: "subscribe", seasonCode: "demo-2027" }),
  );
  unmount();
  expect(sockets[2].close).toHaveBeenCalledOnce();
});

it("waits for REST metadata and increases reconnect delays after failed subscriptions", () => {
  vi.useFakeTimers();
  vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const sockets = mockWebSocket();
  const { result, rerender } = renderHook(
    (fixturesCapturedAt: string | undefined) =>
      useSeasonUpdates("demo-2026", () => {}, { enabled: true, fixturesCapturedAt }),
    { initialProps: undefined },
  );
  expect(sockets).toHaveLength(0);
  rerender(baseline);
  act(() => sockets[0].disconnect());
  expect(result.current).toBe(false);
  act(() => vi.advanceTimersByTime(999));
  expect(sockets).toHaveLength(1);
  act(() => vi.advanceTimersByTime(1));
  expect(sockets).toHaveLength(2);
  act(() => sockets[1].open());
  // An open connection that never acknowledges its subscription must be retried too.
  act(() => vi.advanceTimersByTime(10_000));
  expect(sockets[1].close).toHaveBeenCalledOnce();
  act(() => vi.advanceTimersByTime(1_999));
  expect(sockets).toHaveLength(2);
  act(() => vi.advanceTimersByTime(1));
  expect(sockets).toHaveLength(3);
  act(() => sockets[2].open());
  act(() => sockets[2].fixtures(baseline));
  expect(result.current).toBe(true);
});

it("keeps polling after a policy close until the tab is active again", () => {
  vi.useFakeTimers();
  const hidden = vi.spyOn(document, "hidden", "get").mockReturnValue(false);
  const sockets = mockWebSocket();
  const { result } = renderHook(() =>
    useSeasonUpdates("demo-2026", () => {}, { enabled: true, fixturesCapturedAt: baseline }),
  );
  act(() => sockets[0].disconnect(1008));
  act(() => vi.advanceTimersByTime(60_000));
  expect(result.current).toBe(false);
  expect(sockets).toHaveLength(1);

  hidden.mockReturnValue(true);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  hidden.mockReturnValue(false);
  act(() => document.dispatchEvent(new Event("visibilitychange")));
  expect(sockets).toHaveLength(2);
});
