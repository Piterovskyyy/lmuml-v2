import { useCallback, useEffect, useMemo, useState } from "react";
import { MatchState } from "../model/match-status";
import { useMatchdayRefresh } from "../model/use-matchday-refresh";
import { useSeasonUpdates } from "../model/use-season-updates";
import { ApiError, fetchSeasonMatches, type SeasonMatchesResponse } from "./season-matches";

type SeasonState =
  | { status: "loading"; data?: SeasonMatchesResponse }
  | { status: "ready"; data: SeasonMatchesResponse }
  | { status: "error"; error: ApiError; data?: SeasonMatchesResponse };

const refreshableStates = new Set([
  MatchState.Scheduled,
  MatchState.Live,
  MatchState.Break,
  MatchState.Suspended,
  MatchState.Finished,
  MatchState.Awarded,
]);

export function useSeasonMatches(
  seasonCode: string,
  active: boolean,
  { streamUpdates = false }: { streamUpdates?: boolean } = {},
) {
  const [state, setState] = useState<SeasonState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const reload = useCallback(() => setAttempt((previous) => previous + 1), []);

  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({
      status: "loading",
      data: previous.data?.season.code === seasonCode ? previous.data : undefined,
    }));
    fetchSeasonMatches(seasonCode, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ status: "ready", data });
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setState((previous) => ({
            status: "error",
            error: error instanceof ApiError ? error : new ApiError(null, "network"),
            data: previous.data,
          }));
        }
      });
    return () => controller.abort();
  }, [seasonCode, attempt]);

  const currentSeason = state.data?.season.code === seasonCode ? state.data : undefined;
  const matches = currentSeason?.matches;
  const kickoffs = useMemo(
    () =>
      matches?.flatMap(({ kickoffAt, status }) =>
        kickoffAt !== null && refreshableStates.has(status.state) ? [kickoffAt] : [],
      ),
    [matches],
  );
  const streaming = useSeasonUpdates(seasonCode, reload, {
    enabled: active && streamUpdates,
    fixturesCapturedAt: currentSeason?.fixturesCapturedAt,
  });
  useMatchdayRefresh(kickoffs, reload, {
    enabled: state.status !== "loading",
    active: active && (!streaming || state.status === "error"),
  });

  return { state, reload };
}
