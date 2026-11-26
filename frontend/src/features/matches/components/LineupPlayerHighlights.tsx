import { ArrowDownLeft, ArrowUpRight, CircleDot, Handshake, Star } from "lucide-react";
import type { LineupPlayer } from "../api/match-lineups";

const descriptors = {
  rating: { label: "Ocena", icon: Star },
  goals: { label: "Bramki", icon: CircleDot },
  assists: { label: "Asysty", icon: Handshake },
  "substituted-on": { label: "Wchodzi", icon: ArrowUpRight },
  "substituted-off": { label: "Schodzi", icon: ArrowDownLeft },
};

type HighlightKind = keyof typeof descriptors;

const rating = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });

function formatMinute(time: NonNullable<LineupPlayer["substitutedOn"]>): string {
  const addedTime = time.addedTime ?? 0;
  return `${time.minute}${addedTime > 0 ? `+${addedTime}` : ""}′`;
}

function highlightValues(player: LineupPlayer): Record<HighlightKind, string | null> {
  return {
    rating: player.rating === null ? null : rating.format(player.rating),
    goals: player.goals ? String(player.goals) : null,
    assists: player.assists ? String(player.assists) : null,
    "substituted-on": player.substitutedOn ? formatMinute(player.substitutedOn) : null,
    "substituted-off": player.substitutedOff ? formatMinute(player.substitutedOff) : null,
  };
}

const kinds = Object.keys(descriptors) as HighlightKind[];

export function LineupPlayerHighlights({
  player,
  compact = false,
}: {
  player: LineupPlayer;
  compact?: boolean;
}) {
  const values = highlightValues(player);
  const visible = kinds.filter((kind) => values[kind] !== null);
  if (visible.length === 0) return null;

  return (
    <span className="lineup-player-badges">
      {visible.map((kind) => {
        const { label, icon: Icon } = descriptors[kind];
        const value = values[kind];
        return (
          <span
            className="lineup-player-badge"
            data-kind={kind}
            key={kind}
            title={`${label}: ${value}`}
          >
            <Icon size={13} aria-hidden="true" />
            <span className={compact ? "sr-only" : undefined}>{label} </span>
            <span>{value}</span>
          </span>
        );
      })}
    </span>
  );
}

export function LineupPitchKey({ players }: { players: readonly LineupPlayer[] }) {
  const values = players.map(highlightValues);
  const visible = kinds.filter((kind) => values.some((player) => player[kind] !== null));
  if (visible.length === 0) return null;

  return (
    <ul className="lineup-pitch-key" role="list" aria-label="Oznaczenia na boisku">
      {visible.map((kind) => {
        const { label, icon: Icon } = descriptors[kind];
        return (
          <li key={kind} className="lineup-player-badge" data-kind={kind}>
            <Icon size={13} aria-hidden="true" /> {label}
          </li>
        );
      })}
    </ul>
  );
}
