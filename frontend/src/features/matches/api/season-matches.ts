import { z } from "zod";
import { FinishType, MatchState } from "../model/match-status";

const nonnegativeInt = z.number().int().nonnegative();
const nullableGoals = nonnegativeInt.nullable();
const scoreSchema = z.object({ home: nullableGoals, away: nullableGoals });
const idSchema = z.guid();
const dateTimeSchema = z.iso.datetime({ offset: true });
const logoUrlSchema = z.url({ protocol: /^https?$/ }).nullable();
const matchStateSchema = z.enum(MatchState);
const finishTypeSchema = z.enum(FinishType);
const teamSchema = z.object({
  id: idSchema,
  name: z.string().min(1),
  logoUrl: logoUrlSchema,
});

export enum FormResult {
  Win = "W",
  Draw = "D",
  Loss = "L",
}

const formSchema = z.array(z.enum(FormResult)).max(5);
const standingsSchema = z.object({
  capturedAt: dateTimeSchema,
  rows: z.array(
    z.object({
      position: z.number().int().positive(),
      team: teamSchema,
      played: nonnegativeInt,
      won: nonnegativeInt,
      drawn: nonnegativeInt,
      lost: nonnegativeInt,
      goalsFor: nonnegativeInt,
      goalsAgainst: nonnegativeInt,
      goalDifference: z.number().int(),
      points: z.number().int(),
      form: z
        .string()
        .transform((value) => formSchema.safeParse([...value]).data ?? null)
        .nullable(),
    }),
  ),
});

const matchSchema = z.object({
  id: idSchema,
  tournamentRound: z.string().nullable(),
  kickoffAt: dateTimeSchema.nullable(),
  status: z.object({
    // A new backend status must remain renderable instead of breaking the season.
    state: z
      .string()
      .transform((value) => matchStateSchema.safeParse(value).data ?? MatchState.Unknown),
    finishType: z
      .string()
      .transform((value) => finishTypeSchema.safeParse(value).data ?? null)
      .nullable(),
    elapsedMinutes: nullableGoals,
    extraMinutes: nullableGoals,
  }),
  homeTeam: teamSchema,
  awayTeam: teamSchema,
  scores: z.object({
    total: scoreSchema,
    halfTime: scoreSchema,
    regulationTime: scoreSchema,
    extraTime: scoreSchema,
    penalties: scoreSchema,
  }),
  homeWinner: z.boolean().nullable(),
  awayWinner: z.boolean().nullable(),
});

export const seasonMatchesResponseSchema = z.object({
  season: z.object({
    id: idSchema,
    code: z.string().min(1),
    name: z.string().min(1),
    startYear: z.number().int().min(1000).max(9999),
  }),
  competition: z.object({
    id: idSchema,
    code: z.string().min(1),
    name: z.string().min(1),
    logoUrl: logoUrlSchema,
  }),
  matches: z.array(matchSchema),
  fixturesCapturedAt: dateTimeSchema.nullable().optional(),
  standings: standingsSchema.nullable().optional(),
});

export type SeasonMatchesResponse = z.infer<typeof seasonMatchesResponseSchema>;
export type SeasonMatchesPayload = z.input<typeof seasonMatchesResponseSchema>;
export type SeasonStandings = z.infer<typeof standingsSchema>;
export type Season = SeasonMatchesResponse["season"];
export type Competition = SeasonMatchesResponse["competition"];
export type FootballMatch = z.infer<typeof matchSchema>;
export type MatchItem = FootballMatch;
export type MatchStatus = FootballMatch["status"];
export type ScorePair = z.infer<typeof scoreSchema>;
export type ApiErrorKind = "http" | "network" | "timeout" | "invalid-response";

export class ApiError extends Error {
  constructor(
    readonly status: number | null,
    readonly kind: ApiErrorKind = "http",
  ) {
    super("Nie udało się pobrać meczów.");
    this.name = "ApiError";
  }
}

export async function fetchSeasonMatches(
  seasonCode: string,
  signal?: AbortSignal,
): Promise<SeasonMatchesResponse> {
  return fetchSeasonData(seasonCode, "matches", seasonMatchesResponseSchema, signal);
}

export async function fetchSeasonData<T>(
  seasonCode: string,
  resource: "matches" | "betting-rounds",
  schema: z.ZodType<T>,
  signal?: AbortSignal,
): Promise<T> {
  const timeout = AbortSignal.timeout(12_000);
  const requestSignal = signal ? AbortSignal.any([signal, timeout]) : timeout;

  let response: Response;
  let payload: unknown;
  try {
    response = await fetch(`/api/v1/seasons/${encodeURIComponent(seasonCode)}/${resource}`, {
      signal: requestSignal,
      headers: { Accept: "application/json" },
    });
    if (!response.ok) throw new ApiError(response.status);
    payload = await response.json();
  } catch (error) {
    if (signal?.aborted) throw error;
    if (error instanceof ApiError) throw error;
    if (timeout.aborted) throw new ApiError(null, "timeout");
    if (error instanceof SyntaxError) throw new ApiError(null, "invalid-response");
    throw new ApiError(null, "network");
  }

  const result = schema.safeParse(payload);
  if (!result.success) throw new ApiError(null, "invalid-response");
  return result.data;
}
