import { useRef, useState, type ReactElement } from "react";
import { ChartNoAxesColumn, ListOrdered, Users } from "lucide-react";
import { Tabs } from "radix-ui";
import { TeamCrest } from "@/components/football/TeamCrest";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import type { FootballMatch } from "../api/season-matches";
import {
  DISPLAY_TIME_ZONE,
  formatScore,
  primaryScore,
  primaryScoreLabel,
  scoreDetails,
  statusLabel,
} from "../model/match-presentation";
import { roundLabel } from "../model/round-label";
import { MatchState } from "../model/match-status";
import { MatchEventsPanel } from "./MatchEventsPanel";
import { MatchLineupsPanel } from "./MatchLineupsPanel";
import { MatchStatisticsPanel } from "./MatchStatisticsPanel";
import "./match-details.css";

const kickoffDate = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: DISPLAY_TIME_ZONE,
});

const matchDetailStates = new Set([
  MatchState.Finished,
  MatchState.Live,
  MatchState.Break,
  MatchState.Suspended,
]);

export function MatchDetailsDialog({
  match,
  children,
}: {
  match: FootballMatch;
  children: ReactElement;
}) {
  const [open, setOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const panelsRef = useRef<HTMLDivElement>(null);
  const hasDetailsTabs = matchDetailStates.has(match.status.state);
  const details = scoreDetails(match);

  function scrollToDetails() {
    const scrollArea = scrollRef.current;
    const panels = panelsRef.current;
    if (scrollArea && panels) {
      scrollArea.scrollTop = panels.offsetTop;
    }
  }

  const scrollArea = (
    <div
      ref={scrollRef}
      className="match-dialog-scroll"
      role="region"
      aria-label="Dane meczu"
      tabIndex={0}
    >
      <div className="detail-teams">
        <TeamCrest name={match.homeTeam.name} logoUrl={match.homeTeam.logoUrl} />
        <strong>
          {formatScore(primaryScore(match))}
          <span>{primaryScoreLabel(match)}</span>
        </strong>
        <TeamCrest name={match.awayTeam.name} logoUrl={match.awayTeam.logoUrl} />
      </div>
      <dl className="score-breakdown">
        <div>
          <dt>Do przerwy</dt>
          <dd>{formatScore(match.scores.halfTime)}</dd>
        </div>
        <div className="regulation-result">
          <dt>Po 90 minutach</dt>
          <dd>{formatScore(match.scores.regulationTime)}</dd>
        </div>
        {details.map((detail) => (
          <div key={detail.label}>
            <dt>{detail.label}</dt>
            <dd>{detail.score}</dd>
          </div>
        ))}
      </dl>
      <p className="detail-note">
        Wynik po 90 minutach obejmuje doliczony czas gry. Nie obejmuje dogrywki ani serii karnych.
        Kreska oznacza brak danych.
      </p>
      {open && hasDetailsTabs && (
        <div ref={panelsRef} className="match-detail-panels">
          <Tabs.Content value="events">
            <MatchEventsPanel match={match} />
          </Tabs.Content>
          <Tabs.Content value="statistics">
            <MatchStatisticsPanel match={match} onScopeChange={scrollToDetails} />
          </Tabs.Content>
          <Tabs.Content value="lineups">
            <MatchLineupsPanel match={match} />
          </Tabs.Content>
        </div>
      )}
      {open && match.status.state === MatchState.Scheduled && (
        <MatchLineupsPanel key={match.id} match={match} />
      )}
    </div>
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{children}</DialogTrigger>
      <DialogContent className="match-dialog" data-match-tabs={hasDetailsTabs || undefined}>
        <DialogHeader className="match-dialog-header">
          <span className="eyebrow">{roundLabel(match.tournamentRound)}</span>
          <DialogTitle>
            {match.homeTeam.name} — {match.awayTeam.name}
          </DialogTitle>
          <DialogDescription>
            {statusLabel(match)} ·{" "}
            {match.kickoffAt
              ? kickoffDate.format(new Date(match.kickoffAt))
              : "Termin do ustalenia"}{" "}
            · czas polski
          </DialogDescription>
        </DialogHeader>
        {hasDetailsTabs ? (
          <Tabs.Root
            key={match.id}
            defaultValue="events"
            activationMode="manual"
            onValueChange={scrollToDetails}
            className="match-detail-sections"
          >
            <div className="match-detail-navigation">
              <Tabs.List className="match-detail-tabs" aria-label="Dane meczowe">
                <Tabs.Trigger value="events">
                  <ListOrdered size={16} aria-hidden="true" />
                  Przebieg
                </Tabs.Trigger>
                <Tabs.Trigger value="statistics">
                  <ChartNoAxesColumn size={16} aria-hidden="true" />
                  Statystyki
                </Tabs.Trigger>
                <Tabs.Trigger value="lineups">
                  <Users size={16} aria-hidden="true" />
                  Składy
                </Tabs.Trigger>
              </Tabs.List>
            </div>
            {scrollArea}
          </Tabs.Root>
        ) : (
          scrollArea
        )}
      </DialogContent>
    </Dialog>
  );
}
