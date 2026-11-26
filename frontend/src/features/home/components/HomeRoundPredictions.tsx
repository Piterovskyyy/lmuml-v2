import { useEffect, useId, useMemo, useRef, useState } from "react";
import { ArrowRight, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DISPLAY_TIME_ZONE } from "@/features/matches/model/match-presentation";
import { MatchState } from "@/features/matches/model/match-status";
import type { PublishedRounds } from "@/features/predictions/api/published-rounds";
import { usePredictionSession } from "@/features/predictions/api/use-prediction-session";
import { usePublishedRounds } from "@/features/predictions/api/use-published-rounds";
import { PlayerRoundPredictions } from "@/features/predictions/components/PlayerRoundPredictions";
import "@/features/predictions/published-rounds.css";

type Round = PublishedRounds["rounds"][number];

const kickoffFormat = new Intl.DateTimeFormat("pl-PL", {
  timeZone: DISPLAY_TIME_ZONE,
  weekday: "short",
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

function nextOpenRound(rounds: readonly Round[], now: number) {
  let next: { round: Round; kickoff: number } | undefined;
  for (const round of rounds) {
    const open = round.matches.flatMap((match) => {
      if (match.status.state !== MatchState.Scheduled || !match.kickoffAt) return [];
      const kickoff = Date.parse(match.kickoffAt);
      return kickoff > now ? [{ match, kickoff }] : [];
    });
    open.sort((a, b) => a.kickoff - b.kickoff);
    const earliest = open[0];
    if (earliest && (!next || earliest.kickoff < next.kickoff)) {
      next = {
        round: { ...round, matches: open.map(({ match }) => match) },
        kickoff: earliest.kickoff,
      };
    }
  }
  return next;
}

export function HomeRoundPredictions({ seasonCode }: { seasonCode: string }) {
  const { data, loading, failed, reload } = usePublishedRounds(seasonCode);
  const next = useMemo(() => nextOpenRound(data?.rounds ?? [], Date.now()), [data]);
  const round = next?.round;
  const { state, player, refresh } = usePredictionSession(Boolean(round));
  const id = useId();
  const editorId = `${id}-editor`;
  const heading = useRef<HTMLHeadingElement>(null);
  const toggle = useRef<HTMLButtonElement>(null);
  const [editor, setEditor] = useState<{ roundId: string; expanded: boolean }>();
  const hasOpened = Boolean(round && editor?.roundId === round.id);
  const expanded = hasOpened && Boolean(editor?.expanded) && Boolean(player);
  const editorActive = expanded && state.status === "ready";

  useEffect(() => {
    if (expanded) {
      heading.current?.focus({ preventScroll: true });
      heading.current?.scrollIntoView?.({ block: "start", behavior: "instant" });
    }
  }, [expanded]);

  return (
    <>
      <section className="home-round-summary" aria-labelledby={`${id}-title`}>
        <header className="home-round-heading">
          <h2 id={`${id}-title`}>Najbliższa runda</h2>
          {round && <span>{round.name}</span>}
        </header>
        {next && (
          <div className="home-round-details">
            <p>
              Mecze do typowania: <strong>{next.round.matches.length}</strong>
            </p>
            <p>
              Najbliższy termin{" "}
              <time dateTime={new Date(next.kickoff).toISOString()}>
                {kickoffFormat.format(next.kickoff)}
              </time>
            </p>
          </div>
        )}
        {!round && loading && <p role="status">Sprawdzam najbliższe mecze do typowania…</p>}
        {failed && (
          <div className="home-round-actions">
            <p role="alert">
              {data
                ? "Nie udało się odświeżyć meczów do typowania."
                : "Nie udało się pobrać rund typowania."}
            </p>
            <Button type="button" variant="outline" onClick={reload}>
              Spróbuj ponownie
            </Button>
          </div>
        )}
        {!round && !loading && !failed && <p>Nie ma teraz otwartych meczów do typowania.</p>}
        {round && state.status === "error" && !expanded && (
          <div className="home-round-actions">
            <p role="alert">Nie udało się sprawdzić sesji gracza.</p>
            <Button type="button" variant="outline" onClick={refresh}>
              Spróbuj ponownie
            </Button>
          </div>
        )}
        <div className="home-round-actions">
          {round &&
            (state.status === "ready" || expanded) &&
            (player ? (
              <Button
                ref={toggle}
                type="button"
                aria-expanded={expanded}
                aria-controls={editorId}
                onClick={() => setEditor({ roundId: round.id, expanded: !expanded })}
              >
                {expanded ? "Zwiń typowanie" : "Typuj rundę"}
                <ChevronDown aria-hidden="true" />
              </Button>
            ) : (
              <Button asChild variant="outline">
                <a href="#konto">Zaloguj się, by typować</a>
              </Button>
            ))}
          <Button asChild variant="ghost">
            <a href="#typy">
              Moje typy <ArrowRight aria-hidden="true" />
            </a>
          </Button>
          {data && !failed && !expanded && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Odśwież mecze do typowania"
              title="Odśwież mecze do typowania"
              disabled={loading}
              onClick={reload}
            >
              <RefreshCw aria-hidden="true" />
            </Button>
          )}
        </div>
      </section>
      {round && player && (
        <section
          className="home-round-editor"
          id={editorId}
          aria-labelledby={`${id}-editor-title`}
          hidden={!expanded}
        >
          <h2
            className="home-round-editor-title"
            id={`${id}-editor-title`}
            ref={heading}
            tabIndex={-1}
          >
            Typy w rundzie {round.number}
          </h2>
          {state.status === "checking" && <p role="status">Sprawdzam sesję gracza…</p>}
          {state.status === "error" && (
            <div className="home-round-actions">
              <p role="alert">Nie udało się sprawdzić sesji gracza.</p>
              <Button type="button" variant="outline" onClick={refresh}>
                Spróbuj ponownie
              </Button>
            </div>
          )}
          {hasOpened && (
            <PlayerRoundPredictions
              key={player.player.id}
              round={round}
              active={editorActive}
              csrfToken={player.csrfToken}
              refreshSession={refresh}
            />
          )}
          <div className="home-round-editor-actions">
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                setEditor({ roundId: round.id, expanded: false });
                toggle.current?.focus();
              }}
            >
              <ChevronUp aria-hidden="true" /> Zwiń panel typowania
            </Button>
          </div>
        </section>
      )}
    </>
  );
}
