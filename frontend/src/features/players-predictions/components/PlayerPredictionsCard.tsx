import { ChevronDown, ChevronRight } from "lucide-react";
import { TeamCrest } from "@/components/football/TeamCrest";
import { Button } from "@/components/ui/button";
import type { FootballMatch } from "@/features/matches/api/season-matches";
import { MatchDetailsDialog } from "@/features/matches/components/MatchDetailsDialog";
import {
  formatKickoffTime,
  formatScore,
  groupMatchesByDate,
  primaryScore,
  primaryScoreLabel,
  statusLabel,
} from "@/features/matches/model/match-presentation";
import { MatchState } from "@/features/matches/model/match-status";
import type { PlayersPredictions, SharedPrediction } from "../api/players-predictions";

const pointsFormat = new Intl.NumberFormat("pl-PL");

// The server omits hidden values. This only chooses the explanation for an absent pick.
function canReveal(match: FootballMatch, serverNow: string) {
  return (
    match.kickoffAt !== null &&
    Date.parse(match.kickoffAt) <= Date.parse(serverNow) &&
    ![
      MatchState.TimeUnconfirmed,
      MatchState.Postponed,
      MatchState.Cancelled,
      MatchState.Unknown,
    ].includes(match.status.state)
  );
}

function SharedPredictionMatch({
  match,
  prediction,
  serverNow,
}: {
  match: FootballMatch;
  prediction: SharedPrediction | undefined;
  serverNow: string;
}) {
  const revealed = canReveal(match, serverNow);
  return (
    <article
      className="shared-prediction-match"
      aria-label={`${match.homeTeam.name} — ${match.awayTeam.name}`}
    >
      <div className="shared-match-heading">
        <span>
          {formatKickoffTime(match.kickoffAt)} · {statusLabel(match)}
        </span>
        <MatchDetailsDialog match={match}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Szczegóły: ${match.homeTeam.name} — ${match.awayTeam.name}`}
          >
            <ChevronRight aria-hidden="true" size={17} />
          </Button>
        </MatchDetailsDialog>
      </div>
      <div className="shared-match-teams">
        <div>
          <TeamCrest name={match.homeTeam.name} logoUrl={match.homeTeam.logoUrl} />
          <span>{match.homeTeam.name}</span>
        </div>
        <div>
          <TeamCrest name={match.awayTeam.name} logoUrl={match.awayTeam.logoUrl} />
          <span>{match.awayTeam.name}</span>
        </div>
      </div>
      <dl className="shared-match-scores">
        <div>
          <dt>{primaryScoreLabel(match)}</dt>
          <dd>{formatScore(primaryScore(match))}</dd>
        </div>
        <div>
          <dt>Typ gracza</dt>
          <dd>{prediction ? `${prediction.homeGoals} : ${prediction.awayGoals}` : "—"}</dd>
        </div>
        <div>
          <dt>Punkty</dt>
          <dd data-negative={prediction?.points != null && prediction.points < 0}>
            {prediction?.points != null ? pointsFormat.format(prediction.points) : "—"}
          </dd>
        </div>
      </dl>
      {!prediction && (
        <p className="shared-match-note">
          {revealed ? "Brak typu" : "Typy dostępne po rozpoczęciu meczu"}
        </p>
      )}
      {prediction && prediction.points === null && (
        <p className="shared-match-note">Oczekuje na rozliczenie</p>
      )}
    </article>
  );
}

export function PlayerPredictionsCard({
  player,
  matches,
  serverNow,
  expanded,
  detailsId,
  onToggle,
}: {
  player: PlayersPredictions["players"][number];
  matches: readonly FootballMatch[];
  serverNow: string;
  expanded: boolean;
  detailsId: string;
  onToggle: () => void;
}) {
  const points = player.predictions.reduce(
    (total, prediction) => total + (prediction.points ?? 0),
    0,
  );
  const settledCount = player.predictions.filter((prediction) => prediction.points !== null).length;
  const predictions = new Map(
    player.predictions.map((prediction) => [prediction.matchId, prediction]),
  );
  return (
    <section className="shared-player-card">
      <h2>
        <button
          type="button"
          className="shared-player-toggle"
          aria-expanded={expanded}
          aria-controls={expanded ? detailsId : undefined}
          onClick={onToggle}
        >
          <span>
            <span className="shared-player-name">{player.displayName}</span>
            {player.isCurrentPlayer && <span className="shared-player-self">Ty</span>}
            <span className="shared-player-summary">
              Ujawnione typy: {player.predictions.length} · Rozliczone: {settledCount}
            </span>
          </span>
          <strong className="shared-player-points" data-negative={points < 0}>
            {settledCount > 0 ? `${pointsFormat.format(points)} pkt` : "—"}
          </strong>
          <ChevronDown aria-hidden="true" size={19} className="shared-player-chevron" />
        </button>
      </h2>
      {expanded && (
        <div id={detailsId} className="shared-player-details">
          {groupMatchesByDate(matches).map((day) => (
            <section className="shared-predictions-day" key={day.key}>
              <h3>{day.label}</h3>
              <div className="shared-predictions-grid">
                {day.matches.map((match) => (
                  <SharedPredictionMatch
                    key={match.id}
                    match={match}
                    prediction={predictions.get(match.id)}
                    serverNow={serverNow}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
