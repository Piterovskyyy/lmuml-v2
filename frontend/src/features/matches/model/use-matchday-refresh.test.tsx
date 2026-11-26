import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { matchdayRefreshIntervalMs, useMatchdayRefresh } from "./use-matchday-refresh";

const kickoffAt = "2026-11-17T20:00:00Z";
const kickoffTime = Date.parse(kickoffAt);
const kickoffTimes = [kickoffAt];
const minute = 60_000;

let hidden: boolean;

function advanceTime(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

function setTabHidden(value: boolean) {
  act(() => {
    hidden = value;
    document.dispatchEvent(new Event("visibilitychange"));
  });
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(kickoffTime);
  hidden = false;
  vi.spyOn(document, "hidden", "get").mockImplementation(() => hidden);
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() =>
    hidden ? "hidden" : "visible",
  );
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it("waits a minute before the first automatic refresh and cancels on unmount", () => {
  const refresh = vi.fn();
  const { unmount } = renderHook(() => useMatchdayRefresh(kickoffTimes, refresh));

  advanceTime(matchdayRefreshIntervalMs - 1);
  expect(refresh).not.toHaveBeenCalled();

  advanceTime(1);
  expect(refresh).toHaveBeenCalledTimes(1);

  unmount();
  advanceTime(5 * minute);
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("starts refreshing when the earliest upcoming window begins", () => {
  const refresh = vi.fn();
  vi.setSystemTime(kickoffTime - 16 * minute);

  renderHook(() => useMatchdayRefresh(["2026-11-17T21:00:00Z", kickoffAt], refresh));

  advanceTime(minute - 1);
  expect(refresh).not.toHaveBeenCalled();

  advanceTime(1);
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("stops automatic refresh when the last match window has elapsed", () => {
  const refresh = vi.fn();
  vi.setSystemTime(kickoffTime + 3 * 60 * minute + 4 * minute - 1);

  renderHook(() => useMatchdayRefresh(kickoffTimes, refresh));

  advanceTime(minute);
  expect(refresh).toHaveBeenCalledTimes(1);

  advanceTime(5 * minute);
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("pauses in a hidden tab and refreshes once when it becomes visible after a minute", () => {
  const refresh = vi.fn();
  renderHook(() => useMatchdayRefresh(kickoffTimes, refresh));
  advanceTime(minute);
  expect(refresh).toHaveBeenCalledTimes(1);

  setTabHidden(true);
  advanceTime(5 * minute);
  expect(refresh).toHaveBeenCalledTimes(1);

  setTabHidden(false);
  expect(refresh).toHaveBeenCalledTimes(2);

  setTabHidden(true);
  advanceTime(minute - 1);
  setTabHidden(false);
  expect(refresh).toHaveBeenCalledTimes(2);

  advanceTime(1);
  expect(refresh).toHaveBeenCalledTimes(3);
});

it("catches up once when a hidden tab misses the match window", () => {
  const refresh = vi.fn();
  vi.setSystemTime(kickoffTime - 60 * minute);
  renderHook(() => useMatchdayRefresh(kickoffTimes, refresh));

  setTabHidden(true);
  advanceTime(5 * 60 * minute);
  expect(refresh).not.toHaveBeenCalled();

  setTabHidden(false);
  expect(refresh).toHaveBeenCalledTimes(1);

  advanceTime(5 * minute);
  setTabHidden(true);
  setTabHidden(false);
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("pauses away from the active application view and catches up on return", () => {
  const refresh = vi.fn();
  const { rerender } = renderHook(
    ({ active }) => useMatchdayRefresh(kickoffTimes, refresh, { active }),
    { initialProps: { active: true } },
  );

  advanceTime(minute);
  expect(refresh).toHaveBeenCalledTimes(1);

  rerender({ active: false });
  advanceTime(5 * minute);
  expect(refresh).toHaveBeenCalledTimes(1);

  rerender({ active: true });
  expect(refresh).toHaveBeenCalledTimes(2);
  advanceTime(minute);
  expect(refresh).toHaveBeenCalledTimes(3);
});

it("suppresses the automatic refresh while the view has a request in flight", () => {
  const refresh = vi.fn();
  const { rerender } = renderHook(
    ({ enabled }) => useMatchdayRefresh(kickoffTimes, refresh, { enabled }),
    { initialProps: { enabled: true } },
  );

  advanceTime(minute - 1);
  rerender({ enabled: false });
  advanceTime(5 * minute);
  expect(refresh).not.toHaveBeenCalled();

  rerender({ enabled: true });
  expect(refresh).not.toHaveBeenCalled();
  advanceTime(minute);
  expect(refresh).toHaveBeenCalledTimes(1);
});

it("does not schedule automatic refresh for a historical match", () => {
  const refresh = vi.fn();
  vi.setSystemTime(kickoffTime + 24 * 60 * minute);

  renderHook(() => useMatchdayRefresh(kickoffTimes, refresh));
  advanceTime(5 * minute);
  setTabHidden(true);
  setTabHidden(false);
  expect(refresh).not.toHaveBeenCalled();
});
