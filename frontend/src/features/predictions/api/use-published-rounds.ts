import { useEffect, useState } from "react";
import { ApiError } from "@/features/matches/api/season-matches";
import { fetchPublishedRounds, type PublishedRounds } from "./published-rounds";

type ReadState = { seasonCode: string } & (
  | { status: "loading"; data?: PublishedRounds }
  | { status: "ready"; data: PublishedRounds }
  | { status: "error"; data?: PublishedRounds; seasonMissing: boolean }
);

export function usePublishedRounds(seasonCode: string) {
  const [state, setState] = useState<ReadState>({ seasonCode, status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState((previous) => ({
      seasonCode,
      status: "loading",
      data: previous.seasonCode === seasonCode ? previous.data : undefined,
    }));
    fetchPublishedRounds(seasonCode, controller.signal)
      .then((data) => {
        if (!controller.signal.aborted) setState({ seasonCode, status: "ready", data });
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          const seasonMissing = error instanceof ApiError && error.status === 404;
          setState((previous) => ({
            seasonCode,
            status: "error",
            data: seasonMissing ? undefined : previous.data,
            seasonMissing,
          }));
        }
      });
    return () => controller.abort();
  }, [attempt, seasonCode]);

  const current = state.seasonCode === seasonCode ? state : undefined;
  return {
    data: current?.data,
    loading: !current || current.status === "loading",
    failed: current?.status === "error",
    seasonMissing: current?.status === "error" && current.seasonMissing,
    reload: () => setAttempt((previous) => previous + 1),
  };
}
