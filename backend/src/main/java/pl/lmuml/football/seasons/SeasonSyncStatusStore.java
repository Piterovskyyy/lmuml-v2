package pl.lmuml.football.seasons;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Optional;
import javax.sql.DataSource;

import org.springframework.jdbc.core.simple.JdbcClient;

final class SeasonSyncStatusStore {

    private final JdbcClient jdbc;

    SeasonSyncStatusStore(DataSource dataSource) {
        jdbc = JdbcClient.create(dataSource);
    }

    Optional<Status> find(String seasonCode) {
        return jdbc.sql("""
                SELECT snapshot.captured_at, attempt.started_at, attempt.finished_at, attempt.outcome
                FROM lmuml.seasons s
                JOIN lmuml.competitions c ON c.id = s.competition_id
                LEFT JOIN lmuml.fixture_snapshot_times snapshot
                    ON snapshot.league_id = c.api_football_id AND snapshot.season = s.start_year
                LEFT JOIN lmuml.season_sync_attempts attempt ON attempt.season_id = s.id
                WHERE s.code = :seasonCode
                """)
                .param("seasonCode", seasonCode)
                .query((row, index) -> {
                    var capturedAt = row.getObject("captured_at", OffsetDateTime.class);
                    var startedAt = row.getObject("started_at", OffsetDateTime.class);
                    Attempt lastAttempt = startedAt == null ? null : new Attempt(startedAt.toInstant(),
                            row.getObject("finished_at", OffsetDateTime.class).toInstant(),
                            Outcome.valueOf(row.getString("outcome")));
                    return new Status(capturedAt == null ? null : capturedAt.toInstant(), lastAttempt);
                })
                .optional();
    }

    void recordAttempt(String seasonCode, Attempt attempt) {
        jdbc.sql("""
                INSERT INTO lmuml.season_sync_attempts AS latest (season_id, started_at, finished_at, outcome)
                SELECT id, :startedAt, :finishedAt, :outcome FROM lmuml.seasons WHERE code = :seasonCode
                ON CONFLICT (season_id) DO UPDATE SET started_at = EXCLUDED.started_at,
                    finished_at = EXCLUDED.finished_at, outcome = EXCLUDED.outcome
                WHERE latest.started_at < EXCLUDED.started_at
                """)
                .param("seasonCode", seasonCode)
                .param("startedAt", attempt.startedAt().atOffset(ZoneOffset.UTC))
                .param("finishedAt", attempt.finishedAt().atOffset(ZoneOffset.UTC))
                .param("outcome", attempt.outcome().name())
                .update();
    }

    enum Outcome { SUCCEEDED, FAILED }

    record Attempt(Instant startedAt, Instant finishedAt, Outcome outcome) {
        Attempt {
            if (finishedAt.isBefore(startedAt)) {
                throw new IllegalArgumentException("The attempt finished before it started.");
            }
        }
    }

    record Status(Instant lastSuccessfulAt, Attempt lastAttempt) {}
}
