import { useEffect, useRef, useState } from "react";
import { UserRound } from "lucide-react";
import { domAnimation, LazyMotion, MotionConfig, useReducedMotion } from "motion/react";
import { PlayerAccountPage } from "@/features/account/components/PlayerAccountPage";
import { HomePage } from "@/features/home/HomePage";
import { StatisticsPage } from "@/features/statistics/StatisticsPage";
import { MatchesPage } from "@/features/matches/components/MatchesPage";
import { PredictionsPage } from "@/features/predictions/components/PredictionsPage";
import { PublishedPredictionsPage } from "@/features/predictions/components/PublishedPredictionsPage";
import { RankingPage } from "@/features/ranking/RankingPage";
import { PlayersPredictionsPage } from "@/features/players-predictions/PlayersPredictionsPage";
import { StarBackdrop } from "@/components/visual/StarBackdrop";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";
import { AppNavigation, RankingNavigation } from "./AppNavigation";
import { AppPreferences } from "./AppPreferences";
import { useActiveSeason } from "./use-active-season";
import { useAppPage } from "./use-app-page";

const COMFORT_KEY = "lmuml.comfort.v1";
const BACKGROUND_MOTION_KEY = "lmuml.background-motion.v1";
const PAGE_TITLES = {
  start: "Start",
  typy: "Moje typy",
  "typy-graczy": "Typy graczy",
  mecze: "Rozgrywki",
  ranking: "Ranking",
  statystyki: "Statystyki",
  konto: "Konto",
};

function readBooleanPreference(key: string, fallback: boolean) {
  try {
    const value = localStorage.getItem(key);
    return value === "true" ? true : value === "false" ? false : fallback;
  } catch {
    return fallback;
  }
}

export function App() {
  const page = useAppPage();
  const previousPage = useRef(page);
  const [hasVisitedPredictions, setHasVisitedPredictions] = useState(page === "typy");
  const [hasVisitedMatches, setHasVisitedMatches] = useState(page === "mecze");
  const [showDemo] = useState(
    () => new URLSearchParams(window.location.search).get("demo") === "1",
  );
  const { selection, retry } = useActiveSeason(page !== "konto", showDemo);
  const seasonCode = selection.status === "ready" ? selection.seasonCode : null;
  const rankingNavigation =
    page === "ranking" || page === "typy-graczy" || page === "statystyki" ? (
      <RankingNavigation page={page} />
    ) : null;
  const seasonFallback =
    selection.status === "error" ? (
      <div className="error-state">
        <p role="alert">Nie udało się wczytać aktywnego sezonu.</p>
        <Button type="button" onClick={retry}>
          Spróbuj ponownie
        </Button>
      </div>
    ) : (
      <div className="loading-state" role="status">
        Wczytuję sezon…
      </div>
    );
  const [comfort, setComfort] = useState(() => readBooleanPreference(COMFORT_KEY, false));
  const [backgroundMotion, setBackgroundMotion] = useState(() =>
    readBooleanPreference(BACKGROUND_MOTION_KEY, true),
  );
  const prefersReducedMotion = useReducedMotion();
  const reduceMotion = comfort || Boolean(prefersReducedMotion);
  const pauseBackdrop = reduceMotion || !backgroundMotion;

  useEffect(() => {
    document.title = `${PAGE_TITLES[page]} · LMuML`;
    if (page === "typy") setHasVisitedPredictions(true);
    if (page === "mecze") setHasVisitedMatches(true);
    if (previousPage.current === page) return;
    previousPage.current = page;
    document
      .querySelector<HTMLElement>(`[data-page="${page}"] main`)
      ?.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [page]);

  useEffect(() => {
    document.documentElement.dataset.comfort = String(comfort);
    try {
      localStorage.setItem(COMFORT_KEY, String(comfort));
      localStorage.setItem(BACKGROUND_MOTION_KEY, String(backgroundMotion));
    } catch {
      /* Preferences remain usable without storage. */
    }
  }, [comfort, backgroundMotion]);

  return (
    <LazyMotion features={domAnimation} strict>
      <MotionConfig reducedMotion={reduceMotion ? "always" : "user"}>
        <a
          className="skip-link"
          href="#main-content"
          onClick={(event) => {
            event.preventDefault();
            document.querySelector<HTMLElement>(`[data-page="${page}"] main`)?.focus();
          }}
        >
          Przejdź do treści
        </a>
        <header className="site-header">
          <div className="page-container header-content">
            <a href="#start" className="brand" aria-label="LMuML — strona główna">
              <BrandMark />
              <span>
                LMuML<span className="brand-tagline">Razem dla piłki.</span>
              </span>
            </a>
            <AppNavigation page={page} />
            <div className="header-actions">
              <Button asChild variant="outline" className="account-link">
                <a href="#konto" aria-current={page === "konto" ? "page" : undefined}>
                  <UserRound aria-hidden="true" />
                  Konto
                </a>
              </Button>
              <AppPreferences
                comfort={comfort}
                onComfortChange={setComfort}
                backgroundMotion={backgroundMotion}
                onBackgroundMotionChange={setBackgroundMotion}
                reduceMotion={reduceMotion}
              />
            </div>
          </div>
        </header>
        <div className="app-stage">
          <StarBackdrop reduceMotion={pauseBackdrop} />
          {page === "start" && (
            <div data-page={page} id="main-content">
              <HomePage
                seasonCode={seasonCode}
                seasonFallback={seasonFallback}
                reduceMotion={reduceMotion}
              />
            </div>
          )}
          {seasonCode && (hasVisitedPredictions || page === "typy") && (
            <div
              data-page="typy"
              id={page === "typy" ? "main-content" : undefined}
              hidden={page !== "typy"}
            >
              {showDemo ? (
                <PredictionsPage reduceMotion={reduceMotion} />
              ) : (
                <PublishedPredictionsPage seasonCode={seasonCode} active={page === "typy"} />
              )}
            </div>
          )}
          {seasonCode && (hasVisitedMatches || page === "mecze") && (
            <div
              data-page="mecze"
              id={page === "mecze" ? "main-content" : undefined}
              hidden={page !== "mecze"}
            >
              <MatchesPage
                seasonCode={seasonCode}
                reduceMotion={reduceMotion}
                active={page === "mecze"}
              />
            </div>
          )}
          {rankingNavigation && seasonCode && (
            <div data-page={page} id="main-content">
              {page === "ranking" ? (
                <RankingPage seasonCode={seasonCode} navigation={rankingNavigation} />
              ) : page === "typy-graczy" ? (
                <PlayersPredictionsPage seasonCode={seasonCode} navigation={rankingNavigation} />
              ) : (
                <StatisticsPage
                  seasonCode={seasonCode}
                  navigation={rankingNavigation}
                  reduceMotion={reduceMotion}
                />
              )}
            </div>
          )}
          {page === "konto" && (
            <div data-page={page} id="main-content">
              <PlayerAccountPage />
            </div>
          )}
          {!seasonCode && page !== "konto" && page !== "start" && (
            <div data-page={page} id="main-content">
              <main className="page-container py-8" tabIndex={-1}>
                {rankingNavigation}
                {seasonFallback}
              </main>
            </div>
          )}
          <footer className="site-footer page-container">
            <span className="footer-brand">
              LMuML<span>Piłka łączy. Wyniki zostają.</span>
            </span>
            <span>
              Niezależna aplikacja kibiców <span aria-hidden="true">↗</span>
            </span>
          </footer>
        </div>
      </MotionConfig>
    </LazyMotion>
  );
}
