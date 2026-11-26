import type { CSSProperties } from "react";
import { Shirt } from "lucide-react";
import type { LineupPlayer, MatchLineups } from "../api/match-lineups";
import type { FootballMatch } from "../api/season-matches";
import { LineupPitchKey, LineupPlayerHighlights } from "./LineupPlayerHighlights";

type PitchPosition = { player: LineupPlayer; depth: number; lane: number };
type Formation = { depths: number; positions: PitchPosition[] };

function arrangeOnPitch(players: readonly LineupPlayer[]): Formation | null {
  if (players.length !== 11) return null;

  const lines = new Map<number, Map<number, LineupPlayer>>();
  for (const player of players) {
    const { gridRow, gridColumn } = player;
    if (gridRow === null || gridColumn === null || gridRow > 6 || gridColumn > 5) return null;
    const line = lines.get(gridRow) ?? new Map<number, LineupPlayer>();
    if (line.has(gridColumn)) return null;
    line.set(gridColumn, player);
    lines.set(gridRow, line);
  }

  const positions: PitchPosition[] = [];
  for (let depth = 1; depth <= lines.size; depth += 1) {
    const line = lines.get(depth);
    if (!line) return null;
    for (let column = 1; column <= line.size; column += 1) {
      const player = line.get(column);
      if (!player) return null;
      positions.push({ player, depth, lane: 6 - line.size + (column - 1) * 2 });
    }
  }
  return { depths: lines.size, positions };
}

function PitchHalf({
  name,
  side,
  formation,
}: {
  name: string;
  side: "home" | "away";
  formation: Formation;
}) {
  return (
    <ul
      className="lineup-pitch-half"
      role="list"
      aria-label={`${name} na boisku`}
      data-side={side}
      style={{ "--lineup-depths": formation.depths } as CSSProperties}
    >
      {formation.positions.map(({ player, depth, lane }) => (
        <li
          className="lineup-pitch-player"
          key={`${depth}:${lane}`}
          style={
            {
              "--lineup-depth": depth,
              "--lineup-depth-reverse": formation.depths - depth + 1,
              "--lineup-lane": lane,
              "--lineup-lane-reverse": 10 - lane,
            } as CSSProperties
          }
        >
          <span className="lineup-shirt" aria-hidden="true">
            {player.number ?? <Shirt size={15} />}
          </span>
          {player.number !== null && <span className="sr-only">Numer {player.number}, </span>}
          <span className="lineup-pitch-name" title={player.name}>
            {player.name}
          </span>
          <LineupPlayerHighlights player={player} compact />
        </li>
      ))}
    </ul>
  );
}

export function MatchLineupPitch({
  lineups,
  match,
}: {
  lineups: MatchLineups;
  match: FootballMatch;
}) {
  const home = arrangeOnPitch(lineups.home.starters);
  const away = arrangeOnPitch(lineups.away.starters);
  if (!home || !away) {
    return <p className="match-panel-message">Brak danych do wyświetlenia ustawienia na boisku.</p>;
  }

  return (
    <>
      <div className="lineup-pitch" role="region" aria-label="Ustawienie na boisku">
        <PitchHalf name={match.homeTeam.name} side="home" formation={home} />
        <PitchHalf name={match.awayTeam.name} side="away" formation={away} />
      </div>
      <LineupPitchKey players={[...lineups.home.starters, ...lineups.away.starters]} />
    </>
  );
}
