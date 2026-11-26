import { z } from "zod";
import { PlayerAccountError } from "@/features/account/api/player-account";

const scoreSchema = z.number().int().min(0).max(99);
const predictionSchema = z.object({
  matchId: z.guid(),
  homeGoals: scoreSchema,
  awayGoals: scoreSchema,
});
const serverNow = z.iso.datetime({ offset: true });
const roundPredictionsSchema = z.object({
  predictions: z.array(predictionSchema.extend({ points: z.number().int().nullable() })),
  serverNow,
});
const savedPredictionsSchema = z.object({
  saved: z.array(predictionSchema),
  rejected: z.array(z.object({ matchId: z.guid(), reason: z.enum(["LOCKED", "NOT_IN_ROUND"]) })),
  serverNow,
});

export type PlayerPrediction = z.infer<typeof predictionSchema>;
export type ScoredPlayerPrediction = z.infer<typeof roundPredictionsSchema>["predictions"][number];
export type PredictionRejection = z.infer<typeof savedPredictionsSchema>["rejected"][number];

async function request(roundId: string, options: RequestInit) {
  const timeout = AbortSignal.timeout(12_000);
  const response = await fetch(
    `/api/v1/player/betting-rounds/${encodeURIComponent(roundId)}/predictions`,
    {
      cache: "no-store",
      credentials: "same-origin",
      redirect: "error",
      ...options,
      signal: options.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
    },
  );
  if (!response.ok) throw new PlayerAccountError(response.status);
  return response.json();
}

export async function fetchPlayerPredictions(roundId: string, signal: AbortSignal) {
  const payload = await request(roundId, { headers: { Accept: "application/json" }, signal });
  return roundPredictionsSchema.parse(payload);
}

export async function savePlayerPredictions(
  roundId: string,
  csrfToken: string,
  predictions: PlayerPrediction[],
) {
  const payload = await request(roundId, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-CSRF-TOKEN": csrfToken,
    },
    body: JSON.stringify({ predictions }),
  });
  return savedPredictionsSchema.parse(payload);
}
