package pl.lmuml.football.apifootball;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.Objects;
import java.util.regex.Pattern;

import pl.lmuml.football.apifootball.dto.ApiFootballLineup;
import pl.lmuml.football.apifootball.dto.ApiFootballLineup.PlayerSlot;
import pl.lmuml.football.matches.MatchLineupPosition;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static pl.lmuml.football.apifootball.ApiFootballFixturePlayerData.cleanText;
import static pl.lmuml.football.apifootball.ApiFootballFixturePlayerData.position;
import static pl.lmuml.football.apifootball.ApiFootballFixturePlayerData.positivePlayerId;

record ApiFootballFixtureLineupsSample(long fixtureId, Instant capturedAt, List<TeamLineup> teams) {

    private static final TypeReference<List<ApiFootballLineup>> LINEUPS = new TypeReference<>() {};
    private static final Pattern GRID = Pattern.compile("([1-9][0-9]{0,8}):([1-9][0-9]{0,8})");

    ApiFootballFixtureLineupsSample {
        if (fixtureId <= 0) throw new IllegalArgumentException("A positive fixture ID is required.");
        capturedAt = Objects.requireNonNull(capturedAt).truncatedTo(ChronoUnit.MICROS);
        teams = List.copyOf(teams);
        if (teams.size() != 2 || teams.get(0).teamId() == teams.get(1).teamId()) {
            throw new IllegalArgumentException("Expected lineups for two distinct fixture teams.");
        }
    }

    static ApiFootballFixtureLineupsSample decode(long fixtureId, Instant capturedAt, JsonNode payload, JsonMapper json) {
        var response = ApiFootballFixturePayload.response(fixtureId, ApiFootballClient.FIXTURE_LINEUPS_ENDPOINT,
                "fixture", payload);
        return decodeSection(fixtureId, capturedAt, response, json);
    }

    static ApiFootballFixtureLineupsSample decodeSection(long fixtureId, Instant capturedAt, JsonNode items,
            JsonMapper json) {
        var teams = ApiFootballFixturePayload.decodeArray(items, json, LINEUPS).stream()
                .map(ApiFootballFixtureLineupsSample::decodeTeam).toList();
        return new ApiFootballFixtureLineupsSample(fixtureId, capturedAt, teams);
    }

    private static TeamLineup decodeTeam(ApiFootballLineup lineup) {
        if (lineup == null || lineup.team() == null || lineup.team().id() == null) {
            throw new IllegalArgumentException("Fixture lineups require a team ID.");
        }
        String coachName = lineup.coach() == null ? null : cleanText(lineup.coach().name());
        return new TeamLineup(lineup.team().id(), cleanText(lineup.formation()), coachName,
                decodePlayers(lineup.startXi()), decodePlayers(lineup.substitutes()));
    }

    private static List<Player> decodePlayers(List<PlayerSlot> slots) {
        if (slots == null) return List.of();
        return slots.stream().map(ApiFootballFixtureLineupsSample::decodePlayer)
                .filter(Objects::nonNull)
                .toList();
    }

    private static Player decodePlayer(PlayerSlot slot) {
        if (slot == null || slot.player() == null) return null;
        var player = slot.player();
        String name = cleanText(player.name());
        if (name == null) return null;

        var grid = GRID.matcher(player.grid() == null ? "" : player.grid().strip());
        boolean hasGrid = grid.matches();
        return new Player(name, player.number(), position(player.pos()),
                hasGrid ? Integer.valueOf(grid.group(1)) : null,
                hasGrid ? Integer.valueOf(grid.group(2)) : null, player.id());
    }

    record TeamLineup(long teamId, String formation, String coachName, List<Player> starters,
                      List<Player> substitutes) {
        TeamLineup {
            starters = List.copyOf(starters);
            substitutes = List.copyOf(substitutes);
            if (teamId <= 0 || starters.isEmpty()) {
                throw new IllegalArgumentException("Each fixture lineup needs a positive team ID and a named starter.");
            }
        }
    }

    record Player(String name, Integer number, MatchLineupPosition position, Integer gridRow, Integer gridColumn,
                  Long providerPlayerId) {
        Player {
            if (name == null || name.isBlank() || (number != null && number < 0)
                    || (gridRow == null) != (gridColumn == null)
                    || (gridRow != null && (gridRow < 1 || gridColumn < 1))) {
                throw new IllegalArgumentException("Invalid lineup player details.");
            }
            Objects.requireNonNull(position);
            providerPlayerId = positivePlayerId(providerPlayerId);
        }

        boolean matchesForReplay(Player incoming) {
            Long id = providerPlayerId == null ? incoming.providerPlayerId : providerPlayerId;
            return incoming.equals(new Player(name, number, position, gridRow, gridColumn, id));
        }
    }
}
