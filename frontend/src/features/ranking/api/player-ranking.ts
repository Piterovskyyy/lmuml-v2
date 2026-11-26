import { z } from "zod";
import { PlayerAccountError } from "@/features/account/api/player-account";

const roundSchema = z.object({
  id: z.guid(),
  number: z.number().int().positive(),
  name: z.string().min(1),
});

const playerRankingSchema = z.object({
  seasonName: z.string().min(1),
  rounds: z.array(roundSchema),
  roundId: z.guid().nullable(),
  latestScoredRound: roundSchema.nullable().optional(),
  fixturesCapturedAt: z.iso.datetime({ offset: true }).nullable().optional(),
  refreshKickoffs: z.array(z.iso.datetime({ offset: true })).optional(),
  entries: z.array(
    z.object({
      position: z.number().int().positive(),
      displayName: z.string().min(1),
      points: z.number().int(),
      latestRoundPoints: z.number().int().nullable().optional(),
      exactScores: z.number().int().nonnegative(),
      correctOutcomes: z.number().int().nonnegative(),
      settledPredictions: z.number().int().positive(),
      isCurrentPlayer: z.boolean(),
    }),
  ),
});

export type PlayerRanking = z.infer<typeof playerRankingSchema>;
export type RankingSort = "POINTS" | "EXACT_SCORES" | "OUTCOMES";

export async function fetchPlayerRanking(
  seasonCode: string,
  roundId: string | null,
  sort: RankingSort,
  signal: AbortSignal,
) {
  const params = new URLSearchParams();
  if (roundId) params.set("roundId", roundId);
  if (sort !== "POINTS") params.set("sort", sort);
  const query = params.size ? `?${params}` : "";
  const response = await fetch(
    `/api/v1/player/seasons/${encodeURIComponent(seasonCode)}/ranking${query}`,
    {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      headers: { Accept: "application/json" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
    },
  );
  if (!response.ok) throw new PlayerAccountError(response.status);
  return playerRankingSchema.parse(await response.json());
}
