const roundLabels: Record<string, string> = {
  "1st Qualifying Round": "1. runda kwalifikacji",
  "2nd Qualifying Round": "2. runda kwalifikacji",
  "3rd Qualifying Round": "3. runda kwalifikacji",
  "Play-offs": "Play-off kwalifikacji",
  "Knockout Round Play-offs": "Play-off fazy pucharowej",
  "Round of 16": "1/8 finału",
  "Quarter-finals": "Ćwierćfinały",
  "Semi-finals": "Półfinały",
  Final: "Finał",
};

export function roundLabel(round: string | null): string {
  if (!round) return "Runda nieokreślona";
  const leagueStage = /^League Stage - (\d+)$/.exec(round);
  if (leagueStage) return `Faza ligowa · ${leagueStage[1]}`;
  return Object.hasOwn(roundLabels, round) ? roundLabels[round]! : round;
}
