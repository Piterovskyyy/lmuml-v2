import { useId, useState } from "react";
import { Button } from "@/components/ui/button";
import type { GameStatistics } from "../api/prediction-statistics";
import "./game-statistics-detail.css";

const metrics = [
  { id: "outcome", label: "Skuteczność 1/X/2" },
  { id: "exact", label: "Dokładne wyniki" },
  { id: "settled", label: "Rozliczone typy" },
] as const;

type Metric = (typeof metrics)[number]["id"];
type Round = NonNullable<GameStatistics["rounds"]>[number];
type ChartRow = { round: Round; value: number; hits: number };

const number = new Intl.NumberFormat("pl-PL");
const percent = new Intl.NumberFormat("pl-PL", { style: "percent", maximumFractionDigits: 1 });

function roundValue(round: Round, metric: Metric): ChartRow {
  const settled = round.settledPredictions;
  const hits = metric === "exact" ? round.exactScores : round.correctOutcomes;
  return { round, value: metric === "settled" ? settled : hits / settled, hits };
}

function RoundHighlight({
  rows,
  isCount,
  format,
}: {
  rows: readonly ChartRow[];
  isCount: boolean;
  format: Intl.NumberFormat;
}) {
  if (rows.length < 2) return null;

  const values = rows.map(({ value }) => value);
  const extreme = isCount ? Math.max(...values) : Math.min(...values);
  const withExtreme = rows.filter(({ value }) => value === extreme);
  const result = format.format(extreme);

  if (withExtreme.length === rows.length) {
    return (
      <figcaption className="game-detail-highlight" aria-live="polite">
        {isCount ? "Tyle samo typów w każdej rundzie" : "Taka sama skuteczność w każdej rundzie"}
        {" · "}
        <strong>{result}</strong>
      </figcaption>
    );
  }

  return (
    <figcaption className="game-detail-highlight" aria-live="polite">
      {isCount ? "Najwięcej typów" : "Najniższa skuteczność"}
      {" · "}
      <strong>
        {withExtreme.length === 1 ? withExtreme[0].round.name : `w ${withExtreme.length} rundach`}
      </strong>
      {" · "}
      {result}
    </figcaption>
  );
}

export function GameStatisticsDetail({ data }: { data: GameStatistics }) {
  const [metric, setMetric] = useState<Metric>("outcome");
  const chartId = useId();
  const headingId = useId();
  const rounds = data.rounds?.filter((round) => round.settledPredictions > 0) ?? [];

  if (rounds.length === 0) {
    return (
      <p className="game-detail-empty">
        {data.settledPredictions > 0
          ? "Brak danych do porównania rund."
          : "Wykres pojawi się po rozliczeniu pierwszych typów."}
      </p>
    );
  }

  const rows = rounds.map((round) => roundValue(round, metric));
  const isCount = metric === "settled";
  const format = isCount ? number : percent;
  const maximum = isCount ? Math.max(...rows.map(({ value }) => value)) : 1;
  const currentMetric = metrics.find(({ id }) => metric === id);

  return (
    <section className="game-statistics-detail" aria-labelledby={headingId}>
      <div className="game-detail-header">
        <h3 id={headingId}>Typowanie w rundach</h3>
        <div className="game-detail-switch" role="group" aria-label="Miara wykresu">
          {metrics.map(({ id, label }) => (
            <Button
              key={id}
              type="button"
              size="sm"
              variant={metric === id ? "secondary" : "ghost"}
              aria-pressed={metric === id}
              aria-controls={chartId}
              onClick={() => setMetric(id)}
            >
              {label}
            </Button>
          ))}
        </div>
      </div>
      <figure
        id={chartId}
        className="game-detail-chart"
        data-metric={metric}
        aria-label={currentMetric ? `${currentMetric.label} według rund` : undefined}
      >
        <div className="game-detail-scale" aria-hidden="true">
          <span>{format.format(0)}</span>
          <span>{format.format(maximum)}</span>
        </div>
        <ol className="game-detail-bars" role="list">
          {rows.map(({ round, value, hits }) => (
            <li key={round.number}>
              <span className="game-detail-round">{round.name}</span>
              <span className="game-detail-track" aria-hidden="true">
                <span style={{ width: `${(value / maximum) * 100}%` }} />
              </span>
              <strong className="game-detail-value">
                {format.format(value)}
                {!isCount && (
                  <span className="sr-only">
                    {`, trafione ${number.format(hits)}, rozliczone ${number.format(round.settledPredictions)}`}
                  </span>
                )}
              </strong>
            </li>
          ))}
        </ol>
        <RoundHighlight rows={rows} isCount={isCount} format={format} />
      </figure>
    </section>
  );
}
