package pl.lmuml.football.apifootball;

import javax.sql.DataSource;

import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

final class ApiFootballCatalogImporter {

    private final ApiFootballImportMapper mapper;
    private final ApiFootballSnapshotStore snapshots;
    private final ApiFootballCatalogWriter catalog;
    private final TransactionTemplate transaction;

    ApiFootballCatalogImporter(DataSource dataSource, PlatformTransactionManager transactions, JsonMapper json) {
        mapper = new ApiFootballImportMapper(json);
        snapshots = new ApiFootballSnapshotStore(dataSource, transactions, json);
        catalog = new ApiFootballCatalogWriter(dataSource, json);
        transaction = new TransactionTemplate(transactions);
    }

    ImportResult importSnapshots(ApiFootballSnapshot leagues, ApiFootballSnapshot fixtures) {
        ApiFootballImportBatch batch = mapper.map(leagues, fixtures);
        return transaction.execute(status -> {
            // Consistent lock order and rejection of stale input before catalog writes.
            snapshots.save(leagues);
            snapshots.save(fixtures);
            catalog.write(batch);
            return new ImportResult(1, 1, batch.teams().size(), batch.matches().size());
        });
    }

    record ImportResult(int competitions, int seasons, int teams, int matches) {}
}
