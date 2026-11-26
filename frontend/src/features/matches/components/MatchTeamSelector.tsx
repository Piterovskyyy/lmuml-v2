import { TeamCrest } from "@/components/football/TeamCrest";
import type { FootballMatch } from "../api/season-matches";

type MatchSide = "home" | "away";

export function MatchTeamSelector({
  match,
  side,
  onChange,
}: {
  match: FootballMatch;
  side: MatchSide;
  onChange: (side: MatchSide) => void;
}) {
  const { homeTeam, awayTeam } = match;

  return (
    <div className="match-team-selector" role="group" aria-label="Wybierz drużynę">
      <button
        type="button"
        aria-label={`${homeTeam.name} (gospodarze)`}
        aria-pressed={side === "home"}
        onClick={() => onChange("home")}
      >
        <TeamCrest name={homeTeam.name} logoUrl={homeTeam.logoUrl} />
        <span>{homeTeam.name}</span>
      </button>
      <button
        type="button"
        aria-label={`${awayTeam.name} (goście)`}
        aria-pressed={side === "away"}
        onClick={() => onChange("away")}
      >
        <TeamCrest name={awayTeam.name} logoUrl={awayTeam.logoUrl} />
        <span>{awayTeam.name}</span>
      </button>
    </div>
  );
}
