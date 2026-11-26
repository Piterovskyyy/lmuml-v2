import { useState, type CSSProperties } from "react";
import { TeamCrest } from "@/components/football/TeamCrest";
import { Button } from "@/components/ui/button";
import type { KnockoutRound, KnockoutTie } from "../model/knockout-bracket";
import { isResolvedMatch, TournamentStage } from "../model/competition-stage";
import { DISPLAY_TIME_ZONE, formatScore, primaryScore } from "../model/match-presentation";
import { MatchDetailsDialog } from "./MatchDetailsDialog";
import "./knockout-details.css";

const matchDate = new Intl.DateTimeFormat("pl-PL", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: DISPLAY_TIME_ZONE,
});

function TieCard({ tie, final }: { tie: KnockoutTie; final: boolean }) {
  const upcoming = tie.legs.find((leg) => !isResolvedMatch(leg) && leg.kickoffAt);
  return (
    <article className="knockout-tie" aria-label={tie.teams.map((team) => team.name).join(" — ")}>
      {tie.teams.map((team, index) => (
        <div key={team.id} className="knockout-team" data-winner={tie.winnerId === team.id}>
          <TeamCrest name={team.name} logoUrl={team.logoUrl} />
          <span>
            {team.name}
            {tie.winnerId === team.id && (
              <span className="sr-only">{final ? ", zwycięzca" : ", awans"}</span>
            )}
          </span>
          <strong>{tie.aggregate?.[index] ?? "–"}</strong>
        </div>
      ))}
      <p className="knockout-tie-note">
        {tie.penalties ? (
          `Karne ${tie.penalties[0]}:${tie.penalties[1]}`
        ) : tie.aggregate ? (
          final ? (
            "Wynik finału"
          ) : (
            "Wynik dwumeczu"
          )
        ) : upcoming?.kickoffAt ? (
          <time dateTime={upcoming.kickoffAt}>
            {matchDate.format(new Date(upcoming.kickoffAt))}
          </time>
        ) : (
          "Wynik do ustalenia"
        )}
      </p>
      <div className="knockout-leg-scores">
        {tie.legs.map((match, index) => {
          const label = final ? "Finał" : index === 0 ? "1. mecz" : "Rewanż";
          const score = formatScore(
            isResolvedMatch(match) ? match.scores.total : primaryScore(match),
          );
          return (
            <MatchDetailsDialog key={match.id} match={match}>
              <Button
                type="button"
                variant="outline"
                className="knockout-leg-button"
                aria-label={`Szczegóły: ${label}, ${match.homeTeam.name} — ${match.awayTeam.name}, ${score}`}
              >
                {final ? (
                  "Szczegóły finału"
                ) : (
                  <>
                    <span>{label}</span>
                    <strong>{score}</strong>
                  </>
                )}
              </Button>
            </MatchDetailsDialog>
          );
        })}
      </div>
    </article>
  );
}

function BracketConnections({ rounds }: { rounds: KnockoutRound[] }) {
  const y = (index: number, count: number) => ((index + 0.5) * 100) / count;
  return (
    <svg
      className="knockout-connections"
      aria-hidden="true"
      viewBox={`0 0 ${rounds.length * 100} 100`}
      preserveAspectRatio="none"
    >
      {rounds.slice(0, -1).flatMap((round, column) => {
        const next = rounds[column + 1];
        return round.ties.flatMap((tie, index) => {
          const target = next.ties.findIndex((candidate) => candidate.id === tie.nextTieId);
          if (target === -1) return [];
          const from = y(index, round.ties.length);
          const to = y(target, next.ties.length);
          return (
            <path
              key={tie.id}
              d={`M ${column * 100 + 50} ${from} H ${(column + 1) * 100} V ${to} H ${column * 100 + 150}`}
              vectorEffect="non-scaling-stroke"
            />
          );
        });
      })}
    </svg>
  );
}

export function KnockoutBracket({ rounds }: { rounds: KnockoutRound[] }) {
  const [chosenRound, setChosenRound] = useState("");
  const selectedRound =
    rounds.find((round) => round.id === chosenRound) ??
    rounds.find((round) => round.ties.some((tie) => !tie.winnerId)) ??
    rounds.at(-1);

  return (
    <section className="competition-panel" aria-labelledby="bracket-heading">
      <header className="competition-panel-heading">
        <div>
          <h2 id="bracket-heading">Drabinka fazy pucharowej</h2>
          <p>
            Otwórz wynik spotkania, żeby zobaczyć szczegóły. Wyniki meczów podajemy w kolejności
            gospodarz–gość.
          </p>
        </div>
        <label className="knockout-round-picker">
          <span className="sr-only">Runda drabinki</span>
          <select
            value={selectedRound?.id}
            onChange={(event) => setChosenRound(event.target.value)}
          >
            {rounds.map((round) => (
              <option key={round.id} value={round.id}>
                {round.name}
              </option>
            ))}
          </select>
        </label>
      </header>
      <div className="knockout-scroll">
        <div
          className="knockout-board"
          style={
            {
              "--round-count": rounds.length,
              "--bracket-rows": Math.max(1, ...rounds.map((round) => round.ties.length)),
            } as CSSProperties
          }
        >
          <BracketConnections rounds={rounds} />
          {rounds.map((round) => (
            <section
              className="knockout-round"
              key={round.id}
              data-selected={round.id === selectedRound?.id}
              aria-label={round.name}
            >
              <h3>{round.name}</h3>
              <ol style={{ "--tie-count": round.ties.length } as CSSProperties}>
                {round.ties.map((tie) => (
                  <li key={tie.id}>
                    <TieCard tie={tie} final={round.id === TournamentStage.Final} />
                  </li>
                ))}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </section>
  );
}
