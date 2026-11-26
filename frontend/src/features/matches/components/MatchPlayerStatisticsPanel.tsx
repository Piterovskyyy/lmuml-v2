import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  fetchMatchPlayerStatistics,
  type MatchPlayerStatistics,
  type PlayerStatistics,
} from "../api/match-player-statistics";
import type { FootballMatch } from "../api/season-matches";
import { DISPLAY_TIME_ZONE, normalizedSearch } from "../model/match-presentation";
import { matchPlayerPositionLabels } from "../model/match-player-position";
import { MatchTeamSelector } from "./MatchTeamSelector";
import "./match-player-statistics.css";

const metrics = [
  { key: "goals", label: "Bramki" },
  { key: "assists", label: "Asysty" },
  { key: "shotsTotal", label: "Strzały" },
  { key: "shotsOnTarget", label: "Strzały celne" },
  { key: "passesTotal", label: "Podania" },
  { key: "keyPasses", label: "Kluczowe podania" },
  { key: "tackles", label: "Odbiory" },
  { key: "saves", label: "Obrony bramkarza" },
] as const satisfies readonly { key: keyof PlayerStatistics; label: string }[];

const statNumber = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });
const capturedDate = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: DISPLAY_TIME_ZONE,
});

type State =
  | { status: "loading" | "unavailable" | "error" }
  | { status: "ready"; data: MatchPlayerStatistics };

function StatValue({ value, suffix = "" }: { value: number | null; suffix?: string }) {
  if (value === null) {
    return (
      <>
        <span className="sr-only">brak danych</span>
        <span aria-hidden="true">—</span>
      </>
    );
  }
  return statNumber.format(value) + suffix;
}

function PlayerStatisticsCard({ player, group }: { player: PlayerStatistics; group: string }) {
  const position = matchPlayerPositionLabels[player.position];
  const description = [player.number !== null && `Nr ${player.number}`, position]
    .filter(Boolean)
    .join(" · ");

  return (
    <details className="match-player-stat-card" name={group}>
      <summary>
        <span className="match-player-stat-identity">
          <strong>{player.name}</strong>
          {description && <span>{description}</span>}
        </span>
        <span className="match-player-stat-highlights">
          <span>
            <span className="sr-only">Czas gry: </span>
            <StatValue value={player.minutes} suffix=" min" />
          </span>
          <span className="match-player-stat-rating">
            Ocena <StatValue value={player.rating} />
          </span>
        </span>
        <ChevronDown size={16} aria-hidden="true" />
      </summary>
      <dl className="match-player-stat-metrics">
        {metrics.map(({ key, label }) => (
          <div key={key}>
            <dt>{label}</dt>
            <dd>
              <StatValue value={player[key]} />
            </dd>
          </div>
        ))}
      </dl>
    </details>
  );
}

function PlayerStatisticsList({ players }: { players: readonly PlayerStatistics[] }) {
  const [query, setQuery] = useState("");
  const searchId = useId();
  const filter = normalizedSearch(query.trim());
  const visiblePlayers = players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => {
      const hasStatistics =
        player.minutes !== null ||
        player.rating !== null ||
        metrics.some(({ key }) => player[key] !== null);
      return hasStatistics && normalizedSearch(player.name).includes(filter);
    });

  return (
    <>
      <div className="match-player-stat-search">
        <label htmlFor={searchId}>Szukaj zawodnika</label>
        <Input
          id={searchId}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>
      <p className="match-panel-message">Oceny w skali od 0 do 10.</p>
      {visiblePlayers.length > 0 ? (
        <ul className="match-player-stat-list" role="list">
          {visiblePlayers.map(({ player, index }) => (
            <li key={index}>
              <PlayerStatisticsCard player={player} group={searchId} />
            </li>
          ))}
        </ul>
      ) : (
        <p className="match-panel-message" role="status">
          {filter
            ? "Nie znaleziono zawodnika ze statystykami w tej drużynie."
            : "Brak zapisanych statystyk dla zawodników tej drużyny."}
        </p>
      )}
    </>
  );
}

export function MatchPlayerStatisticsPanel({ match }: { match: FootballMatch }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const [side, setSide] = useState<"home" | "away">("home");
  const headingId = useId();
  const panel = useRef<HTMLElement>(null);
  const { id: matchId } = match;

  useEffect(() => {
    const controller = new AbortController();
    fetchMatchPlayerStatistics(matchId, controller.signal)
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
    <section
      className="match-player-statistics"
      aria-labelledby={headingId}
      ref={panel}
      tabIndex={-1}
    >
      <h3 className="match-panel-title" id={headingId}>
        <Users size={20} aria-hidden="true" /> Statystyki zawodników
      </h3>
      {state.status === "loading" && (
        <p className="match-panel-message" role="status">
          Wczytuję statystyki zawodników…
        </p>
      )}
      {state.status === "unavailable" && (
        <p className="match-panel-message">Brak zapisanych statystyk zawodników do tego meczu.</p>
      )}
      {state.status === "error" && (
        <div className="match-panel-error">
          <p className="match-panel-message" role="status">
            Nie udało się wczytać statystyk zawodników.
          </p>
          <Button type="button" variant="outline" onClick={retry}>
            Ponów próbę
          </Button>
        </div>
      )}
      {state.status === "ready" && (
        <>
          <MatchTeamSelector match={match} side={side} onChange={setSide} />
          <PlayerStatisticsList key={side} players={state.data[side]} />
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
