import { ChevronRight } from "lucide-react";
import { TeamCrest } from "@/components/football/TeamCrest";
import type { FootballMatch } from "@/features/matches/api/season-matches";
import { MatchDetailsDialog } from "@/features/matches/components/MatchDetailsDialog";
import { isResolvedMatch } from "@/features/matches/model/competition-stage";
import {
  DISPLAY_TIME_ZONE,
  formatKickoffTime,
  formatScore,
  primaryScore,
  primaryScoreLabel,
} from "@/features/matches/model/match-presentation";
import "./home-preview.css";

const matchDate = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "short",
  timeZone: DISPLAY_TIME_ZONE,
});

export function HomePreviewTeam({ team }: { team: FootballMatch["homeTeam"] }) {
  return (
    <span className="home-preview-team">
      <TeamCrest name={team.name} logoUrl={team.logoUrl} />
      <span>{team.name}</span>
    </span>
  );
}

export function HomeFixtureRow({ match }: { match: FootballMatch }) {
  const result = isResolvedMatch(match);
  const kickoff = match.kickoffAt;

  return (
    <MatchDetailsDialog match={match}>
      <button type="button" className="home-fixture-row">
        <span className="home-fixture-teams">
          <HomePreviewTeam team={match.homeTeam} />
          <HomePreviewTeam team={match.awayTeam} />
        </span>
        <span className="home-fixture-time">
          {result ? (
            <strong aria-label={`${primaryScoreLabel(match)} ${formatScore(primaryScore(match))}`}>
              {formatScore(primaryScore(match))}
            </strong>
          ) : (
            <strong>{formatKickoffTime(kickoff)}</strong>
          )}
          {kickoff && <time dateTime={kickoff}>{matchDate.format(new Date(kickoff))}</time>}
        </span>
        <ChevronRight size={16} aria-hidden="true" />
      </button>
    </MatchDetailsDialog>
  );
}
