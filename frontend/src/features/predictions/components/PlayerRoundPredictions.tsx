import { Check, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ScorePair } from "@/features/matches/api/season-matches";
import { MatchDetailsDialog } from "@/features/matches/components/MatchDetailsDialog";
import {
  primaryScore,
  primaryScoreLabel,
  statusLabel,
} from "@/features/matches/model/match-presentation";
import { MatchState } from "@/features/matches/model/match-status";
import { roundLabel } from "@/features/matches/model/round-label";
import type { PublishedRounds } from "../api/published-rounds";
import {
  currentRejection,
  editableMatch,
  useRoundPredictions,
  useRoundServerTime,
} from "../api/use-round-predictions";
import { draftChanged, scoreFromDraft } from "../model/prediction-score";
import { PredictionCard } from "./PredictionCard";
import { PublishedRoundMatches } from "./PublishedRoundMatches";
import "../predictions.css";

function completeScore({ home, away }: ScorePair) {
  return home === null || away === null ? null : { home, away };
}

export function PlayerRoundPredictions({
  round,
  active,
  csrfToken,
  refreshSession,
}: {
  round: PublishedRounds["rounds"][number];
  active: boolean;
  csrfToken: string;
  refreshSession: () => void;
}) {
  const { editor, entry, updateDraft, save } = useRoundPredictions(
    round.id,
    round.matches,
    active,
    csrfToken,
    refreshSession,
  );
  const now = useRoundServerTime(editor.clock, round.matches, active);
  if (!active) return null;
  if (!editor.clock) {
    return (
      <>
        {editor.loadError ? (
          <div className="published-message">
            <p role="alert">Nie udało się pobrać Twoich typów.</p>
            <Button type="button" variant="outline" onClick={refreshSession}>
              Spróbuj ponownie
            </Button>
          </div>
        ) : (
          <p className="published-message" role="status">
            Wczytuję Twoje typy…
          </p>
        )}
        <PublishedRoundMatches matches={round.matches} />
      </>
    );
  }

  const openMatches = round.matches.filter((match) => editableMatch(editor, match, now));
  const changed = openMatches.filter(({ id }) => {
    const { draft, saved } = entry(id);
    return draftChanged(draft, saved);
  });
  const ready = changed.flatMap(({ id }) => {
    const score = scoreFromDraft(entry(id).draft);
    return score ? [{ matchId: id, homeGoals: score.home, awayGoals: score.away }] : [];
  });
  const incomplete = changed.length - ready.length;
  const feedback = editor.feedback;
  const feedbackText = feedback
    ? "error" in feedback
      ? feedback.error
      : [
          feedback.saved > 0 ? `Zapisane typy: ${feedback.saved}.` : "",
          feedback.rejected > 0 ? `Odrzucone typy: ${feedback.rejected}.` : "",
        ]
          .filter(Boolean)
          .join(" ")
    : "";

  return (
    <form
      className="published-prediction-form"
      aria-label="Typy w kolejce"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        void save(ready);
      }}
    >
      {editor.loadError && (
        <div className="published-message">
          <p role="alert">Nie udało się odświeżyć Twoich typów.</p>
          <Button type="button" variant="outline" onClick={refreshSession}>
            Spróbuj ponownie
          </Button>
        </div>
      )}
      {(openMatches.length > 0 || editor.saving || feedback) && (
        <div className="prediction-save-bar">
          <div className="prediction-save-copy">
            <p role="status">
              {editor.saving
                ? "Zapisuję typy…"
                : editor.loading
                  ? "Odświeżam Twoje typy…"
                  : feedbackText ||
                    (ready.length > 0
                      ? `Gotowe do zapisania: ${ready.length}.`
                      : "Wpisz wynik i zapisz typy.")}
              {incomplete > 0 && " Uzupełnij oba pola w pozostałych typach."}
            </p>
          </div>
          {openMatches.length > 0 && (
            <Button
              type="submit"
              disabled={editor.saving || editor.loading || editor.loadError || ready.length === 0}
            >
              <Check aria-hidden="true" /> Zapisz typy
              {ready.length > 0 && ` (${ready.length})`}
            </Button>
          )}
        </div>
      )}
      <PublishedRoundMatches
        matches={round.matches}
        renderMatch={(match) => {
          const currentEntry = entry(match.id);
          const points = currentEntry.saved?.points;
          const editable = editableMatch(editor, match, now);
          const reason = currentRejection(editor, match);
          const rejection =
            reason === "NOT_IN_ROUND"
              ? "Mecz nie należy już do tej rundy."
              : reason === "LOCKED" ||
                  (!editable && draftChanged(currentEntry.draft, currentEntry.saved))
                ? "Mecz został zamknięty przed zapisaniem zmian."
                : undefined;
          return (
            <PredictionCard
              key={match.id}
              match={{
                ...match,
                context: [roundLabel(match.tournamentRound)],
                statusLabel: statusLabel(match),
                score: completeScore(primaryScore(match)),
                scoreLabel: primaryScoreLabel(match),
                halfTimeScore: completeScore(match.scores.halfTime),
              }}
              editable={editable}
              entry={currentEntry}
              points={
                points === null && match.status.state !== MatchState.Finished ? undefined : points
              }
              rejection={rejection}
              onChange={(draft) => updateDraft(match.id, draft)}
              details={
                <MatchDetailsDialog match={match}>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="prediction-match-details"
                    aria-label={`Szczegóły: ${match.homeTeam.name} — ${match.awayTeam.name}`}
                  >
                    <ChevronRight aria-hidden="true" />
                  </Button>
                </MatchDetailsDialog>
              }
            />
          );
        }}
      />
    </form>
  );
}
