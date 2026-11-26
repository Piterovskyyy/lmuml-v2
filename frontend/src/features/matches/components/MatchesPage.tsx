import { useMemo, useState, useSyncExternalStore } from "react";
import { m } from "motion/react";
import {
  ArrowDown,
  ArrowDownUp,
  ArrowUpRight,
  CalendarDays,
  Check,
  CircleAlert,
  Clock3,
  RefreshCw,
  Search,
  SlidersHorizontal,
  Trophy,
  X,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ApiError, type SeasonMatchesResponse } from "../api/season-matches";
import { useSeasonMatches } from "../api/use-season-matches";
import { competitionPhase, CompetitionPhase } from "../model/competition-stage";
import { buildKnockoutBracket } from "../model/knockout-bracket";
import { buildLeagueTable } from "../model/league-table";
import {
  DISPLAY_TIME_ZONE,
  filterMatches,
  groupMatchesByDate,
  type MatchFilter,
} from "../model/match-presentation";
import { MatchState } from "../model/match-status";
import { roundLabel } from "../model/round-label";
import { readSeasonCode } from "../model/season-selection";
import { MatchRow } from "./MatchRow";
import { KnockoutBracket } from "./KnockoutBracket";
import { LeagueTable } from "./LeagueTable";
import { SeasonOverview } from "./SeasonOverview";
import "../competition.css";

const PAGE_SIZE = 24;
const captureDateTime = new Intl.DateTimeFormat("pl-PL", {
  dateStyle: "long",
  timeStyle: "short",
  timeZone: DISPLAY_TIME_ZONE,
});

enum CompetitionView {
  Matches = "#mecze",
  Table = "#tabela",
  Bracket = "#drabinka",
}

function readView(): CompetitionView | null {
  switch (window.location.hash) {
    case "#o-wynikach":
    case CompetitionView.Matches:
      return CompetitionView.Matches;
    case CompetitionView.Table:
      return CompetitionView.Table;
    case CompetitionView.Bracket:
      return CompetitionView.Bracket;
    default:
      return null;
  }
}

function subscribeToView(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

const competitionViews = [
  { view: CompetitionView.Matches, label: "Mecze i wyniki" },
  { view: CompetitionView.Bracket, label: "Drabinka" },
  { view: CompetitionView.Table, label: "Tabela" },
];
const filters: { value: MatchFilter; label: string }[] = [
  { value: "all", label: "Wszystkie" },
  { value: "finished", label: "Zakończone" },
  { value: "upcoming", label: "Nadchodzące" },
  { value: "live", label: "Na żywo" },
];

export function MatchesPage({
  reduceMotion,
  active = true,
  seasonCode = readSeasonCode(),
}: {
  reduceMotion: boolean;
  active?: boolean;
  seasonCode?: string;
}) {
  const { state, reload } = useSeasonMatches(seasonCode, active, { streamUpdates: true });
  const data = state.data;
  const fixturesCapturedAt = data?.fixturesCapturedAt;
  const requestedView = useSyncExternalStore(subscribeToView, readView);
  const competition = useMemo(() => {
    const matches = data?.matches ?? [];
    const phase = competitionPhase(matches);
    return {
      table: buildLeagueTable(matches, data?.standings),
      bracket: phase === CompetitionPhase.Knockout ? buildKnockoutBracket(matches) : [],
    };
  }, [data]);
  const availableViews = competitionViews.filter(({ view }) => {
    if (view === CompetitionView.Table) return competition.table.rows.length > 0;
    if (view === CompetitionView.Bracket) return competition.bracket.length > 0;
    return true;
  });
  const view = availableViews.some((item) => item.view === requestedView)
    ? requestedView
    : competition.bracket.length > 0
      ? CompetitionView.Bracket
      : competition.table.rows.length > 0
        ? CompetitionView.Table
        : CompetitionView.Matches;
  const seasonLabel = data
    ? `${data.season.startYear}/${String(data.season.startYear + 1).slice(-2)}`
    : "Sezon";
  const isHistorical =
    data &&
    data.matches.length > 0 &&
    data.matches.every((match) => match.status.state === MatchState.Finished) &&
    data.matches.every((match) => match.kickoffAt && Date.parse(match.kickoffAt) < Date.now());
  const refreshButton = (
    <Button
      variant="ghost"
      className="refresh-button"
      onClick={() => {
        if (state.status !== "loading") reload();
      }}
      aria-disabled={state.status === "loading"}
      aria-label="Odśwież mecze"
    >
      <RefreshCw aria-hidden="true" size={17} />
      <span>Odśwież</span>
    </Button>
  );

  return (
    <main tabIndex={-1}>
      <section className="hero-section page-container" aria-labelledby="page-heading">
        <m.div
          className="hero-copy"
          initial={reduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          <div className="hero-eyebrow">
            <span className="eyebrow-line" />
            <span>NASZA GRA. NASZE EMOCJE.</span>
          </div>
          <h1 id="page-heading">
            Każdy mecz.
            <br />
            <span>Wszystkie emocje.</span>
          </h1>
          <p>
            Od pierwszego gwizdka do wielkiego finału.
            <br className="desktop-break" /> Twój sezon, w jednym miejscu.
          </p>
          <a className="hero-link" href="#mecze">
            Zobacz mecze <ArrowDown aria-hidden="true" size={17} />
          </a>
        </m.div>
        <m.div
          className="competition-card"
          initial={reduceMotion ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: reduceMotion ? 0 : 0.08 }}
        >
          <div className="competition-card-top">
            <span className="competition-symbol">
              <Trophy aria-hidden="true" strokeWidth={1.5} />
            </span>
            <Badge variant="outline" className="season-badge">
              {seasonLabel}
            </Badge>
          </div>
          <span className="competition-overline">EUROPEJSKIE WIECZORY</span>
          <h2>{data?.competition.name ?? "Mecze sezonu"}</h2>
          <div className="competition-card-bottom">
            <div>
              {data ? `${data.matches.length} meczów · Jeden sezon` : "Terminarz i wyniki"}
              {fixturesCapturedAt && (
                <p className="competition-card-freshness">
                  Dane meczów pobrano{" "}
                  <time dateTime={fixturesCapturedAt}>
                    {captureDateTime.format(new Date(fixturesCapturedAt))}
                  </time>
                </p>
              )}
            </div>
            <ArrowUpRight aria-hidden="true" />
          </div>
        </m.div>
      </section>

      <div className="page-container">
        {isHistorical && (
          <div className="archive-notice">
            <span className="archive-icon">
              <Clock3 aria-hidden="true" size={17} />
            </span>
            <p>
              <strong>Sezon {seasonLabel} — archiwum.</strong> Przeglądasz historyczne mecze i
              wyniki.
            </p>
            <Badge variant="outline">
              <Check aria-hidden="true" size={12} /> Zakończony sezon
            </Badge>
          </div>
        )}
        {availableViews.length > 1 && (
          <div className="competition-views">
            <nav aria-label="Widoki rozgrywek">
              {availableViews.map((item) => (
                <a
                  key={item.view}
                  href={item.view}
                  aria-current={view === item.view ? "page" : undefined}
                >
                  {item.label}
                </a>
              ))}
            </nav>
            {view !== CompetitionView.Matches && refreshButton}
          </div>
        )}
        {state.status === "error" && data && (
          <div className="refresh-notice" role="alert">
            <p>Nie udało się odświeżyć meczów. Pokazujemy poprzednio wczytane dane.</p>
            <Button variant="outline" onClick={reload}>
              Spróbuj ponownie
            </Button>
          </div>
        )}
        {view === CompetitionView.Table && <LeagueTable table={competition.table} />}
        {view === CompetitionView.Bracket && <KnockoutBracket rounds={competition.bracket} />}
        <div hidden={view !== CompetitionView.Matches}>
          <div className="content-layout">
            <section
              className="matches-section"
              id="mecze"
              aria-labelledby="matches-heading"
              aria-busy={state.status === "loading"}
            >
              <div className="matches-heading-row">
                <div>
                  <div className="section-kicker">
                    <span className="line-accent" /> Na boisku
                  </div>
                  <h2 id="matches-heading">
                    Mecze sezonu <span>{data?.matches.length ?? "—"}</span>
                  </h2>
                </div>
                {view === CompetitionView.Matches && refreshButton}
              </div>
              {state.status === "loading" && !data && <LoadingMatches />}
              {state.status === "error" && !data && (
                <LoadError error={state.error} retry={reload} />
              )}
              {data && <MatchBrowser data={data} />}
            </section>
            <aside className="season-sidebar" aria-label="Informacje o sezonie">
              {data ? (
                <SeasonOverview data={data} />
              ) : (
                <div className="sidebar-placeholder">
                  <Trophy aria-hidden="true" />
                  <h2>Więcej niż wynik</h2>
                  <p>Cały sezon, każda drużyna i emocje od kwalifikacji aż do finału.</p>
                </div>
              )}
            </aside>
          </div>
        </div>
      </div>
    </main>
  );
}

export function MatchBrowser({ data }: { data: SeasonMatchesResponse }) {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<MatchFilter>("all");
  const [round, setRound] = useState("all");
  const [order, setOrder] = useState("newest");
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const rounds = [
    ...new Set(
      data.matches
        .map((match) => match.tournamentRound)
        .filter((value): value is string => value !== null),
    ),
  ];
  const filtered = useMemo(() => {
    const result = filterMatches(data.matches, query, status).filter(
      (match) => round === "all" || match.tournamentRound === round,
    );
    return result.sort((a, b) => {
      if (a.kickoffAt === null) return b.kickoffAt === null ? a.id.localeCompare(b.id) : 1;
      if (b.kickoffAt === null) return -1;
      return (
        (order === "newest" ? -1 : 1) * a.kickoffAt.localeCompare(b.kickoffAt) ||
        a.id.localeCompare(b.id)
      );
    });
  }, [data.matches, query, status, round, order]);
  const groups = groupMatchesByDate(filtered.slice(0, visibleCount));
  if (order === "newest")
    groups.sort((a, b) =>
      a.key === "unknown" ? 1 : b.key === "unknown" ? -1 : b.key.localeCompare(a.key),
    );
  const activeFilters = query !== "" || status !== "all" || round !== "all";
  const reset = () => {
    setQuery("");
    setStatus("all");
    setRound("all");
    setOrder("newest");
    setVisibleCount(PAGE_SIZE);
  };

  return (
    <>
      <div className="match-toolbar">
        <div className="search-field">
          <Search aria-hidden="true" size={18} />
          <label htmlFor="team-search" className="sr-only">
            Szukaj drużyny lub rundy
          </label>
          <Input
            id="team-search"
            type="search"
            placeholder="Szukaj drużyny…"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
              setVisibleCount(PAGE_SIZE);
            }}
            autoComplete="off"
          />
          {query && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                setQuery("");
                setVisibleCount(PAGE_SIZE);
              }}
              aria-label="Wyczyść wyszukiwanie"
            >
              <X aria-hidden="true" size={16} />
            </Button>
          )}
        </div>
        <Select
          value={round}
          onValueChange={(value) => {
            setRound(value);
            setVisibleCount(PAGE_SIZE);
          }}
        >
          <SelectTrigger className="round-select" aria-label="Runda turnieju">
            <SlidersHorizontal aria-hidden="true" size={15} />
            <SelectValue placeholder="Wszystkie rundy" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Wszystkie rundy</SelectItem>
            {rounds.map((value) => (
              <SelectItem key={value} value={value}>
                {roundLabel(value)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div className="filter-and-sort">
        <div className="status-filters" role="group" aria-label="Status meczów">
          {filters.map((filter) => (
            <Button
              key={filter.value}
              variant="ghost"
              className={status === filter.value ? "filter-active" : ""}
              aria-pressed={status === filter.value}
              onClick={() => {
                setStatus(filter.value);
                setOrder(filter.value === "upcoming" ? "oldest" : "newest");
                setVisibleCount(PAGE_SIZE);
              }}
            >
              {filter.value === "live" && <span className="live-dot" aria-hidden="true" />}
              {filter.label}
            </Button>
          ))}
        </div>
        <Select
          value={order}
          onValueChange={(value) => {
            setOrder(value);
            setVisibleCount(PAGE_SIZE);
          }}
        >
          <SelectTrigger className="order-select" aria-label="Kolejność meczów">
            <ArrowDownUp aria-hidden="true" size={14} />
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="newest">Od najnowszych</SelectItem>
            <SelectItem value="oldest">Od najstarszych</SelectItem>
          </SelectContent>
        </Select>
      </div>
      <div className="filter-summary" aria-live="polite" aria-atomic="true">
        <span>
          {filtered.length} {filtered.length === 1 ? "mecz" : "meczów"}
          {activeFilters ? " pasujących do filtrów" : " w tym sezonie"}
        </span>
        {activeFilters && (
          <button type="button" onClick={reset}>
            Wyczyść filtry <X aria-hidden="true" size={13} />
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="empty-state">
          <Search aria-hidden="true" />
          <h3>
            {data.matches.length === 0
              ? "Ten sezon jeszcze czeka na mecze"
              : "Nie znaleźliśmy takich meczów"}
          </h3>
          <p>
            {data.matches.length === 0
              ? "Wróć tutaj po uzupełnieniu terminarza."
              : "Spróbuj innej nazwy drużyny lub zmień wybrane filtry."}
          </p>
          {activeFilters && (
            <Button variant="outline" onClick={reset}>
              Pokaż wszystkie mecze
            </Button>
          )}
        </div>
      ) : (
        <div className="match-groups">
          {groups.map((group) => (
            <section className="match-group" key={group.key} aria-labelledby={`date-${group.key}`}>
              <div className="date-heading">
                <CalendarDays aria-hidden="true" size={16} />
                <h3 id={`date-${group.key}`}>{group.label}</h3>
                <span>{group.matches.length}</span>
              </div>
              <div className="match-day-list">
                {group.matches.map((match) => (
                  <MatchRow key={match.id} match={match} />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
      {filtered.length > 0 && (
        <div className="load-more">
          <p>
            Wyświetlono {Math.min(visibleCount, filtered.length)} z {filtered.length} meczów
          </p>
          {visibleCount < filtered.length && (
            <Button variant="outline" onClick={() => setVisibleCount((count) => count + PAGE_SIZE)}>
              Pokaż kolejne mecze <ArrowDown aria-hidden="true" size={16} />
            </Button>
          )}
        </div>
      )}
    </>
  );
}

function LoadingMatches() {
  return (
    <div className="loading-state" role="status" aria-label="Wczytywanie meczów">
      <p>Wczytujemy mecze sezonu…</p>
      {[1, 2, 3, 4].map((item) => (
        <div key={item} className="skeleton-row">
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function LoadError({ error, retry }: { error: ApiError; retry: () => void }) {
  const missing = error.status === 404;
  return (
    <div className="error-state" role="alert">
      <CircleAlert aria-hidden="true" />
      <h3>{missing ? "Nie znaleźliśmy tego sezonu" : "Nie udało się wczytać meczów"}</h3>
      <p>
        {missing
          ? "Sprawdź adres sezonu i spróbuj ponownie."
          : "Dane są chwilowo niedostępne. Możesz spróbować ponownie za moment."}
      </p>
      <Button onClick={retry}>
        <RefreshCw aria-hidden="true" /> Spróbuj ponownie
      </Button>
    </div>
  );
}
