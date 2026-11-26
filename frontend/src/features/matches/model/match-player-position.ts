export enum MatchPlayerPosition {
  Goalkeeper = "GOALKEEPER",
  Defender = "DEFENDER",
  Midfielder = "MIDFIELDER",
  Forward = "FORWARD",
  Unknown = "UNKNOWN",
}

export const matchPlayerPositionLabels = {
  [MatchPlayerPosition.Goalkeeper]: "Bramkarz",
  [MatchPlayerPosition.Defender]: "Obrońca",
  [MatchPlayerPosition.Midfielder]: "Pomocnik",
  [MatchPlayerPosition.Forward]: "Napastnik",
  [MatchPlayerPosition.Unknown]: null,
} satisfies Record<MatchPlayerPosition, string | null>;
