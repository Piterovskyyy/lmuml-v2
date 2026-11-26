import { ArrowDown, CalendarDays, CircleCheck, Flag, Shield, Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { SeasonMatchesResponse } from "../api/season-matches";
import { tournamentStage, TournamentStage } from "../model/competition-stage";
import { formatScore, primaryScore } from "../model/match-presentation";
import { MatchState } from "../model/match-status";
import { TeamCrest } from "@/components/football/TeamCrest";

export function SeasonOverview({ data }: { data: SeasonMatchesResponse }) {
  const teamCount = new Set(data.matches.flatMap((match) => [match.homeTeam.id, match.awayTeam.id]))
    .size;
  const completed = data.matches.filter(
    (match) => match.status.state === MatchState.Finished,
  ).length;
  const latest = data.matches
    .filter((match) => match.kickoffAt && match.status.state === MatchState.Finished)
    .at(-1);
  const finalMatch = data.matches.find(
    (match) =>
      tournamentStage(match.tournamentRound) === TournamentStage.Final &&
      match.status.state === MatchState.Finished,
  );
  const featured = finalMatch ?? latest;
  const totalGoals = data.matches.reduce(
    (sum, match) => sum + (match.scores.total.home ?? 0) + (match.scores.total.away ?? 0),
    0,
  );
  const allGoalsKnown =
    data.matches.length > 0 &&
    data.matches.every(
      (match) =>
        match.status.state === MatchState.Finished &&
        match.scores.total.home !== null &&
        match.scores.total.away !== null,
    );

  return (
    <>
      <section className="season-summary" aria-labelledby="season-summary-heading">
        <div className="section-kicker">
          <span className="line-accent" /> W liczbach
        </div>
        <h2 id="season-summary-heading">Historia tego sezonu</h2>
        <div className="season-stat-grid">
          <div>
            <Shield aria-hidden="true" />
            <strong>{teamCount}</strong>
            <span>Drużyny</span>
          </div>
          <div>
            <Flag aria-hidden="true" />
            <strong>{data.matches.length}</strong>
            <span>Mecze</span>
          </div>
          <div>
            <CircleCheck aria-hidden="true" />
            <strong>{completed}</strong>
            <span>Zakończone</span>
          </div>
          <div>
            <Trophy aria-hidden="true" />
            <strong>{allGoalsKnown ? totalGoals.toLocaleString("pl-PL") : "—"}</strong>
            <span>Gole w meczach</span>
          </div>
        </div>
        <p className="summary-caption">
          Cały katalog, łącznie z kwalifikacjami.{allGoalsKnown && " Gole bez serii karnych."}
        </p>
      </section>
      {featured && (
        <section className="season-finale" aria-labelledby="finale-heading">
          <div className="finale-heading">
            <Trophy aria-hidden="true" size={18} />
            <h2 id="finale-heading">
              {finalMatch ? "Tak zakończył się sezon" : "Ostatni zakończony mecz"}
            </h2>
          </div>
          <p>
            {finalMatch ? "Finał" : "Mecz sezonu"} ·{" "}
            {new Intl.DateTimeFormat("pl-PL", {
              day: "numeric",
              month: "long",
              year: "numeric",
              timeZone: "Europe/Warsaw",
            }).format(new Date(featured.kickoffAt!))}
          </p>
          <div className="finale-scoreboard">
            <div>
              <TeamCrest name={featured.homeTeam.name} logoUrl={featured.homeTeam.logoUrl} />
              <span>{featured.homeTeam.name}</span>
            </div>
            <strong>
              {formatScore(primaryScore(featured))}
              <small>PO 90 MIN</small>
            </strong>
            <div>
              <TeamCrest name={featured.awayTeam.name} logoUrl={featured.awayTeam.logoUrl} />
              <span>{featured.awayTeam.name}</span>
            </div>
          </div>
          <Button variant="outline" asChild className="w-full">
            <a href="#mecze">
              Przeglądaj mecze <ArrowDown aria-hidden="true" size={16} />
            </a>
          </Button>
        </section>
      )}
      <section className="results-guide" id="o-wynikach" aria-labelledby="results-guide-heading">
        <span className="guide-icon">
          <CalendarDays aria-hidden="true" size={21} />
        </span>
        <h2 id="results-guide-heading">Wynik bez wątpliwości</h2>
        <p>
          Główny wynik zakończonego meczu pokazujemy <strong>po 90 minutach</strong> z doliczonym
          czasem.
        </p>
        <p>
          Dogrywkę i karne znajdziesz w szczegółach meczu. Wszystkie godziny podajemy według czasu
          polskiego.
        </p>
      </section>
    </>
  );
}
