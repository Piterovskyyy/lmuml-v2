package pl.lmuml.football.apifootball;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;

import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

final class ApiFootballSampleReader {

    private static final String INVALID_DETAILS_SAMPLE =
            "Fixture details sample JSON/metadata files are missing, incomplete or invalid.";

    private final JsonMapper json;

    ApiFootballSampleReader(JsonMapper json) {
        this.json = json.rebuild().enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS).build();
    }

    Samples read(Path directory) {
        try {
            var leagues = read(directory, ApiFootballSnapshot.Endpoint.LEAGUES);
            var fixtures = read(directory, ApiFootballSnapshot.Endpoint.FIXTURES);
            return new Samples(leagues, fixtures);
        } catch (IOException | RuntimeException invalid) {
            // Parser messages may repeat input data. Keep command output independent of file contents.
            throw new IllegalArgumentException("Sample JSON/metadata files are missing, incomplete or invalid.");
        }
    }

    ApiFootballSnapshot readStandings(Path directory) {
        try {
            return read(directory, ApiFootballSnapshot.Endpoint.STANDINGS);
        } catch (IOException | RuntimeException invalid) {
            throw new IllegalArgumentException("Standings sample JSON/metadata files are missing, incomplete or invalid.");
        }
    }

    ApiFootballFixtureStatisticsSample readFixtureStatistics(Path directory) {
        try {
            var sample = readFixture(directory, "statistics");
            return ApiFootballFixtureStatisticsSample.decode(sample.fixtureId(), sample.capturedAt(),
                    sample.payload(), json);
        } catch (IOException | RuntimeException invalid) {
            throw new IllegalArgumentException("Fixture statistics sample JSON/metadata files are missing, incomplete or invalid.");
        }
    }

    ApiFootballFixtureEventsSample readFixtureEvents(Path directory) {
        try {
            var sample = readFixture(directory, "events");
            return ApiFootballFixtureEventsSample.decode(sample.fixtureId(), sample.capturedAt(), sample.payload(), json);
        } catch (IOException | RuntimeException invalid) {
            throw new IllegalArgumentException("Fixture events sample JSON/metadata files are missing, incomplete or invalid.");
        }
    }

    ApiFootballFixtureLineupsSample readFixtureLineups(Path directory) {
        try {
            var sample = readFixture(directory, "lineups");
            return ApiFootballFixtureLineupsSample.decode(sample.fixtureId(), sample.capturedAt(), sample.payload(), json);
        } catch (IOException | RuntimeException invalid) {
            throw new IllegalArgumentException("Fixture lineups sample JSON/metadata files are missing, incomplete or invalid.");
        }
    }

    ApiFootballFixturePlayersSample readFixturePlayers(Path directory) {
        try {
            var sample = readFixture(directory, "players");
            return ApiFootballFixturePlayersSample.decode(sample.fixtureId(), sample.capturedAt(), sample.payload(), json);
        } catch (IOException | RuntimeException invalid) {
            throw new IllegalArgumentException("Fixture player sample JSON/metadata files are missing, incomplete or invalid.");
        }
    }

    ApiFootballFixtureDetailsSample readFixtureDetails(Path directory) {
        var samples = readFixtureDetailsBatch(directory);
        if (samples.size() != 1) {
            throw new IllegalArgumentException(INVALID_DETAILS_SAMPLE);
        }
        return samples.getFirst();
    }

    List<ApiFootballFixtureDetailsSample> readFixtureDetailsBatch(Path directory) {
        try {
            var sample = readFixture(directory, "details");
            var ids = sample.metadata().get("fixtureIds");
            if (ids == null) {
                return List.of(ApiFootballFixtureDetailsSample.decode(
                        sample.fixtureId(), sample.capturedAt(), sample.payload(), json));
            }
            if (!ids.isArray() || sample.metadata().has("fixtureId")) {
                throw new IllegalArgumentException(INVALID_DETAILS_SAMPLE);
            }
            var fixtureIds = new ArrayList<Long>();
            for (var id : ids) {
                if (!integer(id)) {
                    throw new IllegalArgumentException(INVALID_DETAILS_SAMPLE);
                }
                fixtureIds.add(id.asLong());
            }
            return ApiFootballFixtureDetailsSample.decodeBatch(fixtureIds, sample.capturedAt(), sample.payload(), json);
        } catch (IOException | RuntimeException invalid) {
            throw new IllegalArgumentException(INVALID_DETAILS_SAMPLE);
        }
    }

    private FixtureSample readFixture(Path directory, String name) throws IOException {
        JsonNode metadata = json.readTree(bytes(directory.resolve(name + ".metadata.json"), 64 * 1024));
        JsonNode payload = json.readTree(bytes(directory.resolve(name + ".json"), ApiFootballClient.MAX_RESPONSE_BYTES));
        if (metadata == null || !metadata.isObject() || payload == null || !integer(metadata.get("results"))
                || !metadata.get("results").equals(payload.get("results"))
                || metadata.get("capturedAt") == null || !metadata.get("capturedAt").isString()
                || metadata.get("paging") == null || !metadata.get("paging").equals(payload.get("paging"))) {
            throw new IllegalArgumentException("Sample metadata does not match its payload.");
        }
        return new FixtureSample(metadata,
                Instant.parse(metadata.get("capturedAt").asString()), payload);
    }

    private ApiFootballSnapshot read(Path directory, ApiFootballSnapshot.Endpoint endpoint) throws IOException {
        String name = endpoint.path();
        JsonNode metadata = json.readTree(bytes(directory.resolve(name + ".metadata.json"), 64 * 1024));
        JsonNode payload = json.readTree(bytes(directory.resolve(name + ".json"), ApiFootballClient.MAX_RESPONSE_BYTES));
        if (metadata == null || !metadata.isObject() || !integer(metadata.get("leagueId"))
                || !integer(metadata.get("season")) || !integer(metadata.get("results"))
                || !metadata.get("results").equals(payload.get("results"))
                || metadata.get("capturedAt") == null || !metadata.get("capturedAt").isString()
                || metadata.get("paging") == null || !metadata.get("paging").equals(payload.get("paging"))) {
            throw new IllegalArgumentException("Sample metadata does not match its payload.");
        }
        long season = metadata.get("season").asLong();
        if (season < 1000 || season > 9999) throw new IllegalArgumentException("Invalid sample season.");
        return new ApiFootballSnapshot(endpoint, metadata.get("leagueId").asLong(), (int) season,
                Instant.parse(metadata.get("capturedAt").asString()), payload);
    }

    private static byte[] bytes(Path path, int maximum) throws IOException {
        if (!Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS) || Files.size(path) > maximum) {
            throw new IOException("Expected a bounded regular sample file.");
        }
        try (var input = Files.newInputStream(path)) {
            byte[] bytes = input.readNBytes(maximum + 1);
            if (bytes.length == 0 || bytes.length > maximum) throw new IOException("Invalid sample size.");
            return bytes;
        }
    }

    private static boolean integer(JsonNode value) {
        return value != null && value.isIntegralNumber() && value.canConvertToLong();
    }

    record Samples(ApiFootballSnapshot leagues, ApiFootballSnapshot fixtures) {}

    private record FixtureSample(JsonNode metadata, Instant capturedAt, JsonNode payload) {
        long fixtureId() {
            var id = metadata.get("fixtureId");
            if (!integer(id) || metadata.has("fixtureIds")) {
                throw new IllegalArgumentException("Invalid fixture metadata.");
            }
            return id.asLong();
        }
    }
}
