import { z } from "zod";
import { fetchMatchDetails } from "./match-details";

const count = z.number().int().nonnegative().nullable();
const teamStatisticsSchema = z.object({
  shotsTotal: count,
  shotsOnTarget: count,
  possessionPercent: z.number().min(0).max(100).nullable(),
  corners: count,
  fouls: count,
  saves: count,
});
const matchStatisticsSchema = z.object({
  matchId: z.guid(),
  capturedAt: z.iso.datetime({ offset: true }),
  home: teamStatisticsSchema,
  away: teamStatisticsSchema,
});

export type MatchStatistics = z.infer<typeof matchStatisticsSchema>;

export function fetchMatchStatistics(
  matchId: string,
  signal: AbortSignal,
): Promise<MatchStatistics | null> {
  return fetchMatchDetails(matchId, "statistics", matchStatisticsSchema, signal);
}
