import { useId } from "react";
import type { PlayerStatistics } from "../api/prediction-statistics";
import "./personal-prediction-insights.css";

type SettledCounts = Pick<
  PlayerStatistics["totals"],
  "exactScores" | "correctOutcomes" | "settledPredictions"
>;

const countFormat = new Intl.NumberFormat("pl-PL");
const averageFormat = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });
const percentFormat = new Intl.NumberFormat("pl-PL", {
  style: "percent",
  maximumFractionDigits: 1,
});
const roundNames = new Intl.ListFormat("pl-PL");

function outcomes({ exactScores, correctOutcomes, settledPredictions }: SettledCounts) {
  return [
    { kind: "exact", label: "Dokładne wyniki", count: exactScores },
    { kind: "outcome", label: "Tylko 1/X/2", count: correctOutcomes - exactScores },
    { kind: "miss", label: "Nietrafione", count: settledPredictions - correctOutcomes },
  ];
}

function PredictionDistribution({
  totals,
  showPercentages = false,
}: {
  totals: SettledCounts;
  showPercentages?: boolean;
}) {
  const segments = outcomes(totals);
  return (
    <div className="insights-distribution">
      <div className="insights-distribution-bar" aria-hidden="true">
        {segments.map(({ kind, count }) =>
          count > 0 ? <span key={kind} data-kind={kind} style={{ flexGrow: count }} /> : null,
        )}
      </div>
      <dl className="insights-distribution-labels">
        {segments.map(({ kind, label, count }) => (
          <div key={kind}>
            <dt>
              <span aria-hidden="true" data-kind={kind} />
              {label}
            </dt>
            <dd>
              <strong>{countFormat.format(count)}</strong>
              {showPercentages && (
                <span>{percentFormat.format(count / totals.settledPredictions)}</span>
              )}
            </dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

export function PersonalPredictionInsights({ data }: { data: PlayerStatistics }) {
  const titleId = useId();
  const { totals, rounds } = data;
  if (totals.settledPredictions === 0) return null;

  const settledRounds = rounds.filter((round) => round.settledPredictions > 0);
  const bestPoints = Math.max(...settledRounds.map((round) => round.points));
  const bestRounds = settledRounds.filter((round) => round.points === bestPoints);

  return (
    <section className="personal-prediction-insights" aria-labelledby={titleId}>
      <h3 id={titleId}>Jak trafiasz?</h3>
      <dl className="insights-highlights">
        {bestRounds.length > 0 && (
          <div>
            <dt>{bestRounds.length === 1 ? "Najlepsza runda" : "Najlepsze rundy"}</dt>
            <dd>
              <strong>{countFormat.format(bestPoints)} pkt</strong>
              <span>{roundNames.format(bestRounds.map((round) => round.name))}</span>
            </dd>
          </div>
        )}
        <div>
          <dt>Średnio za rozliczony typ</dt>
          <dd>
            <strong>{averageFormat.format(totals.points / totals.settledPredictions)} pkt</strong>
          </dd>
        </div>
      </dl>

      <h4>Trafienia w sezonie</h4>
      <PredictionDistribution totals={totals} showPercentages />

      {settledRounds.length > 0 && (
        <>
          <h4>Trafienia w rundach</h4>
          <ol className="insights-round-list">
            {settledRounds.map((round) => (
              <li key={round.id}>
                <span>{round.name}</span>
                <PredictionDistribution totals={round} />
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
