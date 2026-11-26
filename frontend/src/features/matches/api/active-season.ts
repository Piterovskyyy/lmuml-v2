import { z } from "zod";

export const activeSeasonSchema = z.object({
  seasonCode: z.string().min(1).nullable(),
});

export async function fetchActiveSeason(signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(12_000);
  const response = await fetch("/api/v1/seasons/active", {
    cache: "no-store",
    headers: { Accept: "application/json" },
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
  });
  if (!response.ok) throw new Error("Nie udało się wczytać aktywnego sezonu.");
  return activeSeasonSchema.parse(await response.json());
}
