package pl.lmuml.football.apifootball;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

import pl.lmuml.football.apifootball.dto.ApiFootballFixturePlayers;
import pl.lmuml.football.apifootball.dto.ApiFootballFixturePlayers.PlayerSlot;
import pl.lmuml.football.matches.MatchLineupPosition;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static pl.lmuml.football.apifootball.ApiFootballFixturePlayerData.cleanText;
import static pl.lmuml.football.apifootball.ApiFootballFixturePlayerData.position;

record ApiFootballFixturePlayersSample(long fixtureId, Instant capturedAt, List<TeamPlayers> teams) {

    private static final TypeReference<List<ApiFootballFixturePlayers>> TEAMS = new TypeReference<>() {};
    private static final Pattern DECIMAL_RATING = Pattern.compile("[0-9]{1,2}(?:\\.[0-9]+)?");

    ApiFootballFixturePlayersSample {
        capturedAt = Objects.requireNonNull(capturedAt).truncatedTo(ChronoUnit.MICROS);
        teams = List.copyOf(teams);
        if (fixtureId <= 0 || teams.size() != 2 || teams.get(0).teamId() == teams.get(1).teamId()) {
            throw new IllegalArgumentException("Expected player statistics for two distinct fixture teams.");
        }
    }

    static ApiFootballFixturePlayersSample decode(long fixtureId, Instant capturedAt, JsonNode payload, JsonMapper json) {
        var response = ApiFootballFixturePayload.response(fixtureId, ApiFootballClient.FIXTURE_PLAYERS_ENDPOINT,
                "fixture", payload);
        return decodeSection(fixtureId, capturedAt, response, json);
    }

    static ApiFootballFixturePlayersSample decodeSection(long fixtureId, Instant capturedAt, JsonNode items,
            JsonMapper json) {
        var teams = ApiFootballFixturePayload.decodeArray(items, json, TEAMS).stream()
                .map(ApiFootballFixturePlayersSample::decodeTeam).toList();
        return new ApiFootballFixturePlayersSample(fixtureId, capturedAt, teams);
    }

    private static TeamPlayers decodeTeam(ApiFootballFixturePlayers source) {
        if (source == null || source.team() == null || source.team().id() == null || source.players() == null) {
            throw new IllegalArgumentException("Fixture player statistics require a team ID and an ordered player list.");
        }
        return new TeamPlayers(source.team().id(),
                source.players().stream().map(ApiFootballFixturePlayersSample::decodePlayer).toList());
    }

    private static Player decodePlayer(PlayerSlot slot) {
        if (slot == null || slot.player() == null || slot.player().id() == null
                || slot.statistics() == null || slot.statistics().size() != 1 || slot.statistics().getFirst() == null) {
            throw new IllegalArgumentException("Each fixture player needs an ID and one statistics record.");
        }
        var metrics = slot.statistics().getFirst();
        var games = metrics.games();
        var shots = metrics.shots();
        var goals = metrics.goals();
        var passes = metrics.passes();
        var tackles = metrics.tackles();
        var statistics = new Statistics(games == null ? null : games.minutes(), games == null ? null : rating(games.rating()),
                goals == null ? null : goals.total(), goals == null ? null : goals.assists(),
                shots == null ? null : shots.total(), shots == null ? null : shots.on(),
                passes == null ? null : passes.total(), passes == null ? null : passes.key(),
                tackles == null ? null : tackles.total(), goals == null ? null : goals.saves());
        return new Player(slot.player().id(), cleanText(slot.player().name()), games == null ? null : games.number(),
                position(games == null ? null : games.position()), statistics);
    }

    private static BigDecimal rating(JsonNode value) {
        if (value == null || value.isNull()) return null;
        if (value.isNumber()) return value.decimalValue();
        if (value.isString() && DECIMAL_RATING.matcher(value.asString()).matches()) {
            return new BigDecimal(value.asString());
        }
        throw new IllegalArgumentException("Expected a decimal fixture player rating.");
    }

    private static void validateCounts(Integer... counts) {
        for (Integer count : counts) {
            if (count != null && count < 0) throw new IllegalArgumentException("Expected a non-negative player count.");
        }
    }

    record TeamPlayers(long teamId, List<Player> players) {
        TeamPlayers {
            players = List.copyOf(players);
            if (teamId <= 0 || players.stream().noneMatch(player -> player.statistics().measured())) {
                throw new IllegalArgumentException("Each fixture team needs at least one measured player.");
            }
            if (players.stream().map(Player::id).distinct().count() != players.size()) {
                throw new IllegalArgumentException("Duplicate player ID in fixture team.");
            }
        }
    }

    record Player(long id, String name, Integer number, MatchLineupPosition position, Statistics statistics) {
        Player {
            if (id <= 0 || name == null || name.isBlank()) {
                throw new IllegalArgumentException("Expected a positive ID and name for each fixture player.");
            }
            validateCounts(number);
            Objects.requireNonNull(position);
            Objects.requireNonNull(statistics);
        }
    }

    record Statistics(Integer minutes, BigDecimal rating, Integer goals, Integer assists, Integer shotsTotal,
                      Integer shotsOnTarget, Integer passesTotal, Integer keyPasses, Integer tackles, Integer saves) {
        Statistics {
            validateCounts(minutes, goals, assists, shotsTotal, shotsOnTarget, passesTotal, keyPasses, tackles, saves);
            if (rating != null) {
                if (rating.signum() < 0 || rating.compareTo(BigDecimal.TEN) > 0 || rating.stripTrailingZeros().scale() > 2) {
                    throw new IllegalArgumentException("Fixture player rating is outside its range or precision.");
                }
                rating = rating.setScale(2, RoundingMode.UNNECESSARY);
            }
        }

        boolean measured() {
            return minutes != null || rating != null || goals != null || assists != null || shotsTotal != null
                    || shotsOnTarget != null || passesTotal != null || keyPasses != null || tackles != null || saves != null;
        }
    }
}
