package pl.lmuml.football.apifootball;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.List;

import pl.lmuml.football.apifootball.dto.ApiFootballEnvelope.Paging;
import tools.jackson.databind.json.JsonMapper;

import static java.nio.file.StandardOpenOption.CREATE_NEW;

final class ApiFootballProbe {

    @FunctionalInterface
    interface Pause { void await() throws InterruptedException; }

    private final ApiFootballClient client;
    private final JsonMapper json;
    private final Path samplesRoot;
    private final Pause pause;

    ApiFootballProbe(ApiFootballClient client, JsonMapper json, Path samplesRoot, Pause pause) {
        this.client = client;
        this.json = json;
        this.samplesRoot = samplesRoot;
        this.pause = pause;
    }

    Path capture(long leagueId, int season) throws IOException, InterruptedException {
        Path directory = prepareDirectory(leagueId, season);

        ApiFootballPayload leaguePayload = client.fetchLeagues(leagueId, season);
        save(directory, "leagues", leaguePayload, leagueId, season);
        var leagues = client.decodeLeagues(leaguePayload);
        boolean seasonFound = leagues.items().stream().anyMatch(item -> item.league() != null
                && Long.valueOf(leagueId).equals(item.league().id()) && item.seasons() != null
                && item.seasons().stream().anyMatch(value -> value != null && Integer.valueOf(season).equals(value.year())));
        if (!seasonFound) {
            throw new IllegalStateException("Requested league/season is absent. League sample saved; fixtures were not requested.");
        }
        if (leagues.paging().current() != 1 || leagues.paging().total() != 1) {
            throw new IllegalStateException("League metadata is incomplete. No additional pages or fixtures were requested.");
        }
        ApiFootballResponse.Quota quota = leagues.quota();
        if (Integer.valueOf(0).equals(quota.dailyRemaining()) || Integer.valueOf(0).equals(quota.minuteRemaining())) {
            throw new IllegalStateException("Reported API quota exhausted. League sample saved; fixtures were not requested.");
        }
        try {
            pause.await();
        } catch (InterruptedException interrupted) {
            Thread.currentThread().interrupt();
            throw interrupted;
        }

        ApiFootballPayload fixturePayload = client.fetchFixtures(leagueId, season);
        save(directory, "fixtures", fixturePayload, leagueId, season);
        var fixtures = client.decodeFixtures(fixturePayload);
        if (fixtures.items().stream().anyMatch(item -> item.league() == null
                || !Long.valueOf(leagueId).equals(item.league().id())
                || !Integer.valueOf(season).equals(item.league().season()))) {
            throw new IllegalStateException("Fixture sample contains a different or missing league/season. Raw samples were saved.");
        }
        if (fixtures.paging().current() != 1 || fixtures.paging().total() != 1) {
            throw new IllegalStateException("Fixture sample is incomplete. No additional pages were requested.");
        }
        Files.write(directory.resolve("summary.json"), json.writerWithDefaultPrettyPrinter().writeValueAsBytes(
                new Summary(leagueId, season, leagues.items().size(), fixtures.items().size())), CREATE_NEW);
        System.out.println("Saved and decoded API-Football samples. Fixture count: " + fixtures.items().size());
        return directory;
    }

    Path captureStandings(long leagueId, int season) throws IOException {
        Path directory = prepareDirectory(leagueId, season);
        ApiFootballPayload payload = client.fetchStandings(leagueId, season);
        save(directory, "standings", payload, leagueId, season);
        var response = client.decodeStandings(payload);
        if (response.paging().current() != 1 || response.paging().total() != 1
                || response.items().size() != 1) {
            throw new IllegalStateException("Standings sample is empty or incomplete. The raw sample was saved.");
        }
        var league = response.items().getFirst().league();
        if (league == null || !Long.valueOf(leagueId).equals(league.id())
                || !Integer.valueOf(season).equals(league.season())
                || league.standings() == null || league.standings().isEmpty()) {
            throw new IllegalStateException("Standings sample has no table for the requested league/season. The raw sample was saved.");
        }
        System.out.println("Saved and decoded API-Football standings. Table count: " + league.standings().size());
        return directory;
    }

    Path captureFixtureStatistics(long fixtureId) throws IOException {
        Path directory = prepareFixtureDirectory(fixtureId);
        ApiFootballPayload payload = client.fetchFixtureStatistics(fixtureId);
        saveFixture(directory, "statistics", payload, fixtureId);
        new ApiFootballSampleReader(json).readFixtureStatistics(directory);
        System.out.println("Saved and decoded API-Football statistics for fixture " + fixtureId + ".");
        return directory;
    }

    Path captureFixtureEvents(long fixtureId) throws IOException {
        Path directory = prepareFixtureDirectory(fixtureId);
        ApiFootballPayload payload = client.fetchFixtureEvents(fixtureId);
        saveFixture(directory, "events", payload, fixtureId);
        var sample = new ApiFootballSampleReader(json).readFixtureEvents(directory);
        System.out.printf("Saved and decoded %d API-Football events for fixture %d.%n",
                sample.events().size(), fixtureId);
        return directory;
    }

    Path captureFixtureLineups(long fixtureId) throws IOException {
        Path directory = prepareFixtureDirectory(fixtureId);
        ApiFootballPayload payload = client.fetchFixtureLineups(fixtureId);
        saveFixture(directory, "lineups", payload, fixtureId);
        new ApiFootballSampleReader(json).readFixtureLineups(directory);
        System.out.printf("Saved and decoded API-Football lineups for fixture %d.%n", fixtureId);
        return directory;
    }

    Path captureFixturePlayers(long fixtureId) throws IOException {
        Path directory = prepareFixtureDirectory(fixtureId);
        ApiFootballPayload payload = client.fetchFixturePlayers(fixtureId);
        saveFixture(directory, "players", payload, fixtureId);
        new ApiFootballSampleReader(json).readFixturePlayers(directory);
        System.out.printf("Saved and decoded API-Football player statistics for fixture %d.%n", fixtureId);
        return directory;
    }

    Path captureFixtureDetails(long fixtureId) throws IOException {
        Path directory = prepareFixtureDirectory(fixtureId);
        ApiFootballPayload payload = client.fetchFixtureDetails(fixtureId);
        saveFixture(directory, "details", payload, fixtureId);
        new ApiFootballSampleReader(json).readFixtureDetails(directory);
        System.out.printf("Saved and decoded API-Football details for fixture %d.%n", fixtureId);
        return directory;
    }

    Path captureFixtureDetails(List<Long> fixtureIds) throws IOException {
        ApiFootballPayload payload = client.fetchFixtureDetails(fixtureIds);
        Path directory = prepareDirectory();
        Files.write(directory.resolve("details.json"), payload.json(), CREATE_NEW);
        var metadata = new FixtureBatchMetadata(Instant.now(), fixtureIds, payload.envelope().results(),
                payload.envelope().paging(), payload.quota());
        Files.write(directory.resolve("details.metadata.json"),
                json.writerWithDefaultPrettyPrinter().writeValueAsBytes(metadata), CREATE_NEW);
        var details = new ApiFootballSampleReader(json).readFixtureDetailsBatch(directory);
        System.out.printf("Saved and decoded API-Football details for %d fixtures.%n", details.size());
        return directory;
    }

    private Path prepareFixtureDirectory(long fixtureId) throws IOException {
        if (fixtureId <= 0) {
            throw new IllegalArgumentException("A positive fixture ID is required.");
        }
        return prepareDirectory();
    }

    private Path prepareDirectory(long leagueId, int season) throws IOException {
        if (leagueId <= 0 || season < 1000 || season > 9999) {
            throw new IllegalArgumentException("A positive league ID and a four-digit season are required.");
        }
        return prepareDirectory();
    }

    private Path prepareDirectory() throws IOException {
        Files.createDirectories(samplesRoot);
        Path directory = Files.createTempDirectory(samplesRoot, "sample-");
        System.out.println("API-Football sample directory: " + directory.toAbsolutePath());
        return directory;
    }

    private void save(Path directory, String endpoint, ApiFootballPayload payload,
                      long leagueId, int season) throws IOException {
        // Original successful-envelope bytes survive even if subsequent DTO decoding fails.
        Files.write(directory.resolve(endpoint + ".json"), payload.json(), CREATE_NEW);
        var metadata = new Metadata(Instant.now(), leagueId, season, payload.envelope().results(),
                payload.envelope().paging(), payload.quota());
        Files.write(directory.resolve(endpoint + ".metadata.json"),
                json.writerWithDefaultPrettyPrinter().writeValueAsBytes(metadata), CREATE_NEW);
    }

    private void saveFixture(Path directory, String name, ApiFootballPayload payload, long fixtureId)
            throws IOException {
        Files.write(directory.resolve(name + ".json"), payload.json(), CREATE_NEW);
        var metadata = new FixtureMetadata(Instant.now(), fixtureId, payload.envelope().results(),
                payload.envelope().paging(), payload.quota());
        Files.write(directory.resolve(name + ".metadata.json"),
                json.writerWithDefaultPrettyPrinter().writeValueAsBytes(metadata), CREATE_NEW);
    }

    private record Metadata(Instant capturedAt, long leagueId, int season, int results,
                            Paging paging, ApiFootballResponse.Quota quota) {}

    private record FixtureMetadata(Instant capturedAt, long fixtureId, int results, Paging paging,
                                   ApiFootballResponse.Quota quota) {}

    private record FixtureBatchMetadata(Instant capturedAt, List<Long> fixtureIds, int results, Paging paging,
                                        ApiFootballResponse.Quota quota) {}

    private record Summary(long leagueId, int season, int decodedLeagues, int decodedFixtures) {}
}
