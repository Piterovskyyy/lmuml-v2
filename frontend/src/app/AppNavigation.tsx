import { CalendarDays, ClipboardPenLine, House, Trophy } from "lucide-react";
import type { AppPage } from "./use-app-page";
import "./app-navigation.css";

const links = [
  { page: "start", label: "Start", icon: House },
  { page: "typy", label: "Moje typy", icon: ClipboardPenLine },
  { page: "mecze", label: "Rozgrywki", icon: CalendarDays },
  { page: "ranking", label: "Ranking", icon: Trophy },
] as const;

const rankingViews = [
  { page: "ranking", label: "Klasyfikacja" },
  { page: "typy-graczy", label: "Typy graczy" },
  { page: "statystyki", label: "Statystyki" },
] as const;

export function AppNavigation({ page }: { page: AppPage }) {
  const section = page === "typy-graczy" || page === "statystyki" ? "ranking" : page;
  return (
    <nav className="app-navigation" aria-label="Nawigacja główna">
      {links.map(({ page: target, label, icon: Icon }) => (
        <a
          key={target}
          className="nav-link"
          href={target === "mecze" ? "#rozgrywki" : `#${target}`}
          aria-current={target === section ? (page === target ? "page" : "location") : undefined}
        >
          <Icon aria-hidden="true" size={19} />
          <span>{label}</span>
        </a>
      ))}
    </nav>
  );
}

export function RankingNavigation({ page }: { page: (typeof rankingViews)[number]["page"] }) {
  return (
    <nav className="ranking-navigation" aria-label="Widoki rankingu">
      {rankingViews.map(({ page: target, label }) => (
        <a key={target} href={`#${target}`} aria-current={page === target ? "page" : undefined}>
          {label}
        </a>
      ))}
    </nav>
  );
}
