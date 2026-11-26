import { z } from "zod";
import { PlayerAccountError } from "@/features/account/api/player-account";

const resultCounts = z.object({
  settledPredictions: z.number().int().nonnegative(),
  exactScores: z.number().int().nonnegative(),
  correctOutcomes: z.number().int().nonnegative(),
});

const gameStatisticsSchema = resultCounts.extend({
  seasonName: z.string().min(1),
  playersWithSettledPredictions: z.number().int().nonnegative(),
  leaders: z
    .array(
      z.object({
        position: z.number().int().positive(),
        displayName: z.string().min(1),
        points: z.number().int(),
      }),
    )
    .optional(),
  rounds: z
    .array(resultCounts.extend({ number: z.number().int().positive(), name: z.string().min(1) }))
    .optional(),
});

const playerTotals = resultCounts.extend({ points: z.number().int() });
const playerStatisticsSchema = z.object({
  seasonName: z.string().min(1),
  totals: playerTotals,
  rounds: z.array(
    playerTotals.extend({
      id: z.guid(),
      number: z.number().int().positive(),
      name: z.string().min(1),
    }),
  ),
});

export type GameStatistics = z.infer<typeof gameStatisticsSchema>;
export type PlayerStatistics = z.infer<typeof playerStatisticsSchema>;

async function readStatistics(path: string, signal: AbortSignal): Promise<unknown> {
  const response = await fetch(path, {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
    headers: { Accept: "application/json" },
    signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
  });
  if (!response.ok) throw new PlayerAccountError(response.status);
  return response.json();
}

export async function fetchGameStatistics(seasonCode: string, signal: AbortSignal) {
  return gameStatisticsSchema.parse(
    await readStatistics(
      `/api/v1/seasons/${encodeURIComponent(seasonCode)}/prediction-statistics`,
      signal,
    ),
  );
}

export async function fetchPlayerStatistics(seasonCode: string, signal: AbortSignal) {
  return playerStatisticsSchema.parse(
    await readStatistics(
      `/api/v1/player/seasons/${encodeURIComponent(seasonCode)}/statistics`,
      signal,
    ),
  );
}
