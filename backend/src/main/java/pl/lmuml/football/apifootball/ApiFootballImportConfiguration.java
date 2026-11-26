package pl.lmuml.football.apifootball;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import javax.sql.DataSource;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.transaction.PlatformTransactionManager;
import tools.jackson.databind.json.JsonMapper;

@Configuration(proxyBeanMethods = false)
@Profile("api-football-import & !migration")
class ApiFootballImportConfiguration {

    @Bean
    ApplicationRunner apiFootballImport(DataSource dataSource, PlatformTransactionManager transactions, JsonMapper json,
            @Value("${lmuml.api-football.import.directory}") String directory,
            @Value("${lmuml.api-football.import.standings:false}") boolean standings,
            @Value("${lmuml.api-football.import.fixture-events:false}") boolean fixtureEvents,
            @Value("${lmuml.api-football.import.fixture-lineups:false}") boolean fixtureLineups,
            @Value("${lmuml.api-football.import.fixture-players:false}") boolean fixturePlayers,
            @Value("${lmuml.api-football.import.fixture-details:false}") boolean fixtureDetails,
            @Value("${lmuml.api-football.import.fixture-statistics:false}") boolean fixtureStatistics,
            @Value("${lmuml.api-football.import.auto-details-at:}") String autoDetailsAt) {
        return arguments -> {
            try {
                int selectedModes = (standings ? 1 : 0) + (fixtureEvents ? 1 : 0)
                        + (fixtureLineups ? 1 : 0) + (fixturePlayers ? 1 : 0) + (fixtureStatistics ? 1 : 0)
                        + (fixtureDetails ? 1 : 0);
                if (selectedModes > 1) {
                    throw new IllegalArgumentException("Select only one API-Football import mode.");
                }
                if (selectedModes != 0 && !autoDetailsAt.isEmpty()) {
                    throw new IllegalArgumentException("Automatic details can only follow a catalog import.");
                }
                var attemptAt = autoDetailsAt.isEmpty() ? null : Instant.parse(autoDetailsAt);
                var reader = new ApiFootballSampleReader(json);
                if (fixtureDetails) {
                    var samples = reader.readFixtureDetailsBatch(Path.of(directory));
                    var imported = new ApiFootballFixtureDetailsImporter(dataSource, transactions).importBatch(samples);
                    for (var fixture : imported) {
                        System.out.printf("Import committed: fixture %d details. Imported: [%s]. Unavailable: [%s].%n",
                                fixture.fixtureId(), String.join(", ", fixture.result().imported()),
                                String.join(", ", fixture.result().unavailable()));
                    }
                    return;
                }
                if (fixturePlayers) {
                    var sample = reader.readFixturePlayers(Path.of(directory));
                    new ApiFootballFixturePlayersImporter(dataSource, transactions).importSample(sample);
                    System.out.printf("Import committed: player statistics for fixture %d.%n", sample.fixtureId());
                    return;
                }
                if (fixtureLineups) {
                    var sample = reader.readFixtureLineups(Path.of(directory));
                    new ApiFootballFixtureLineupsImporter(dataSource, transactions).importSample(sample);
                    System.out.printf("Import committed: lineups for fixture %d.%n", sample.fixtureId());
                    return;
                }
                if (fixtureEvents) {
                    var sample = reader.readFixtureEvents(Path.of(directory));
                    new ApiFootballFixtureEventsImporter(dataSource, transactions).importSample(sample);
                    System.out.printf("Import committed: %d events for fixture %d.%n",
                            sample.events().size(), sample.fixtureId());
                    return;
                }
                if (fixtureStatistics) {
                    var sample = reader.readFixtureStatistics(Path.of(directory));
                    new ApiFootballFixtureStatisticsImporter(dataSource, transactions).importSample(sample);
                    System.out.printf("Import committed: statistics for fixture %d.%n", sample.fixtureId());
                    return;
                }
                if (standings) {
                    var snapshot = reader.readStandings(Path.of(directory));
                    int rows = new ApiFootballStandingsImporter(dataSource, transactions, json).importSnapshot(snapshot);
                    System.out.printf("Import committed: %d standings rows, 1 snapshot.%n", rows);
                    return;
                }
                var sampleDirectory = Path.of(directory);
                var samples = reader.read(sampleDirectory);
                var result = new ApiFootballCatalogImporter(dataSource, transactions, json)
                        .importSnapshots(samples.leagues(), samples.fixtures());
                System.out.printf("Import committed: %d competition, %d season, %d teams, %d fixtures, 2 snapshots.%n",
                        result.competitions(), result.seasons(), result.teams(), result.matches());
                if (attemptAt != null) {
                    writeAutomaticDetailsPlan(dataSource, json, sampleDirectory, samples.fixtures(), attemptAt);
                }
            } catch (Exception failure) {
                throw new IllegalStateException("API-Football import failed (" + failure.getClass().getSimpleName()
                        + "). Check sample scope, freshness, validation and database permissions; partial writes are rolled back.");
            }
        };
    }

    private static void writeAutomaticDetailsPlan(DataSource dataSource, JsonMapper json, Path directory,
            ApiFootballSnapshot fixtures, Instant attemptAt) {
        try {
            Path output = directory.resolve("auto-details.json");
            if (Files.exists(output)) throw new IOException("A details plan already exists.");
            var ids = new ApiFootballAutomaticDetailClaims(dataSource).claim(fixtures.leagueId(), fixtures.season(), attemptAt);
            Path temporary = Files.createTempFile(directory, ".auto-details-", ".json");
            try {
                Files.write(temporary, json.writeValueAsBytes(ids));
                Files.move(temporary, output);
            } finally {
                Files.deleteIfExists(temporary);
            }
        } catch (IOException | RuntimeException failure) {
            System.err.println("Catalog imported, but automatic match details could not be planned.");
        }
    }
}
