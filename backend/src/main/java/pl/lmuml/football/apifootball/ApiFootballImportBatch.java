package pl.lmuml.football.apifootball;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;

import tools.jackson.databind.JsonNode;

record ApiFootballImportBatch(Competition competition, Season season, List<Team> teams, List<Match> matches,
                              ApiFootballSnapshot leagueSnapshot, ApiFootballSnapshot fixtureSnapshot) {

    ApiFootballImportBatch {
        teams = List.copyOf(teams);
        matches = List.copyOf(matches);
    }

    record Competition(long providerId, String name, String type, String logoUrl,
                       String countryName, String countryCode, String countryFlagUrl) {}

    record Season(int year, LocalDate startsOn, LocalDate endsOn, Boolean providerCurrent, JsonNode coverage) {
        Season {
            coverage = coverage == null || coverage.isNull() ? null : coverage.deepCopy();
        }

        @Override
        public JsonNode coverage() {
            return coverage == null ? null : coverage.deepCopy();
        }
    }

    record Team(long providerId, String name, String logoUrl) {}

    record Goals(Integer home, Integer away) {}

    record Match(long providerId, long homeTeamId, long awayTeamId, Instant kickoffAt,
                 String providerStatus, String apiRound, String referee, Long venueId,
                 String venueName, String venueCity, Integer elapsedMinutes, Integer extraMinutes,
                 Boolean homeWinner, Boolean awayWinner, Goals goals, Goals halftime,
                 Goals fulltime, Goals extratime, Goals penalty) {}
}
