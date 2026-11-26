import { Check, Clock3, LockKeyhole, PencilLine } from "lucide-react";
import type { ReactNode } from "react";
import { TeamCrest } from "@/components/football/TeamCrest";
import { Input } from "@/components/ui/input";
import { formatKickoffTime } from "@/features/matches/model/match-presentation";
import { cn } from "@/lib/utils";
import {
  draftChanged,
  scoreFromDraft,
  type PredictionDraft,
  type PredictionEntry,
  type PredictionScore,
} from "../model/prediction-score";

type CardTeam = { name: string; logoUrl: string | null };

const pointsFormat = new Intl.NumberFormat("pl-PL");

type PredictionCardMatch = {
  id: string;
  homeTeam: CardTeam;
  awayTeam: CardTeam;
  kickoffAt: string | null;
  context: readonly string[];
  statusLabel: string;
  score: PredictionScore | null;
  scoreLabel: string;
  halfTimeScore: PredictionScore | null;
};

export function PredictionCard({
  match,
  editable,
  entry,
  onChange,
  savedLabel = "Typ zapisany",
  points,
  rejection,
  details,
}: {
  match: PredictionCardMatch;
  editable: boolean;
  entry: PredictionEntry;
  onChange: (draft: PredictionDraft) => void;
  savedLabel?: string;
  points?: number | null;
  rejection?: string;
  details?: ReactNode;
}) {
  const dirty = draftChanged(entry.draft, entry.saved);
  const complete = scoreFromDraft(entry.draft) !== null;
  const incomplete = dirty && !complete;
  const status = !editable
    ? "Typowanie zamknięte"
    : dirty
      ? "Niezapisane zmiany"
      : entry.saved
        ? savedLabel
        : "Brak typu";
  const StatusIcon = !editable ? LockKeyhole : dirty ? PencilLine : entry.saved ? Check : Clock3;
  const time = formatKickoffTime(match.kickoffAt);
  const label = `${match.homeTeam.name} — ${match.awayTeam.name}`;
  const hintId = `${match.id}-hint`;

  function change(side: "home" | "away", value: string) {
    if (/^\d{0,2}$/.test(value)) onChange({ ...entry.draft, [side]: value });
  }

  return (
    <article className={cn("prediction-card", !editable && "prediction-locked")} aria-label={label}>
      <div className="prediction-card-content">
        <div className="prediction-meta">
          <div className="prediction-meta-context">
            {match.context.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <div className="prediction-meta-timing">
            {match.kickoffAt && <time dateTime={match.kickoffAt}>{time}</time>}
            <span>{match.statusLabel}</span>
          </div>
        </div>
        <div className="prediction-matchup">
          <div className="prediction-team prediction-home">
            <span>{match.homeTeam.name}</span>
            <TeamCrest name={match.homeTeam.name} logoUrl={match.homeTeam.logoUrl} />
          </div>
          <div className="prediction-score">
            <span className="prediction-score-label">Twój typ</span>
            {editable ? (
              <div className="prediction-inputs">
                <Input
                  id={`${match.id}-home`}
                  aria-label={`Gole: ${match.homeTeam.name}, mecz ${label}`}
                  aria-describedby={incomplete ? hintId : undefined}
                  inputMode="numeric"
                  pattern="[0-9]{1,2}"
                  maxLength={2}
                  autoComplete="off"
                  placeholder="–"
                  value={entry.draft.home}
                  onChange={(event) => change("home", event.target.value)}
                />
                <span aria-hidden="true">:</span>
                <Input
                  aria-label={`Gole: ${match.awayTeam.name}, mecz ${label}`}
                  aria-describedby={incomplete ? hintId : undefined}
                  inputMode="numeric"
                  pattern="[0-9]{1,2}"
                  maxLength={2}
                  autoComplete="off"
                  placeholder="–"
                  value={entry.draft.away}
                  onChange={(event) => change("away", event.target.value)}
                />
              </div>
            ) : (
              <strong className="prediction-readonly">
                {entry.saved ? `${entry.saved.home} : ${entry.saved.away}` : "– : –"}
              </strong>
            )}
            {points !== undefined && (
              <span
                className="prediction-points"
                data-pending={points === null}
                data-negative={points !== null && points < 0}
              >
                {points === null ? "Oczekuje na punkty" : `${pointsFormat.format(points)} pkt`}
              </span>
            )}
          </div>
          <div className="prediction-team prediction-away">
            <TeamCrest name={match.awayTeam.name} logoUrl={match.awayTeam.logoUrl} />
            <span>{match.awayTeam.name}</span>
          </div>
        </div>
        <div className="prediction-card-footer">
          <div className="prediction-feedback">
            <span
              className={cn(
                "prediction-state",
                dirty && editable && "is-dirty",
                entry.saved && !dirty && editable && "is-saved",
              )}
            >
              <StatusIcon aria-hidden="true" size={15} /> {status}
            </span>
            {rejection ? (
              <span className="prediction-rejection">{rejection}</span>
            ) : editable ? (
              <span id={hintId}>
                {incomplete ? "Uzupełnij oba pola wyniku." : `Możesz zmienić typ do ${time}.`}
              </span>
            ) : (
              !match.score && <span>Wynik jeszcze niedostępny</span>
            )}
          </div>
          {!editable && match.score && (
            <dl className="prediction-results">
              <div>
                <dt>{match.scoreLabel}</dt>
                <dd>
                  {match.score.home} : {match.score.away}
                </dd>
              </div>
              {match.halfTimeScore && (
                <div>
                  <dt>Do przerwy</dt>
                  <dd>
                    {match.halfTimeScore.home} : {match.halfTimeScore.away}
                  </dd>
                </div>
              )}
            </dl>
          )}
          {details}
        </div>
      </div>
    </article>
  );
}
