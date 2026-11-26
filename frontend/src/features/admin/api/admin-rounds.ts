import { z } from "zod";
import { activeSeasonSchema } from "@/features/matches/api/active-season";

export enum RoundStatus {
  Draft = "DRAFT",
  Published = "PUBLISHED",
}

export enum SyncAttemptOutcome {
  Succeeded = "SUCCEEDED",
  Failed = "FAILED",
}

const seasonSchema = z.object({ code: z.string().min(1), name: z.string().min(1) });
const sessionSchema = z.object({ authenticated: z.boolean(), csrfToken: z.string().min(1) });
const instant = z.iso.datetime({ offset: true });
const seasonSyncStatusSchema = z.object({
  lastSuccessfulAt: instant.nullable(),
  lastAttempt: z
    .object({ startedAt: instant, finishedAt: instant, outcome: z.enum(SyncAttemptOutcome) })
    .nullable(),
});
const fixtureSchema = z.object({
  id: z.guid(),
  kickoffAt: instant.nullable(),
  homeTeam: z.string().min(1),
  awayTeam: z.string().min(1),
});
const groupSchema = z.object({
  key: z.string().min(1),
  label: z.string().min(1),
  tournamentRound: z.string().min(1),
  matches: z.array(fixtureSchema),
  assignedRoundId: z.guid().nullable(),
});
const roundSchema = z.object({
  id: z.guid(),
  number: z.number().int().positive(),
  name: z.string().min(1),
  status: z.enum(RoundStatus),
  groupKeys: z.array(z.string().min(1)),
  matchCount: z.number().int().nonnegative(),
  publishedAt: instant.nullable(),
  awaitingFinal: z.boolean(),
  pendingFinalMatch: fixtureSchema.nullable(),
});
const workspaceSchema = z.object({
  season: seasonSchema,
  nextNumber: z.number().int().positive(),
  groups: z.array(groupSchema),
  rounds: z.array(roundSchema),
});

export type AdminSession = z.infer<typeof sessionSchema>;
export type AdminSeason = z.infer<typeof seasonSchema>;
export type SeasonSyncStatus = z.infer<typeof seasonSyncStatusSchema>;
export type AdminRound = z.infer<typeof roundSchema>;
export type MatchGroup = z.infer<typeof groupSchema>;
export type RoundWorkspace = z.infer<typeof workspaceSchema>;
export type SaveDraft = {
  seasonCode: string;
  number: number;
  groups: { key: string; matchIds: string[] }[];
};

export class AdminApiError extends Error {
  constructor(readonly status: number) {
    super("Nie udało się wykonać operacji w panelu.");
  }
}

export function isAdminSessionError(error: unknown): boolean {
  return error instanceof AdminApiError && [401, 403].includes(error.status);
}

async function request(path: string, options?: RequestInit): Promise<Response> {
  const timeout = AbortSignal.timeout(12_000);
  const response = await fetch(`/api/admin/${path}`, {
    cache: "no-store",
    ...options,
    signal: options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  });
  if (!response.ok) throw new AdminApiError(response.status);
  return response;
}

async function read<T>(path: string, schema: z.ZodType<T>, signal?: AbortSignal): Promise<T> {
  const response = await request(path, { signal, headers: { Accept: "application/json" } });
  return schema.parse(await response.json());
}

function change(
  path: string,
  csrfToken: string,
  method: "POST" | "PUT" | "DELETE",
  body?: URLSearchParams | SaveDraft | { matchId: string } | { seasonCode: string },
) {
  return request(path, {
    method,
    headers: {
      "X-CSRF-TOKEN": csrfToken,
      ...(body && !(body instanceof URLSearchParams) ? { "Content-Type": "application/json" } : {}),
    },
    body: body instanceof URLSearchParams ? body : body && JSON.stringify(body),
  });
}

export const adminApi = {
  session: (signal?: AbortSignal) => read("session", sessionSchema, signal),
  seasons: (signal?: AbortSignal) => read("rounds/seasons", z.array(seasonSchema), signal),
  seasonSyncStatus: (seasonCode: string, signal?: AbortSignal) =>
    read(`seasons/${encodeURIComponent(seasonCode)}/sync-status`, seasonSyncStatusSchema, signal),
  setActiveSeason: async (csrfToken: string, seasonCode: string) => {
    const response = await change("seasons/active", csrfToken, "PUT", { seasonCode });
    return activeSeasonSchema.parse(await response.json());
  },
  rounds: (seasonCode: string, signal?: AbortSignal) =>
    read(`rounds?${new URLSearchParams({ season: seasonCode })}`, workspaceSchema, signal),
  login: (csrfToken: string, password: string) =>
    change("login", csrfToken, "POST", new URLSearchParams({ username: "admin", password })),
  logout: (csrfToken: string) => change("logout", csrfToken, "POST"),
  save: (csrfToken: string, draft: SaveDraft) => change("rounds", csrfToken, "POST", draft),
  publish: (csrfToken: string, id: string) => change(`rounds/${id}/publish`, csrfToken, "POST"),
  discard: (csrfToken: string, id: string) => change(`rounds/${id}`, csrfToken, "DELETE"),
  attachFinal: (csrfToken: string, id: string, matchId: string) =>
    change(`rounds/${id}/final`, csrfToken, "POST", { matchId }),
};
