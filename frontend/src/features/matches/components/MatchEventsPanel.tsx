import { useEffect, useId, useRef, useState } from "react";
import {
  ArrowLeftRight,
  CircleDot,
  CircleHelp,
  CircleOff,
  ListOrdered,
  RectangleVertical,
  Video,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  fetchMatchEvents,
  MatchEventKind,
  type MatchEvent,
  type MatchEvents,
} from "../api/match-events";
import type { FootballMatch } from "../api/season-matches";
import { DISPLAY_TIME_ZONE } from "../model/match-presentation";

const appearance = {
  [MatchEventKind.Goal]: { label: "Gol", icon: CircleDot, tone: "accent" },
  [MatchEventKind.OwnGoal]: { label: "Gol samobójczy", icon: CircleDot, tone: "accent" },
  [MatchEventKind.PenaltyGoal]: { label: "Gol z rzutu karnego", icon: CircleDot, tone: "accent" },
  [MatchEventKind.MissedPenalty]: {
    label: "Niewykorzystany rzut karny",
    icon: CircleOff,
    tone: "muted",
  },
  [MatchEventKind.YellowCard]: { label: "Żółta kartka", icon: RectangleVertical, tone: "warning" },
  [MatchEventKind.SecondYellowCard]: {
    label: "Druga żółta kartka",
    icon: RectangleVertical,
    tone: "warning",
  },
  [MatchEventKind.RedCard]: { label: "Czerwona kartka", icon: RectangleVertical, tone: "danger" },
  [MatchEventKind.Substitution]: { label: "Zmiana", icon: ArrowLeftRight, tone: "muted" },
  [MatchEventKind.Var]: { label: "Wideoweryfikacja (VAR)", icon: Video, tone: "muted" },
  [MatchEventKind.GoalCancelled]: { label: "Nieuznany gol (VAR)", icon: Video, tone: "muted" },
  [MatchEventKind.PenaltyConfirmed]: {
    label: "Rzut karny potwierdzony (VAR)",
    icon: Video,
    tone: "muted",
  },
  [MatchEventKind.PenaltyCancelled]: {
    label: "Rzut karny anulowany (VAR)",
    icon: Video,
    tone: "muted",
  },
  [MatchEventKind.Unknown]: { label: "Inne zdarzenie", icon: CircleHelp, tone: "muted" },
} as const satisfies Record<
  MatchEventKind,
  { label: string; icon: LucideIcon; tone: "accent" | "warning" | "danger" | "muted" }
>;

const capturedDate = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: DISPLAY_TIME_ZONE,
});

type State =
  { status: "loading" | "unavailable" | "error" } | { status: "ready"; data: MatchEvents };

function EventPlayers({ event }: { event: MatchEvent }) {
  const { kind, playerName, relatedPlayerName } = event;

  if (kind === MatchEventKind.Substitution) {
    return (
      <dl className="match-event-substitution">
        <div>
          <dt>Schodzi</dt>
          <dd>{playerName ?? "Brak danych"}</dd>
        </div>
        <div>
          <dt>Wchodzi</dt>
          <dd>{relatedPlayerName ?? "Brak danych"}</dd>
        </div>
      </dl>
    );
  }

  const hasAssist =
    relatedPlayerName && (kind === MatchEventKind.Goal || kind === MatchEventKind.PenaltyGoal);
  const isIndividual =
    kind === MatchEventKind.Goal ||
    kind === MatchEventKind.OwnGoal ||
    kind === MatchEventKind.PenaltyGoal ||
    kind === MatchEventKind.MissedPenalty ||
    kind === MatchEventKind.YellowCard ||
    kind === MatchEventKind.SecondYellowCard ||
    kind === MatchEventKind.RedCard;

  return (
    <>
      {playerName && <p className="match-event-player">{playerName}</p>}
      {!playerName && isIndividual && <p>Brak danych o zawodniku</p>}
      {hasAssist && <p>Asysta · {relatedPlayerName}</p>}
    </>
  );
}

function MatchEventRow({ event, match }: { event: MatchEvent; match: FootballMatch }) {
  const { label, icon: Icon, tone } = appearance[event.kind];
  const addedTime = event.addedTime ?? 0;
  const team =
    event.side === "HOME"
      ? match.homeTeam.name
      : event.side === "AWAY"
        ? match.awayTeam.name
        : null;

  return (
    <li className="match-event">
      <span className="match-event-minute">
        <span aria-hidden="true">
          {event.minute}
          {addedTime > 0 ? `+${addedTime}` : ""}′
        </span>
        <span className="sr-only">
          Minuta {event.minute}
          {addedTime > 0 ? ` plus ${addedTime}` : ""}
        </span>
      </span>
      <div className="match-event-card" data-tone={tone}>
        <span className="match-event-icon" aria-hidden="true">
          <Icon size={16} />
        </span>
        <div className="match-event-text">
          <strong>{label}</strong>
          <EventPlayers event={event} />
          {team && (
            <p className="match-event-team" data-side={event.side}>
              {team}
            </p>
          )}
        </div>
      </div>
    </li>
  );
}

export function MatchEventsPanel({ match }: { match: FootballMatch }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const headingId = useId();
  const panel = useRef<HTMLElement>(null);
  const { id: matchId } = match;

  useEffect(() => {
    const controller = new AbortController();
    fetchMatchEvents(matchId, controller.signal)
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
    <section className="match-events" aria-labelledby={headingId} ref={panel} tabIndex={-1}>
      <h3 className="match-panel-title" id={headingId}>
        <ListOrdered size={20} aria-hidden="true" /> Przebieg meczu
      </h3>
      {state.status === "loading" && (
        <p className="match-panel-message" role="status">
          Wczytuję zdarzenia…
        </p>
      )}
      {state.status === "unavailable" && (
        <p className="match-panel-message">Dane o przebiegu meczu są niedostępne.</p>
      )}
      {state.status === "error" && (
        <div className="match-panel-error">
          <p className="match-panel-message" role="status">
            Nie udało się wczytać przebiegu meczu.
          </p>
          <Button type="button" variant="outline" onClick={retry}>
            Ponów próbę
          </Button>
        </div>
      )}
      {state.status === "ready" && (
        <>
          {state.data.events.length > 0 ? (
            <ol className="match-events-list" role="list">
              {state.data.events.map((event, position) => (
                <MatchEventRow event={event} match={match} key={position} />
              ))}
            </ol>
          ) : (
            <p className="match-panel-message">Brak zdarzeń w zapisanych danych.</p>
          )}
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
