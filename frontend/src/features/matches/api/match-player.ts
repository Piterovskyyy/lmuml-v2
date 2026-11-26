import { z } from "zod";
import { MatchPlayerPosition } from "../model/match-player-position";

const positionSchema = z.enum(MatchPlayerPosition);

export const matchPlayerSchema = z.object({
  name: z.string().trim().min(1),
  number: z.number().int().nonnegative().nullable(),
  position: z
    .string()
    .transform(
      (position) => positionSchema.safeParse(position).data ?? MatchPlayerPosition.Unknown,
    ),
});
