package pl.lmuml.football.apifootball;

import java.sql.Types;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.UUID;
import javax.sql.DataSource;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import pl.lmuml.football.apifootball.ApiFootballFixtureStatisticsSample.Statistics;

final class ApiFootballFixtureStatisticsImporter {

    private final JdbcClient jdbc;
    private final TransactionTemplate transaction;

    ApiFootballFixtureStatisticsImporter(DataSource dataSource, PlatformTransactionManager transactions) {
        this.jdbc = JdbcClient.create(dataSource);
        this.transaction = new TransactionTemplate(transactions);
    }

    void importSample(ApiFootballFixtureStatisticsSample sample) {
        transaction.executeWithoutResult(status -> {
            UUID matchId = lockMatch(sample.fixtureId());
            var participants = findParticipants(matchId);
            var home = statisticsFor(sample, participants.home().providerId());
            var away = statisticsFor(sample, participants.away().providerId());
            write(matchId, Side.HOME, participants.home().id(), sample.capturedAt(), home, participants.changed());
            write(matchId, Side.AWAY, participants.away().id(), sample.capturedAt(), away, participants.changed());
        });
    }

    private UUID lockMatch(long fixtureId) {
        // Keep participant mapping stable while both sides are written.
        return jdbc.sql("""
                SELECT id FROM lmuml.matches WHERE api_football_id = :fixtureId FOR UPDATE
                """)
                .param("fixtureId", fixtureId)
                .query(UUID.class)
                .optional()
                .orElseThrow(() -> new IllegalArgumentException("Import this fixture before its statistics."));
    }

    private Participants findParticipants(UUID matchId) {
        return jdbc.sql("""
                SELECT home.id AS home_id, home.api_football_id AS home_provider_id,
                       away.id AS away_id, away.api_football_id AS away_provider_id,
                       EXISTS (
                           SELECT 1 FROM lmuml.match_statistics stats
                           WHERE stats.match_id = m.id
                             AND ((stats.side = 'HOME' AND stats.team_id <> home.id)
                               OR (stats.side = 'AWAY' AND stats.team_id <> away.id))
                       ) AS participants_changed
                FROM lmuml.matches m
                JOIN lmuml.teams home ON home.id = m.home_team_id
                JOIN lmuml.teams away ON away.id = m.away_team_id
                WHERE m.id = :matchId
                """)
                .param("matchId", matchId)
                .query((row, index) -> new Participants(
                        new Team(row.getObject("home_id", UUID.class), row.getLong("home_provider_id")),
                        new Team(row.getObject("away_id", UUID.class), row.getLong("away_provider_id")),
                        row.getBoolean("participants_changed")))
                .single();
    }

    private static Statistics statisticsFor(ApiFootballFixtureStatisticsSample sample, long teamId) {
        return sample.teams().stream().filter(row -> row.teamId() == teamId)
                .findFirst().map(ApiFootballFixtureStatisticsSample.TeamStatistics::statistics)
                .orElseThrow(() -> new IllegalArgumentException("Statistics teams do not match the catalog fixture."));
    }

    private void write(UUID matchId, Side side, UUID teamId, Instant capturedAt, Statistics statistics,
            boolean participantsChanged) {
        // A snapshot for the old pairing cannot supersede one for the corrected fixture.
        int updated = jdbc.sql("""
                INSERT INTO lmuml.match_statistics AS stored
                    (match_id, side, team_id, captured_at, shots_total, shots_on_target, possession_percent, corners, fouls, saves)
                VALUES (:matchId, :side, :teamId, :capturedAt, :shotsTotal, :shotsOnTarget, :possessionPercent,
                        :corners, :fouls, :saves)
                ON CONFLICT (match_id, side) DO UPDATE
                SET team_id = EXCLUDED.team_id, captured_at = EXCLUDED.captured_at, shots_total = EXCLUDED.shots_total,
                    shots_on_target = EXCLUDED.shots_on_target, possession_percent = EXCLUDED.possession_percent,
                    corners = EXCLUDED.corners, fouls = EXCLUDED.fouls, saves = EXCLUDED.saves
                WHERE :participantsChanged OR EXCLUDED.captured_at > stored.captured_at
                    OR (EXCLUDED.captured_at = stored.captured_at
                        AND (stored.shots_total, stored.shots_on_target, stored.possession_percent,
                            stored.corners, stored.fouls, stored.saves)
                        IS NOT DISTINCT FROM (EXCLUDED.shots_total, EXCLUDED.shots_on_target,
                            EXCLUDED.possession_percent, EXCLUDED.corners, EXCLUDED.fouls, EXCLUDED.saves))
                """)
                .param("matchId", matchId)
                .param("side", side.name())
                .param("teamId", teamId)
                .param("capturedAt", capturedAt.atOffset(ZoneOffset.UTC))
                .param("shotsTotal", statistics.shotsTotal(), Types.INTEGER)
                .param("shotsOnTarget", statistics.shotsOnTarget(), Types.INTEGER)
                .param("possessionPercent", statistics.possessionPercent(), Types.NUMERIC)
                .param("corners", statistics.corners(), Types.INTEGER)
                .param("fouls", statistics.fouls(), Types.INTEGER)
                .param("saves", statistics.saves(), Types.INTEGER)
                .param("participantsChanged", participantsChanged)
                .update();
        if (updated != 1) {
            throw new IllegalStateException("Newer or conflicting fixture statistics already exist.");
        }
    }

    private record Participants(Team home, Team away, boolean changed) {}

    private record Team(UUID id, long providerId) {}

    private enum Side { HOME, AWAY }
}
