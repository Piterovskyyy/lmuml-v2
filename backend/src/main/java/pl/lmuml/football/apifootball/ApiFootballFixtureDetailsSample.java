package pl.lmuml.football.apifootball;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

record ApiFootballFixtureDetailsSample(long fixtureId, long homeTeamId, long awayTeamId,
        Optional<ApiFootballFixtureEventsSample> events, Optional<ApiFootballFixtureLineupsSample> lineups,
        Optional<ApiFootballFixtureStatisticsSample> statistics, Optional<ApiFootballFixturePlayersSample> players) {

    ApiFootballFixtureDetailsSample {
        if (fixtureId <= 0 || homeTeamId <= 0 || awayTeamId <= 0 || homeTeamId == awayTeamId) {
            throw new IllegalArgumentException("A fixture and two distinct positive team IDs are required.");
        }
        events.ifPresent(sample -> {
            requireFixture(fixtureId, sample.fixtureId());
            for (var event : sample.events()) {
                if (event.providerTeamId() != null) {
                    requireTeam(homeTeamId, awayTeamId, event.providerTeamId());
                }
            }
        });
        lineups.ifPresent(sample -> {
            requireFixture(fixtureId, sample.fixtureId());
            sample.teams().forEach(team -> requireTeam(homeTeamId, awayTeamId, team.teamId()));
        });
        statistics.ifPresent(sample -> {
            requireFixture(fixtureId, sample.fixtureId());
            sample.teams().forEach(team -> requireTeam(homeTeamId, awayTeamId, team.teamId()));
        });
        players.ifPresent(sample -> {
            requireFixture(fixtureId, sample.fixtureId());
            sample.teams().forEach(team -> requireTeam(homeTeamId, awayTeamId, team.teamId()));
        });
    }

    static ApiFootballFixtureDetailsSample decode(long fixtureId, Instant capturedAt, JsonNode payload,
            JsonMapper json) {
        var response = ApiFootballFixturePayload.response(fixtureId, ApiFootballClient.FIXTURES_ENDPOINT,
                "id", payload);
        if (response.size() != 1 || !response.get(0).isObject()) {
            throw new IllegalArgumentException("Expected exactly one fixture in the response.");
        }
        var fixture = response.get(0);
        requireFixture(fixtureId, positiveId(fixture.path("fixture").path("id")));
        return decodeFixture(fixtureId, capturedAt, fixture, json);
    }

    static List<ApiFootballFixtureDetailsSample> decodeBatch(List<Long> fixtureIds, Instant capturedAt,
            JsonNode payload, JsonMapper json) {
        JsonNode response = ApiFootballFixturePayload.batchResponse(fixtureIds, payload);
        var remainingIds = new HashSet<>(fixtureIds);
        var samples = new ArrayList<ApiFootballFixtureDetailsSample>(fixtureIds.size());
        for (var fixture : response) {
            long fixtureId = positiveId(fixture.path("fixture").path("id"));
            if (!remainingIds.remove(fixtureId)) {
                throw new IllegalArgumentException("Fixture details include an unexpected or duplicate fixture ID.");
            }
            samples.add(decodeFixture(fixtureId, capturedAt, fixture, json));
        }
        return List.copyOf(samples);
    }

    private static ApiFootballFixtureDetailsSample decodeFixture(long fixtureId, Instant capturedAt,
            JsonNode fixture, JsonMapper json) {
        var teams = fixture.path("teams");
        long homeTeamId = positiveId(teams.path("home").path("id"));
        long awayTeamId = positiveId(teams.path("away").path("id"));
        return new ApiFootballFixtureDetailsSample(fixtureId, homeTeamId, awayTeamId,
                decodeSection(fixture.path("events"), items ->
                        ApiFootballFixtureEventsSample.decodeSection(fixtureId, capturedAt, items, json)),
                decodeSection(fixture.path("lineups"), items ->
                        ApiFootballFixtureLineupsSample.decodeSection(fixtureId, capturedAt, items, json)),
                decodeSection(fixture.path("statistics"), items ->
                        ApiFootballFixtureStatisticsSample.decodeSection(fixtureId, capturedAt, items, json)),
                decodeSection(fixture.path("players"), items ->
                        ApiFootballFixturePlayersSample.decodeSection(fixtureId, capturedAt, items, json)));
    }

    private static <T> Optional<T> decodeSection(JsonNode section, Function<JsonNode, T> decoder) {
        if (section.isMissingNode() || section.isNull()) return Optional.empty();
        if (!section.isArray()) throw new IllegalArgumentException("Expected a fixture detail array.");
        return section.isEmpty() ? Optional.empty() : Optional.of(decoder.apply(section));
    }

    private static long positiveId(JsonNode value) {
        if (!value.isIntegralNumber() || !value.canConvertToLong() || value.asLong() <= 0) {
            throw new IllegalArgumentException("Expected a positive fixture or team ID.");
        }
        return value.asLong();
    }

    private static void requireFixture(long expected, long actual) {
        if (expected != actual) throw new IllegalArgumentException("Fixture details have a different fixture ID.");
    }

    private static void requireTeam(long homeTeamId, long awayTeamId, long teamId) {
        if (teamId != homeTeamId && teamId != awayTeamId) {
            throw new IllegalArgumentException("Fixture details contain a team outside the requested fixture.");
        }
    }
}
