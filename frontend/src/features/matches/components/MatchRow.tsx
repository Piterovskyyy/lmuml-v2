import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { FootballMatch } from "../api/season-matches";
import {
  formatKickoffTime,
  formatScore,
  primaryScore,
  primaryScoreLabel,
  statusLabel,
} from "../model/match-presentation";
import { TeamCrest } from "@/components/football/TeamCrest";
import { FinishType, MatchState } from "../model/match-status";
import { MatchDetailsDialog } from "./MatchDetailsDialog";

export function MatchRow({ match }: { match: FootballMatch }) {
  const live = [MatchState.Live, MatchState.Break].includes(match.status.state);
  const finishType = match.status.finishType;
  const hasExtraTime =
    match.status.state === MatchState.Finished &&
    (finishType === FinishType.Penalties || finishType === FinishType.ExtraTime);
  return (
    <article className="match-row" aria-label={`${match.homeTeam.name} — ${match.awayTeam.name}`}>
      <div className="match-time">
        <time dateTime={match.kickoffAt ?? undefined}>{formatKickoffTime(match.kickoffAt)}</time>
        <span className={cn("match-status", live && "is-live")}>
          <i aria-hidden="true" />
          {statusLabel(match)}
        </span>
      </div>
      <div className="match-teams">
        <div className="match-team home-team">
          <span>{match.homeTeam.name}</span>
          <TeamCrest name={match.homeTeam.name} logoUrl={match.homeTeam.logoUrl} />
        </div>
        <div className="match-score">
          <strong aria-label={`${primaryScoreLabel(match)}: ${formatScore(primaryScore(match))}`}>
            {formatScore(primaryScore(match))}
          </strong>
          <span>{primaryScoreLabel(match)}</span>
        </div>
        <div className="match-team away-team">
          <TeamCrest name={match.awayTeam.name} logoUrl={match.awayTeam.logoUrl} />
          <span>{match.awayTeam.name}</span>
        </div>
      </div>
      <div className="match-more">
        {hasExtraTime && (
          <span className="extra-time-tag">
            {finishType === FinishType.Penalties ? "Karne" : "Dogrywka"}
          </span>
        )}
        <MatchDetailsDialog match={match}>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Szczegóły: ${match.homeTeam.name} — ${match.awayTeam.name}`}
          >
            <ChevronRight aria-hidden="true" />
          </Button>
        </MatchDetailsDialog>
      </div>
    </article>
  );
}
