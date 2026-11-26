import type { PredictionScore } from "./prediction-score";

export type DemoScenarioId = "before" | "live" | "finished";

type DemoTeam = { name: string; logoUrl: string | null };

export type DemoMatch = {
  id: string;
  homeTeam: DemoTeam;
  awayTeam: DemoTeam;
  kickoffAt: string;
  tournamentRound: string;
  venueCity: string;
  state: "open" | "live" | "finished";
  elapsedMinutes: number | null;
  score: PredictionScore | null;
  halfTimeScore: PredictionScore | null;
  prediction: PredictionScore | null;
};

export type DemoRound = {
  id: DemoScenarioId;
  label: string;
  snapshotAt: string;
  matches: DemoMatch[];
};

function team(name: string, providerId: number): DemoTeam {
  return { name, logoUrl: `https://media.api-sports.io/football/teams/${providerId}.png` };
}

// Invented pairings and results for the UI preview, not a real competition schedule.
// Snapshot states stay explicit: neither the device clock nor these fixtures authorizes real bets.
const fixtures = [
  {
    homeTeam: team("Bayern Monachium", 157),
    awayTeam: team("Borussia Dortmund", 165),
    venueCity: "Monachium",
  },
  {
    homeTeam: team("Real Madryt", 541),
    awayTeam: team("Inter Mediolan", 505),
    venueCity: "Madryt",
  },
  { homeTeam: team("Paris Saint-Germain", 85), awayTeam: team("Arsenal", 42), venueCity: "Paryż" },
  { homeTeam: team("Liverpool", 40), awayTeam: team("FC Barcelona", 529), venueCity: "Liverpool" },
  { homeTeam: team("Benfica", 211), awayTeam: team("Juventus", 496), venueCity: "Lizbona" },
  { homeTeam: team("Atlético Madryt", 530), awayTeam: team("Atalanta", 499), venueCity: "Madryt" },
].map((fixture, index) => ({
  ...fixture,
  id: `demo-match-${index + 1}`,
  kickoffAt: index < 2 ? "2026-11-03T17:45:00Z" : "2026-11-03T20:00:00Z",
  tournamentRound: "Faza ligowa",
}));

const initialPredictions: (PredictionScore | null)[] = [
  { home: 2, away: 1 },
  { home: 1, away: 1 },
  null,
  null,
  null,
  null,
];

const finishedPredictions: PredictionScore[] = [
  { home: 2, away: 1 },
  { home: 1, away: 1 },
  { home: 2, away: 0 },
  { home: 1, away: 2 },
  { home: 0, away: 0 },
  { home: 2, away: 1 },
];

const finishedScores: PredictionScore[] = [
  { home: 2, away: 1 },
  { home: 2, away: 0 },
  { home: 1, away: 0 },
  { home: 1, away: 2 },
  { home: 0, away: 0 },
  { home: 1, away: 1 },
];

const halfTimeScores: PredictionScore[] = [
  { home: 1, away: 0 },
  { home: 1, away: 0 },
  { home: 0, away: 0 },
  { home: 1, away: 1 },
  { home: 0, away: 0 },
  { home: 0, away: 1 },
];

export const demoRounds: Record<DemoScenarioId, DemoRound> = {
  before: {
    id: "before",
    label: "Przed meczami",
    snapshotAt: "2026-11-03T17:00:00Z",
    matches: fixtures.map((fixture, index) => ({
      ...fixture,
      state: "open",
      elapsedMinutes: null,
      score: null,
      halfTimeScore: null,
      prediction: initialPredictions[index],
    })),
  },
  live: {
    id: "live",
    label: "W trakcie",
    snapshotAt: "2026-11-03T18:15:00Z",
    matches: fixtures.map((fixture, index) => ({
      ...fixture,
      state: index < 2 ? "live" : "open",
      elapsedMinutes: index < 2 ? 30 : null,
      score: index < 2 ? { home: index === 0 ? 1 : 0, away: 0 } : null,
      halfTimeScore: null,
      prediction: initialPredictions[index],
    })),
  },
  finished: {
    id: "finished",
    label: "Po meczach",
    snapshotAt: "2026-11-03T22:00:00Z",
    matches: fixtures.map((fixture, index) => ({
      ...fixture,
      state: "finished",
      elapsedMinutes: 90,
      score: finishedScores[index],
      halfTimeScore: halfTimeScores[index],
      prediction: finishedPredictions[index],
    })),
  },
};
