export const DEFAULT_SEASON_CODE = "api-football-2-2024";

export function readRequestedSeasonCode(): string | null {
  return new URLSearchParams(window.location.search).get("season") || null;
}

export function readSeasonCode(): string {
  return readRequestedSeasonCode() ?? DEFAULT_SEASON_CODE;
}
