import { z } from "zod";
import { fetchMatchDetails } from "./match-details";
import { matchPlayerSchema } from "./match-player";

const count = z.number().int().nonnegative().nullable();
const playerStatisticsSchema = matchPlayerSchema.extend({
  minutes: count,
  rating: z.number().min(0).max(10).nullable(),
  goals: count,
  assists: count,
  shotsTotal: count,
  shotsOnTarget: count,
  passesTotal: count,
  keyPasses: count,
  tackles: count,
  saves: count,
});
const matchPlayerStatisticsSchema = z.object({
  matchId: z.guid(),
  capturedAt: z.iso.datetime({ offset: true }),
  home: z.array(playerStatisticsSchema).min(1),
  away: z.array(playerStatisticsSchema).min(1),
});

export type PlayerStatistics = z.infer<typeof playerStatisticsSchema>;
export type MatchPlayerStatistics = z.infer<typeof matchPlayerStatisticsSchema>;

export function fetchMatchPlayerStatistics(
  matchId: string,
  signal: AbortSignal,
): Promise<MatchPlayerStatistics | null> {
  return fetchMatchDetails(matchId, "player-statistics", matchPlayerStatisticsSchema, signal);
}
