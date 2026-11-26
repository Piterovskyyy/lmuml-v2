import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Shirt, Users } from "lucide-react";
import { TeamCrest } from "@/components/football/TeamCrest";
import { Button } from "@/components/ui/button";
import { fetchMatchLineups, type LineupPlayer, type MatchLineups } from "../api/match-lineups";
import type { FootballMatch } from "../api/season-matches";
import { DISPLAY_TIME_ZONE } from "../model/match-presentation";
import { matchPlayerPositionLabels } from "../model/match-player-position";
import { LineupPlayerHighlights } from "./LineupPlayerHighlights";
import { MatchLineupPitch } from "./MatchLineupPitch";
import "./match-lineups.css";

const capturedDate = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: DISPLAY_TIME_ZONE,
});

type State =
  { status: "loading" | "unavailable" | "error" } | { status: "ready"; data: MatchLineups };

function PlayerRow({ player }: { player: LineupPlayer }) {
  const positionLabel = matchPlayerPositionLabels[player.position];
  return (
    <li>
      <span className="lineup-shirt" aria-hidden="true">
        {player.number ?? <Shirt size={16} />}
      </span>
      <div className="lineup-player-text">
        <span className="lineup-player-name">
          {player.number !== null && <span className="sr-only">Numer {player.number}, </span>}
          {player.name}
        </span>
        {positionLabel && <span className="lineup-player-position">{positionLabel}</span>}
        <LineupPlayerHighlights player={player} />
      </div>
    </li>
  );
}

function TeamSummary({
  team,
  lineup,
  side,
}: {
  team: FootballMatch["homeTeam"];
  lineup: MatchLineups["home"];
  side: "home" | "away";
}) {
  return (
    <section className="lineup-summary" data-side={side} aria-label={team.name}>
      <h4>
        <TeamCrest name={team.name} logoUrl={team.logoUrl} />
        {team.name}
      </h4>
      {(lineup.formation || lineup.coachName) && (
        <dl>
          {lineup.formation && (
            <div>
              <dt>Ustawienie</dt>
              <dd>{lineup.formation}</dd>
            </div>
          )}
          {lineup.coachName && (
            <div>
              <dt>Trener</dt>
              <dd>{lineup.coachName}</dd>
            </div>
          )}
        </dl>
      )}
    </section>
  );
}

function TeamRoster({
  lineup,
  teamName,
  side,
}: {
  lineup: MatchLineups["home"];
  teamName: string;
  side: "home" | "away";
}) {
  const startersId = useId();
  return (
    <div className="lineup-roster" data-side={side}>
      <section className="lineup-starters" aria-labelledby={startersId}>
        <h4 id={startersId}>Pierwszy skład · {teamName}</h4>
        <ul className="lineup-players" role="list">
          {lineup.starters.map((player, index) => (
            <PlayerRow key={index} player={player} />
          ))}
        </ul>
      </section>
      {lineup.substitutes.length > 0 ? (
        <details className="lineup-substitutes">
          <summary>
            <span>Rezerwowi ({lineup.substitutes.length})</span>
            <ChevronDown size={18} aria-hidden="true" />
          </summary>
          <ul className="lineup-players" role="list">
            {lineup.substitutes.map((player, index) => (
              <PlayerRow key={index} player={player} />
            ))}
          </ul>
        </details>
      ) : (
        <p className="match-panel-message">Brak danych o rezerwowych.</p>
      )}
    </div>
  );
}

export function MatchLineupsPanel({ match }: { match: FootballMatch }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const headingId = useId();
  const panel = useRef<HTMLElement>(null);
  const { id: matchId, homeTeam, awayTeam } = match;

  useEffect(() => {
    const controller = new AbortController();
    fetchMatchLineups(matchId, controller.signal)
      .then((data) => {
        if (controller.signal.aborted) return;
        setState(data ? { status: "ready", data } : { status: "unavailable" });
      })
      .catch(() => {
        if (!controller.signal.aborted) setState({ status: "error" });
      });
    return () => controller.abort();
  }, [matchId, attempt]);

  function retry() {
    panel.current?.focus({ preventScroll: true });
    setState({ status: "loading" });
    setAttempt((current) => current + 1);
  }

  return (
    <section className="match-lineups" aria-labelledby={headingId} ref={panel} tabIndex={-1}>
      <h3 className="match-panel-title" id={headingId}>
        <Users size={20} aria-hidden="true" /> Składy meczowe
      </h3>
      {state.status === "loading" && (
        <p className="match-panel-message" role="status">
          Wczytuję składy…
        </p>
      )}
      {state.status === "unavailable" && (
        <p className="match-panel-message">Składy tego meczu są niedostępne.</p>
      )}
      {state.status === "error" && (
        <div className="match-panel-error">
          <p className="match-panel-message" role="status">
            Nie udało się wczytać składów.
          </p>
          <Button type="button" variant="outline" onClick={retry}>
            Ponów próbę
          </Button>
        </div>
      )}
      {state.status === "ready" && (
        <>
          <div className="lineup-teams">
            <TeamSummary team={homeTeam} lineup={state.data.home} side="home" />
            <TeamSummary team={awayTeam} lineup={state.data.away} side="away" />
          </div>
          <MatchLineupPitch lineups={state.data} match={match} />
          <div className="lineup-rosters">
            <TeamRoster lineup={state.data.home} teamName={homeTeam.name} side="home" />
            <TeamRoster lineup={state.data.away} teamName={awayTeam.name} side="away" />
          </div>
          <p className="match-panel-message">
            Pobrano{" "}
            <time dateTime={state.data.capturedAt}>
              {capturedDate.format(new Date(state.data.capturedAt))}
            </time>
          </p>
        </>
      )}
    </section>
  );
}
