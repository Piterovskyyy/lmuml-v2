import { z } from "zod";
import { fetchMatchDetails } from "./match-details";

export enum MatchEventKind {
  Goal = "GOAL",
  OwnGoal = "OWN_GOAL",
  PenaltyGoal = "PENALTY_GOAL",
  MissedPenalty = "MISSED_PENALTY",
  YellowCard = "YELLOW_CARD",
  SecondYellowCard = "SECOND_YELLOW_CARD",
  RedCard = "RED_CARD",
  Substitution = "SUBSTITUTION",
  Var = "VAR",
  GoalCancelled = "GOAL_CANCELLED",
  PenaltyConfirmed = "PENALTY_CONFIRMED",
  PenaltyCancelled = "PENALTY_CANCELLED",
  Unknown = "UNKNOWN",
}

const kindSchema = z.enum(MatchEventKind);
const minuteSchema = z.number().int().nonnegative();
const eventSchema = z.object({
  minute: minuteSchema,
  addedTime: minuteSchema.nullable(),
  side: z.enum(["HOME", "AWAY"]).nullable(),
  kind: z.string().transform((kind) => kindSchema.safeParse(kind).data ?? MatchEventKind.Unknown),
  playerName: z.string().trim().min(1).nullable(),
  relatedPlayerName: z.string().trim().min(1).nullable(),
});
const matchEventsSchema = z.object({
  matchId: z.guid(),
  capturedAt: z.iso.datetime({ offset: true }),
  events: z.array(eventSchema),
});

export type MatchEvent = z.infer<typeof eventSchema>;
export type MatchEvents = z.infer<typeof matchEventsSchema>;

export function fetchMatchEvents(
  matchId: string,
  signal: AbortSignal,
): Promise<MatchEvents | null> {
  return fetchMatchDetails(matchId, "events", matchEventsSchema, signal);
}
