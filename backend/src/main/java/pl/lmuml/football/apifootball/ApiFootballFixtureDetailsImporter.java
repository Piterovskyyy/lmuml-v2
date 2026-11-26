package pl.lmuml.football.apifootball;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.function.Consumer;
import javax.sql.DataSource;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

final class ApiFootballFixtureDetailsImporter {

    private final JdbcClient jdbc;
    private final TransactionTemplate transaction;
    private final ApiFootballFixtureEventsImporter events;
    private final ApiFootballFixtureLineupsImporter lineups;
    private final ApiFootballFixtureStatisticsImporter statistics;
    private final ApiFootballFixturePlayersImporter players;

    ApiFootballFixtureDetailsImporter(DataSource dataSource, PlatformTransactionManager transactions) {
        jdbc = JdbcClient.create(dataSource);
        transaction = new TransactionTemplate(transactions);
        events = new ApiFootballFixtureEventsImporter(dataSource, transactions);
        lineups = new ApiFootballFixtureLineupsImporter(dataSource, transactions);
        statistics = new ApiFootballFixtureStatisticsImporter(dataSource, transactions);
        players = new ApiFootballFixturePlayersImporter(dataSource, transactions);
    }

    ImportResult importSample(ApiFootballFixtureDetailsSample sample) {
        return importBatch(List.of(sample)).getFirst().result();
    }

    List<ImportedFixture> importBatch(List<ApiFootballFixtureDetailsSample> samples) {
        // Take match locks in the same order even if two sample files list them differently.
        var inLockOrder = samples.stream().sorted(Comparator.comparingLong(ApiFootballFixtureDetailsSample::fixtureId))
                .toList();
        return transaction.execute(status -> inLockOrder.stream()
                .map(sample -> new ImportedFixture(sample.fixtureId(), writeDetails(sample)))
                .toList());
    }

    private ImportResult writeDetails(ApiFootballFixtureDetailsSample sample) {
        var participants = lockParticipants(sample.fixtureId());
        if (participants.homeId() != sample.homeTeamId() || participants.awayId() != sample.awayTeamId()) {
            throw new IllegalArgumentException("Fixture details teams do not match the catalog fixture.");
        }

        // Section importers join the transaction for the whole batch.
        var written = new ArrayList<String>();
        var unavailable = new ArrayList<String>();
        importSection("events", sample.events(), events::importSample, written, unavailable);
        importSection("lineups", sample.lineups(), lineups::importSample, written, unavailable);
        importSection("statistics", sample.statistics(), statistics::importSample, written, unavailable);
        importSection("players", sample.players(), players::importSample, written, unavailable);
        return new ImportResult(List.copyOf(written), List.copyOf(unavailable));
    }

    private Participants lockParticipants(long fixtureId) {
        return jdbc.sql("""
                SELECT home.api_football_id AS home_provider_id, away.api_football_id AS away_provider_id
                FROM lmuml.matches m
                JOIN lmuml.teams home ON home.id = m.home_team_id
                JOIN lmuml.teams away ON away.id = m.away_team_id
                WHERE m.api_football_id = :fixtureId
                FOR UPDATE OF m
                """)
                .param("fixtureId", fixtureId)
                .query((row, index) -> new Participants(row.getLong("home_provider_id"), row.getLong("away_provider_id")))
                .optional()
                .orElseThrow(() -> new IllegalArgumentException("Import this fixture before its details."));
    }

    private static <T> void importSection(String name, Optional<T> section, Consumer<T> writer,
            List<String> written, List<String> unavailable) {
        if (section.isPresent()) {
            writer.accept(section.orElseThrow());
            written.add(name);
        } else {
            unavailable.add(name);
        }
    }

    record ImportResult(List<String> imported, List<String> unavailable) {}

    record ImportedFixture(long fixtureId, ImportResult result) {}

    private record Participants(long homeId, long awayId) {}
}
