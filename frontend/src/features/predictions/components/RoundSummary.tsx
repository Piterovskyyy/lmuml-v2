import { ArrowDown, Check, Clock3, Info, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DemoRound } from "../model/demo-round";
import { scoreFromDraft, type PredictionEntry } from "../model/prediction-score";

export function RoundSummary({
  round,
  entries,
  dirtyCount,
}: {
  round: DemoRound;
  entries: Record<string, PredictionEntry>;
  dirtyCount: number;
}) {
  const saved = round.matches.filter((match) => entries[match.id].saved !== null).length;
  const firstMissing = round.matches.find(
    (match) => match.state === "open" && scoreFromDraft(entries[match.id].draft) === null,
  );
  const nextMatch = round.matches.find((match) => match.state === "open");
  const nextTime =
    nextMatch &&
    new Intl.DateTimeFormat("pl-PL", {
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Warsaw",
    }).format(new Date(nextMatch.kickoffAt));

  return (
    <aside className="prediction-sidebar" aria-label="Podsumowanie typów">
      <section className="round-progress-card">
        <div className="section-kicker">
          <span className="line-accent" /> Twój plan na wieczór
        </div>
        <h2>Twoja runda</h2>
        <div className="round-progress-number">
          <strong>
            {saved}
            <span> / {round.matches.length}</span>
          </strong>
          <Check aria-hidden="true" />
        </div>
        <p>typów zapisanych w podglądzie</p>
        <progress
          max={round.matches.length}
          value={saved}
          aria-label="Typy zapisane w podglądzie"
        />
        <dl className="round-progress-details">
          <div>
            <dt>Bez zapisanego typu</dt>
            <dd>{round.matches.length - saved}</dd>
          </div>
          <div>
            <dt>Niezapisane zmiany</dt>
            <dd className={dirtyCount ? "has-changes" : undefined}>{dirtyCount}</dd>
          </div>
        </dl>
        {firstMissing && (
          <Button
            variant="outline"
            className="w-full"
            onClick={() => document.getElementById(`${firstMissing.id}-home`)?.focus()}
          >
            Uzupełnij kolejny typ <ArrowDown aria-hidden="true" />
          </Button>
        )}
        <div className="round-next-deadline">
          <Clock3 aria-hidden="true" size={17} />
          <span>
            {nextTime ? (
              <>
                Najbliższy początek <strong>{nextTime}</strong>
              </>
            ) : (
              "Wszystkie mecze zakończone"
            )}
          </span>
        </div>
      </section>
      <section className="prediction-guide">
        <span className="guide-icon">
          <ShieldCheck aria-hidden="true" />
        </span>
        <h2>Prosta gra. Jasne zasady.</h2>
        <ol>
          <li>Wpisz gole obu drużyn.</li>
          <li>Zapisz gotowe typy jednym przyciskiem.</li>
          <li>Zmieniaj go do rozpoczęcia spotkania.</li>
        </ol>
        <p>Liczy się wynik po 90 minutach wraz z doliczonym czasem. Dogrywka i karne są osobno.</p>
      </section>
      {round.id === "finished" && (
        <p className="preview-points-note">
          <Info aria-hidden="true" size={18} /> Punktację i rozliczanie rundy dodamy po ustaleniu
          zasad. Tutaj porównasz typy z przykładowymi wynikami.
        </p>
      )}
    </aside>
  );
}
