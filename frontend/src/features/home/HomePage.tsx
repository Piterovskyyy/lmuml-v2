import type { ReactNode } from "react";
import { ArrowRight, ChartNoAxesColumn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { HomeCompetitionPreview } from "./components/HomeCompetitionPreview";
import { HomeGameOverview } from "./components/HomeGameOverview";
import { HomeRoundPredictions } from "./components/HomeRoundPredictions";
import "./home.css";

export function HomePage({
  seasonCode,
  seasonFallback,
  reduceMotion,
}: {
  seasonCode: string | null;
  seasonFallback?: ReactNode;
  reduceMotion: boolean;
}) {
  return (
    <main
      className="page-container home-page"
      data-animate={!reduceMotion}
      tabIndex={-1}
      aria-labelledby="home-title"
    >
      <div className="home-hero">
        <div className="home-intro">
          <h1 id="home-title">
            Wieczór <span>meczowy.</span>
          </h1>
          <p>Typuj wyniki ze znajomymi i sprawdź, kto najlepiej przewiduje mecze.</p>
          <div className="home-intro-actions">
            <Button asChild>
              <a href="#rozgrywki">
                Rozgrywki <ArrowRight aria-hidden="true" />
              </a>
            </Button>
            <Button asChild variant="outline">
              <a href="#statystyki">
                <ChartNoAxesColumn aria-hidden="true" /> Statystyki
              </a>
            </Button>
          </div>
        </div>
        {seasonCode ? <HomeRoundPredictions seasonCode={seasonCode} /> : seasonFallback}
      </div>
      {seasonCode && (
        <div className="home-content">
          <HomeGameOverview key={seasonCode} seasonCode={seasonCode} />
          <HomeCompetitionPreview seasonCode={seasonCode} />
        </div>
      )}
    </main>
  );
}
