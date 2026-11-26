export type PredictionScore = { home: number; away: number };
export type PredictionDraft = { home: string; away: string };
export type PredictionEntry = { draft: PredictionDraft; saved: PredictionScore | null };

export function draftFromScore(score: PredictionScore | null): PredictionDraft {
  return score ? { home: String(score.home), away: String(score.away) } : { home: "", away: "" };
}

export function scoreFromDraft(draft: PredictionDraft): PredictionScore | null {
  const goalInput = /^\d{1,2}$/;
  if (!goalInput.test(draft.home) || !goalInput.test(draft.away)) return null;
  return { home: Number(draft.home), away: Number(draft.away) };
}

export function draftChanged(draft: PredictionDraft, saved: PredictionScore | null): boolean {
  if (!saved) return draft.home !== "" || draft.away !== "";
  const score = scoreFromDraft(draft);
  return !score || score.home !== saved.home || score.away !== saved.away;
}
