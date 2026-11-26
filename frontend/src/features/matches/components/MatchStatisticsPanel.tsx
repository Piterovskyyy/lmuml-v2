import { useEffect, useId, useRef, useState } from "react";
import { ChartNoAxesColumn } from "lucide-react";
import { Tabs } from "radix-ui";
import { Button } from "@/components/ui/button";
import { fetchMatchStatistics, type MatchStatistics } from "../api/match-statistics";
import type { FootballMatch } from "../api/season-matches";
import { DISPLAY_TIME_ZONE } from "../model/match-presentation";
import { MatchPlayerStatisticsPanel } from "./MatchPlayerStatisticsPanel";

const metrics = [
  { key: "possessionPercent", label: "Posiadanie piłki", suffix: "%" },
  { key: "shotsTotal", label: "Strzały" },
  { key: "shotsOnTarget", label: "Strzały celne" },
  { key: "corners", label: "Rzuty rożne" },
  { key: "fouls", label: "Faule" },
  { key: "saves", label: "Obrony bramkarza" },
] as const satisfies readonly {
  key: keyof MatchStatistics["home"];
  label: string;
  suffix?: string;
}[];

const statNumber = new Intl.NumberFormat("pl-PL", { maximumFractionDigits: 2 });
const capturedDate = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: DISPLAY_TIME_ZONE,
});

type State =
  { status: "loading" | "unavailable" | "error" } | { status: "ready"; data: MatchStatistics };

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

function MatchTeamStatisticsPanel({ match }: { match: FootballMatch }) {
  const [state, setState] = useState<State>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);
  const headingId = useId();
  const panel = useRef<HTMLElement>(null);
  const { id: matchId, homeTeam, awayTeam } = match;

  useEffect(() => {
    const controller = new AbortController();
    fetchMatchStatistics(matchId, controller.signal)
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

  const data = state.status === "ready" ? state.data : null;
  const availableMetrics = data
    ? metrics.filter(({ key }) => data.home[key] !== null || data.away[key] !== null)
    : [];

  return (
    <section className="match-statistics" aria-labelledby={headingId} ref={panel} tabIndex={-1}>
      <h3 className="match-panel-title" id={headingId}>
        <ChartNoAxesColumn size={20} aria-hidden="true" /> Statystyki meczu
      </h3>
      {state.status === "loading" && (
        <p className="match-panel-message" role="status">
          Wczytuję statystyki…
        </p>
      )}
      {(state.status === "unavailable" || (data && !availableMetrics.length)) && (
        <p className="match-panel-message">Brak zapisanych statystyk do tego meczu.</p>
      )}
      {state.status === "error" && (
        <div className="match-panel-error">
          <p className="match-panel-message" role="status">
            Nie udało się wczytać statystyk.
          </p>
          <Button type="button" variant="outline" onClick={retry}>
            Ponów próbę
          </Button>
        </div>
      )}
      {data && availableMetrics.length > 0 && (
        <>
          <div className="match-statistics-legend" aria-hidden="true">
            <span>{homeTeam.name}</span>
            <span>{awayTeam.name}</span>
          </div>
          <dl className="match-statistics-metrics">
            {availableMetrics.map((metric) => {
              const home = data.home[metric.key];
              const away = data.away[metric.key];
              const comparable = home !== null && away !== null && home + away > 0;
              const suffix = "suffix" in metric ? metric.suffix : undefined;
              return (
                <div key={metric.key}>
                  <dt>{metric.label}</dt>
                  <dd>
                    <strong>
                      <span className="sr-only">{homeTeam.name}: </span>
                      <StatValue value={home} suffix={suffix} />
                    </strong>
                    <span className="match-statistics-bar" aria-hidden="true">
                      {comparable && (
                        <>
                          <span style={{ flexGrow: home }} />
                          <span style={{ flexGrow: away }} />
                        </>
                      )}
                    </span>
                    <strong>
                      <span className="sr-only">{awayTeam.name}: </span>
                      <StatValue value={away} suffix={suffix} />
                    </strong>
                  </dd>
                </div>
              );
            })}
          </dl>
          <p className="match-panel-message">
            Pobrano{" "}
            <time dateTime={data.capturedAt}>{capturedDate.format(new Date(data.capturedAt))}</time>
          </p>
        </>
      )}
    </section>
  );
}

export function MatchStatisticsPanel({
  match,
  onScopeChange,
}: {
  match: FootballMatch;
  onScopeChange: () => void;
}) {
  return (
    <Tabs.Root
      className="match-statistic-sections"
      defaultValue="teams"
      activationMode="manual"
      onValueChange={onScopeChange}
    >
      <Tabs.List className="match-statistic-tabs" aria-label="Zakres statystyk">
        <Tabs.Trigger value="teams">Drużyny</Tabs.Trigger>
        <Tabs.Trigger value="players">Zawodnicy</Tabs.Trigger>
      </Tabs.List>
      <Tabs.Content value="teams">
        <MatchTeamStatisticsPanel match={match} />
      </Tabs.Content>
      <Tabs.Content value="players">
        <MatchPlayerStatisticsPanel match={match} />
      </Tabs.Content>
    </Tabs.Root>
  );
}
