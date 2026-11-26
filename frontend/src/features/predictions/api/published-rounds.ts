import { z } from "zod";
import {
  fetchSeasonData,
  seasonMatchesResponseSchema,
} from "@/features/matches/api/season-matches";

const { season, competition, matches } = seasonMatchesResponseSchema.shape;

const publishedRoundSchema = z.object({
  id: z.guid(),
  number: z.number().int().positive(),
  name: z.string().min(1),
  publishedAt: z.iso.datetime({ offset: true }),
  awaitingFinal: z.boolean(),
  matches,
});

const publishedRoundsSchema = z.object({
  season,
  competition,
  rounds: z.array(publishedRoundSchema),
});

export type PublishedRounds = z.infer<typeof publishedRoundsSchema>;

export function fetchPublishedRounds(seasonCode: string, signal?: AbortSignal) {
  return fetchSeasonData(seasonCode, "betting-rounds", publishedRoundsSchema, signal);
}
