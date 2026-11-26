package pl.lmuml.football.apifootball;

import javax.sql.DataSource;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;
import tools.jackson.databind.json.JsonMapper;

final class ApiFootballSnapshotStore {

    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final TransactionTemplate existingTransaction;

    ApiFootballSnapshotStore(DataSource dataSource, PlatformTransactionManager transactions, JsonMapper json) {
        this.jdbc = JdbcClient.create(dataSource);
        this.json = json;
        this.existingTransaction = new TransactionTemplate(transactions);
        this.existingTransaction.setPropagationBehavior(TransactionDefinition.PROPAGATION_MANDATORY);
    }

    void save(ApiFootballSnapshot snapshot) {
        // Join the caller's catalog transaction; never commit a response independently.
        existingTransaction.executeWithoutResult(transaction -> {
            int rows = jdbc.sql("""
                    INSERT INTO lmuml.api_football_snapshots AS stored
                        (endpoint, league_id, season, captured_at, payload)
                    VALUES (:endpoint, :league, :season, :capturedAt, CAST(:payload AS jsonb))
                    ON CONFLICT (endpoint, league_id, season) DO UPDATE
                    SET captured_at = EXCLUDED.captured_at, payload = EXCLUDED.payload
                    WHERE EXCLUDED.captured_at > stored.captured_at
                        OR (EXCLUDED.captured_at = stored.captured_at AND EXCLUDED.payload = stored.payload)
                    """)
                    .param("endpoint", snapshot.endpoint().path())
                    .param("league", snapshot.leagueId())
                    .param("season", snapshot.season())
                    .param("capturedAt", snapshot.capturedAt().atOffset(java.time.ZoneOffset.UTC))
                    .param("payload", json.writeValueAsString(snapshot.payload()))
                    .update();
            if (rows == 0) {
                throw new IllegalStateException("A newer or conflicting API-Football snapshot already exists.");
            }
        });
    }
}
