export enum MatchState {
  TimeUnconfirmed = "TIME_UNCONFIRMED",
  Scheduled = "SCHEDULED",
  Live = "LIVE",
  Break = "BREAK",
  Suspended = "SUSPENDED",
  Finished = "FINISHED",
  Postponed = "POSTPONED",
  Cancelled = "CANCELLED",
  Abandoned = "ABANDONED",
  Awarded = "AWARDED",
  Unknown = "UNKNOWN",
}

export enum FinishType {
  RegulationTime = "REGULATION_TIME",
  ExtraTime = "EXTRA_TIME",
  Penalties = "PENALTIES",
}
