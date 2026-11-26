import { useState } from "react";
import { m } from "motion/react";
import { CalendarDays, Check, FlaskConical, LockKeyhole, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { demoRounds, type DemoRound, type DemoScenarioId } from "../model/demo-round";
import {
  draftChanged,
  draftFromScore,
  scoreFromDraft,
  type PredictionDraft,
  type PredictionEntry,
} from "../model/prediction-score";
import { PredictionCard } from "./PredictionCard";
import { RoundSummary } from "./RoundSummary";
import "../predictions.css";

function initialEntries(): Record<DemoScenarioId, Record<string, PredictionEntry>> {
  const entriesFor = (round: DemoRound) =>
    Object.fromEntries(
      round.matches.map((match) => [
        match.id,
        { draft: draftFromScore(match.prediction), saved: match.prediction },
      ]),
    );
  return {
    before: entriesFor(demoRounds.before),
    live: entriesFor(demoRounds.live),
    finished: entriesFor(demoRounds.finished),
  };
}

const scenarios: { id: DemoScenarioId; label: string }[] = [
  { id: "before", label: "Przed meczami" },
  { id: "live", label: "W trakcie" },
  { id: "finished", label: "Po meczach" },
];
const matchStatus = { open: "Zaplanowany", live: "W trakcie", finished: "Zakończony" };

export function PredictionsPage({ reduceMotion }: { reduceMotion: boolean }) {
  const [scenario, setScenario] = useState<DemoScenarioId>("before");
  const [entries, setEntries] = useState(initialEntries);
  const [announcement, setAnnouncement] = useState("");
  const round = demoRounds[scenario];
  const roundEntries = entries[scenario];
  const openCount = round.matches.filter((match) => match.state === "open").length;
  const changedMatches = round.matches.filter((match) => {
    const entry = roundEntries[match.id];
    return match.state === "open" && draftChanged(entry.draft, entry.saved);
  });
  const readyEntries = changedMatches.flatMap(({ id }) => {
    const score = scoreFromDraft(roundEntries[id].draft);
    return score ? [[id, { draft: draftFromScore(score), saved: score }] as const] : [];
  });
  const incompleteCount = changedMatches.length - readyEntries.length;
  const date = new Intl.DateTimeFormat("pl-PL", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Warsaw",
  }).format(new Date(round.snapshotAt));

  function updateDraft(id: string, draft: PredictionDraft) {
    setAnnouncement("");
    setEntries((previous) => ({
      ...previous,
      [scenario]: { ...previous[scenario], [id]: { ...previous[scenario][id], draft } },
    }));
  }

  function saveRound() {
    if (!readyEntries.length) return;
    setEntries((previous) => ({
      ...previous,
      [scenario]: { ...previous[scenario], ...Object.fromEntries(readyEntries) },
    }));
    setAnnouncement(`Zapisane typy w podglądzie: ${readyEntries.length}.`);
  }

  return (
    <main
      tabIndex={-1}
      aria-labelledby="predictions-heading"
      className="predictions-page page-container"
    >
      <section className="preview-banner" aria-label="Informacja o wersji demonstracyjnej">
        <div className="preview-banner-copy">
          <FlaskConical aria-hidden="true" size={20} />
          <div>
            <strong>Podgląd ekranu typowania</strong>
            <p>
              Przykładowe mecze i wyniki. Zapis działa tylko w podglądzie i znika po odświeżeniu.
            </p>
          </div>
        </div>
        <div className="preview-scenarios" aria-label="Scenariusz podglądu">
          {scenarios.map((item) => (
            <Button
              key={item.id}
              variant="ghost"
              aria-pressed={scenario === item.id}
              onClick={() => {
                setScenario(item.id);
                setAnnouncement("");
              }}
            >
              {item.label}
            </Button>
          ))}
        </div>
      </section>
      <m.div
        className="predictions-heading"
        initial={reduceMotion ? false : { opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.35 }}
      >
        <div>
          <div className="section-kicker">
            <span className="line-accent" /> Nasza gra · Przykładowa runda
          </div>
          <h1 id="predictions-heading">
            Moje <span>typy.</span>
          </h1>
          <p>Twój piłkarski wieczór zaczyna się tutaj.</p>
        </div>
        <div className="round-heading-label">
          <span>Runda</span>
          <strong>4</strong>
          <span>6 meczów · Wynik po 90 min</span>
        </div>
      </m.div>
      <div className="predictions-layout">
        <section className="prediction-list" aria-labelledby="round-matches-heading">
          <div className="prediction-list-heading">
            <div>
              <h2 id="round-matches-heading">{round.label}</h2>
              <p>
                {scenario === "before"
                  ? "Wpisz wyniki wybranych meczów i zapisz gotowe typy razem."
                  : scenario === "live"
                    ? "Rozpoczęte mecze są zamknięte. Późniejsze nadal możesz typować."
                    : "Twoje typy i przykładowe wyniki po 90 minutach."}
              </p>
            </div>
            <span className="prediction-round-state">
              {openCount ? (
                <PencilLine aria-hidden="true" size={15} />
              ) : (
                <LockKeyhole aria-hidden="true" size={15} />
              )}
              {openCount ? `${openCount} do typowania` : "Typowanie zamknięte"}
            </span>
          </div>
          <div className="prediction-date">
            <CalendarDays aria-hidden="true" size={17} />
            <h3>{date}</h3>
            <span>Czas polski</span>
          </div>
          <form
            aria-label="Typy w rundzie"
            noValidate
            onSubmit={(event) => {
              event.preventDefault();
              saveRound();
            }}
          >
            {openCount > 0 && (
              <div className="prediction-save-bar">
                <div className="prediction-save-copy">
                  <strong>Zapis rundy</strong>
                  <p role="status">
                    {announcement ||
                      (readyEntries.length
                        ? `Gotowe do zapisania: ${readyEntries.length}.`
                        : "Brak typów do zapisania.")}
                    {incompleteCount > 0 && " Niepełne typy zostają w szkicu."}
                  </p>
                </div>
                <Button type="submit" disabled={!readyEntries.length}>
                  <Check aria-hidden="true" /> Zapisz typy
                  {readyEntries.length > 0 && ` (${readyEntries.length})`}
                </Button>
              </div>
            )}
            <div className="prediction-cards">
              {round.matches.map((match) => (
                <PredictionCard
                  key={match.id}
                  match={{
                    ...match,
                    context: [match.tournamentRound, match.venueCity],
                    statusLabel:
                      matchStatus[match.state] +
                      (match.state === "live" && match.elapsedMinutes !== null
                        ? ` · ${match.elapsedMinutes}′`
                        : ""),
                    scoreLabel: match.state === "finished" ? "Po 90 min" : "Wynik na żywo",
                  }}
                  editable={match.state === "open"}
                  entry={roundEntries[match.id]}
                  onChange={(draft) => updateDraft(match.id, draft)}
                  savedLabel="Zapisany w podglądzie"
                />
              ))}
            </div>
          </form>
          <p className="prediction-list-note">
            <Check aria-hidden="true" size={16} /> Każdy mecz ma osobny termin zamknięcia typowania.
          </p>
        </section>
        <RoundSummary round={round} entries={roundEntries} dirtyCount={changedMatches.length} />
      </div>
    </main>
  );
}
