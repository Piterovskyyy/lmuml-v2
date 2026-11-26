import { useId, type ReactNode } from "react";
import { CalendarDays } from "lucide-react";
import type { FootballMatch } from "@/features/matches/api/season-matches";
import { MatchRow } from "@/features/matches/components/MatchRow";
import { groupMatchesByDate } from "@/features/matches/model/match-presentation";

export function PublishedRoundMatches({
  matches,
  renderMatch,
}: {
  matches: readonly FootballMatch[];
  renderMatch?: (match: FootballMatch) => ReactNode;
}) {
  const headingPrefix = useId();
  const days = groupMatchesByDate(matches);
  if (days.length === 0) return <p className="published-message">Brak meczów w tej kolejce.</p>;

  return days.map((day) => (
    <section
      className="published-day"
      key={day.key}
      aria-labelledby={`${headingPrefix}-${day.key}`}
    >
      <div className="date-heading">
        <CalendarDays size={16} aria-hidden="true" />
        <h3 id={`${headingPrefix}-${day.key}`}>{day.label}</h3>
        {day.key !== "unknown" && <span>Czas polski</span>}
      </div>
      <div className={renderMatch ? "prediction-cards" : "match-day-list"}>
        {day.matches.map((match) =>
          renderMatch ? renderMatch(match) : <MatchRow key={match.id} match={match} />,
        )}
      </div>
    </section>
  ));
}
