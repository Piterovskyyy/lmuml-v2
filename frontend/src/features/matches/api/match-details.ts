import type { ZodType } from "zod";
import { ApiError } from "./season-matches";

export async function fetchMatchDetails<T extends { matchId: string }>(
  matchId: string,
  resource: "events" | "statistics" | "lineups" | "player-statistics",
  schema: ZodType<T>,
  signal: AbortSignal,
): Promise<T | null> {
  const response = await fetch(`/api/v1/matches/${encodeURIComponent(matchId)}/${resource}`, {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new ApiError(response.status);

  const result = schema.safeParse(await response.json());
  if (!result.success || result.data.matchId !== matchId) {
    throw new ApiError(null, "invalid-response");
  }
  return result.data;
}
