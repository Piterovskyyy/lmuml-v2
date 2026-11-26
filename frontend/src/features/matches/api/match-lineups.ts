import { z } from "zod";
import { fetchMatchDetails } from "./match-details";
import { matchPlayerSchema } from "./match-player";

const matchMinuteSchema = z.object({
  minute: z.number().int().nonnegative(),
  addedTime: z.number().int().nonnegative().nullable(),
});
const countSchema = z.number().int().nonnegative();
const playerSchema = matchPlayerSchema.extend({
  gridRow: z.number().int().positive().nullable(),
  gridColumn: z.number().int().positive().nullable(),
  rating: z.number().min(0).max(10).nullable().default(null),
  goals: countSchema.nullable().default(null),
  assists: countSchema.nullable().default(null),
  substitutedOn: matchMinuteSchema.nullable().default(null),
  substitutedOff: matchMinuteSchema.nullable().default(null),
});
const teamSchema = z.object({
  formation: z.string().trim().min(1).nullable(),
  coachName: z.string().trim().min(1).nullable(),
  starters: z.array(playerSchema).min(1),
  substitutes: z.array(playerSchema),
});
const matchLineupsSchema = z.object({
  matchId: z.guid(),
  capturedAt: z.iso.datetime({ offset: true }),
  home: teamSchema,
  away: teamSchema,
});

export type LineupPlayer = z.infer<typeof playerSchema>;
export type MatchLineups = z.infer<typeof matchLineupsSchema>;

export function fetchMatchLineups(
  matchId: string,
  signal: AbortSignal,
): Promise<MatchLineups | null> {
  return fetchMatchDetails(matchId, "lineups", matchLineupsSchema, signal);
}
