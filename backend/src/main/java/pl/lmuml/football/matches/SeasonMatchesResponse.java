package pl.lmuml.football.matches;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

record SeasonMatchesResponse(Season season, Competition competition, List<MatchItem> matches,
        Instant fixturesCapturedAt, Standings standings) {

    SeasonMatchesResponse {
        matches = List.copyOf(matches);
    }

    record Season(UUID id, String code, String name, int startYear) {}

    record Competition(UUID id, String code, String name, String logoUrl) {}

    record MatchItem(UUID id, String tournamentRound, Instant kickoffAt, MatchStatus status,
            Team homeTeam, Team awayTeam, Scores scores, Boolean homeWinner, Boolean awayWinner) {}

    record Team(UUID id, String name, String logoUrl) {}

    record Scores(Score total, Score halfTime, Score regulationTime, Score extraTime, Score penalties) {}

    record Score(Integer home, Integer away) {}

    record Standings(Instant capturedAt, List<StandingRow> rows) {
        Standings {
            rows = List.copyOf(rows);
        }
    }

    record StandingRow(int position, Team team, int played, int won, int drawn, int lost,
            int goalsFor, int goalsAgainst, int goalDifference, int points, String form) {}
}
