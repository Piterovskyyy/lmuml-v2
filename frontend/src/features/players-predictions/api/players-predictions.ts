import { z } from "zod";
import { PlayerAccountError } from "@/features/account/api/player-account";

const predictionSchema = z.object({
  matchId: z.guid(),
  homeGoals: z.number().int().min(0).max(99),
  awayGoals: z.number().int().min(0).max(99),
  points: z.number().int().nullable(),
});

const playersPredictionsSchema = z.object({
  roundId: z.guid(),
  serverNow: z.iso.datetime({ offset: true }),
  players: z.array(
    z.object({
      id: z.guid(),
      displayName: z.string().min(1),
      isCurrentPlayer: z.boolean(),
      predictions: z.array(predictionSchema),
    }),
  ),
});

export type PlayersPredictions = z.infer<typeof playersPredictionsSchema>;
export type SharedPrediction = z.infer<typeof predictionSchema>;

export async function fetchPlayersPredictions(roundId: string, signal: AbortSignal) {
  const response = await fetch(
    `/api/v1/player/betting-rounds/${encodeURIComponent(roundId)}/players-predictions`,
    {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      headers: { Accept: "application/json" },
      signal: AbortSignal.any([signal, AbortSignal.timeout(12_000)]),
    },
  );
  if (!response.ok) throw new PlayerAccountError(response.status);
  const result = playersPredictionsSchema.parse(await response.json());
  if (result.roundId !== roundId) throw new Error("Unexpected predictions round");
  return result;
}
