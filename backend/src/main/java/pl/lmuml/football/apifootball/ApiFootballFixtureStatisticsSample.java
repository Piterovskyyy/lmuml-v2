package pl.lmuml.football.apifootball;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.EnumMap;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

import pl.lmuml.football.apifootball.dto.ApiFootballStatistics;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

record ApiFootballFixtureStatisticsSample(long fixtureId, Instant capturedAt, List<TeamStatistics> teams) {

    private static final TypeReference<List<ApiFootballStatistics>> TEAMS = new TypeReference<>() {};
    private static final Pattern PERCENTAGE = Pattern.compile("[0-9]{1,3}(?:\\.[0-9]{1,2})?%");

    ApiFootballFixtureStatisticsSample {
        // PostgreSQL stores timestamps with microsecond precision.
        capturedAt = Objects.requireNonNull(capturedAt).truncatedTo(ChronoUnit.MICROS);
        teams = List.copyOf(teams);
        if (fixtureId <= 0 || teams.size() != 2 || teams.get(0).teamId() == teams.get(1).teamId()
                || !teams.get(0).statistics().comparableWith(teams.get(1).statistics())) {
            throw new IllegalArgumentException("Expected two distinct fixture teams with comparable statistics.");
        }
    }

    static ApiFootballFixtureStatisticsSample decode(long fixtureId, Instant capturedAt, JsonNode payload,
            JsonMapper json) {
        var response = ApiFootballFixturePayload.response(fixtureId, ApiFootballClient.FIXTURE_STATISTICS_ENDPOINT,
                "fixture", payload);
        return decodeSection(fixtureId, capturedAt, response, json);
    }

    static ApiFootballFixtureStatisticsSample decodeSection(long fixtureId, Instant capturedAt, JsonNode items,
            JsonMapper json) {
        var teams = ApiFootballFixturePayload.decodeArray(items, json, TEAMS).stream()
                .map(ApiFootballFixtureStatisticsSample::decodeTeam)
                .toList();
        return new ApiFootballFixtureStatisticsSample(fixtureId, capturedAt, teams);
    }

    private static TeamStatistics decodeTeam(ApiFootballStatistics item) {
        if (item == null || item.team() == null || item.team().id() == null || item.team().id() <= 0
                || item.statistics() == null) {
            throw new IllegalArgumentException("Fixture statistics require a team ID and a list of metrics.");
        }
        var known = new EnumMap<Metric, JsonNode>(Metric.class);
        for (var entry : item.statistics()) {
            if (entry == null || entry.type() == null || entry.type().isBlank()) {
                throw new IllegalArgumentException("Invalid fixture statistics metric.");
            }
            var metric = Metric.fromProviderName(entry.type());
            if (metric != null) {
                if (known.containsKey(metric)) {
                    throw new IllegalArgumentException("Duplicate fixture statistics metric.");
                }
                known.put(metric, entry.value());
            }
        }
        return new TeamStatistics(item.team().id(), new Statistics(
                count(known.get(Metric.SHOTS_TOTAL)),
                count(known.get(Metric.SHOTS_ON_TARGET)),
                percentage(known.get(Metric.POSSESSION)),
                count(known.get(Metric.CORNERS)),
                count(known.get(Metric.FOULS)),
                count(known.get(Metric.SAVES))));
    }

    private static Integer count(JsonNode value) {
        if (value == null || value.isNull()) return null;
        if (!value.isIntegralNumber() || !value.canConvertToInt() || value.asInt() < 0) {
            throw new IllegalArgumentException("Expected a non-negative metric count.");
        }
        return value.asInt();
    }

    private static BigDecimal percentage(JsonNode value) {
        if (value == null || value.isNull()) return null;
        BigDecimal percent;
        if (value.isNumber()) {
            percent = value.decimalValue();
        } else if (value.isString() && PERCENTAGE.matcher(value.asString()).matches()) {
            String text = value.asString();
            percent = new BigDecimal(text.substring(0, text.length() - 1));
        } else {
            throw new IllegalArgumentException("Expected a ball possession percentage.");
        }
        if (percent.signum() < 0 || percent.compareTo(BigDecimal.valueOf(100)) > 0
                || percent.stripTrailingZeros().scale() > 2) {
            throw new IllegalArgumentException("Ball possession percentage is outside its range or precision.");
        }
        return percent.setScale(2, RoundingMode.UNNECESSARY);
    }

    private enum Metric {
        SHOTS_TOTAL, SHOTS_ON_TARGET, POSSESSION, CORNERS, FOULS, SAVES;

        static Metric fromProviderName(String name) {
            return switch (name) {
                case "Total Shots" -> SHOTS_TOTAL;
                case "Shots on Goal" -> SHOTS_ON_TARGET;
                case "Ball Possession" -> POSSESSION;
                case "Corner Kicks" -> CORNERS;
                case "Fouls" -> FOULS;
                case "Goalkeeper Saves" -> SAVES;
                default -> null;
            };
        }
    }

    record TeamStatistics(long teamId, Statistics statistics) {}

    record Statistics(Integer shotsTotal, Integer shotsOnTarget, BigDecimal possessionPercent, Integer corners,
                      Integer fouls, Integer saves) {
        boolean comparableWith(Statistics other) {
            return presentOnBoth(shotsTotal, other.shotsTotal)
                    || presentOnBoth(shotsOnTarget, other.shotsOnTarget)
                    || presentOnBoth(possessionPercent, other.possessionPercent)
                    || presentOnBoth(corners, other.corners)
                    || presentOnBoth(fouls, other.fouls)
                    || presentOnBoth(saves, other.saves);
        }

        private static boolean presentOnBoth(Number home, Number away) {
            return home != null && away != null;
        }
    }
}
