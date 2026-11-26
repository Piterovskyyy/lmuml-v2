import { useEffect, useEffectEvent, useRef } from "react";

const minute = 60_000;
const beforeKickoff = 15 * minute;
const afterKickoff = (3 * 60 + 5) * minute;
const day = 24 * 60 * minute;
export const matchdayRefreshIntervalMs = minute;

function nextRefreshAt(kickoffs: readonly number[], earliest: number): number {
  let next = Infinity;
  for (const kickoff of kickoffs) {
    const candidate = Math.max(earliest, kickoff - beforeKickoff);
    if (candidate <= kickoff + afterKickoff) next = Math.min(next, candidate);
  }
  return next;
}

export function useMatchdayRefresh(
  kickoffs: readonly string[] | undefined,
  refresh: () => void,
  { enabled = true, active = true }: { enabled?: boolean; active?: boolean } = {},
) {
  const refreshLatest = useEffectEvent(refresh);
  const lastRefreshAt = useRef<number | null>(null);

  useEffect(() => {
    if (!enabled) {
      lastRefreshAt.current = null;
      return;
    }
    lastRefreshAt.current ??= Date.now();
    if (!active || !kickoffs?.length) return;
    const kickoffTimes = kickoffs.map(Date.parse).filter(Number.isFinite);
    let timer: number | undefined;
    function check() {
      window.clearTimeout(timer);
      if (document.hidden) return;

      const now = Date.now();
      const earliest = (lastRefreshAt.current ?? now) + matchdayRefreshIntervalMs;
      let next = nextRefreshAt(kickoffTimes, earliest);
      if (next <= now) {
        lastRefreshAt.current = now;
        refreshLatest();
        next = nextRefreshAt(kickoffTimes, now + matchdayRefreshIntervalMs);
      }
      if (Number.isFinite(next)) {
        // Check long waits daily to stay within browser timer limits.
        timer = window.setTimeout(check, Math.min(next - now, day));
      }
    }

    check();
    document.addEventListener("visibilitychange", check);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener("visibilitychange", check);
    };
  }, [active, enabled, kickoffs]);
}
