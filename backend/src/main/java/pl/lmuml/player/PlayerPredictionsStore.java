package pl.lmuml.player;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import javax.sql.DataSource;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.support.SqlArrayValue;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Repository
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
class PlayerPredictionsStore {

    private static final String FIND_PREDICTIONS = """
            SELECT p.match_id, p.home_goals, p.away_goals, statement_timestamp() AS server_now,
                   m.provider_status, m.fulltime_home AS regulation_home, m.fulltime_away AS regulation_away
            FROM lmuml.betting_rounds r
            LEFT JOIN (
                SELECT g.betting_round_id, prediction.match_id, prediction.home_goals, prediction.away_goals
                FROM lmuml.player_predictions prediction
                JOIN lmuml.betting_round_matches rm USING (match_id)
                JOIN lmuml.betting_round_groups g USING (season_id, group_key)
                WHERE prediction.player_id = :playerId AND g.betting_round_id = :roundId
            ) p ON p.betting_round_id = r.id
            LEFT JOIN lmuml.matches m ON m.id = p.match_id
            WHERE r.id = :roundId AND r.published_at IS NOT NULL
            ORDER BY p.match_id
            """;

    private static final String SAVE_PREDICTIONS = """
            WITH submitted AS (
                SELECT *
                FROM unnest(CAST(:matchIds AS uuid[]), CAST(:homeGoals AS integer[]), CAST(:awayGoals AS integer[]))
                    WITH ORDINALITY AS scores(match_id, home_goals, away_goals, position)
            ),
            round_matches AS (
                SELECT rm.match_id, m.provider_status, m.kickoff_at
                FROM lmuml.betting_round_groups g
                JOIN lmuml.betting_round_matches rm USING (season_id, group_key)
                JOIN lmuml.matches m ON m.id = rm.match_id
                WHERE g.betting_round_id = :roundId
            ),
            checked_at AS MATERIALIZED (
                SELECT clock_timestamp() AS server_now
            ),
            saved AS (
                INSERT INTO lmuml.player_predictions (player_id, match_id, home_goals, away_goals)
                SELECT :playerId, submitted.match_id, submitted.home_goals, submitted.away_goals
                FROM submitted JOIN round_matches USING (match_id) CROSS JOIN checked_at
                WHERE round_matches.provider_status = 'NS' AND round_matches.kickoff_at > checked_at.server_now
                ON CONFLICT (player_id, match_id) DO UPDATE
                    SET home_goals = EXCLUDED.home_goals, away_goals = EXCLUDED.away_goals
                RETURNING match_id
            )
            SELECT submitted.match_id, submitted.home_goals, submitted.away_goals, checked_at.server_now,
                saved.match_id IS NOT NULL AS saved, round_matches.match_id IS NOT NULL AS in_round
            FROM submitted
            LEFT JOIN round_matches USING (match_id)
            LEFT JOIN saved USING (match_id)
            CROSS JOIN checked_at
            ORDER BY submitted.position
            """;

    private final JdbcClient jdbc;
    private final TransactionTemplate write;

    PlayerPredictionsStore(DataSource source, PlatformTransactionManager transactions) {
        jdbc = JdbcClient.create(source);
        write = new TransactionTemplate(transactions);
    }

    Optional<ReadResult> find(UUID playerId, UUID roundId) {
        return jdbc.sql(FIND_PREDICTIONS)
                .param("playerId", playerId)
                .param("roundId", roundId)
                .query(rows -> {
                    if (!rows.next()) return Optional.empty();
                    Instant serverNow = serverNow(rows);
                    var predictions = new ArrayList<ScoredPrediction>();
                    do {
                        UUID matchId = rows.getObject("match_id", UUID.class);
                        if (matchId != null) predictions.add(scoredPrediction(rows, matchId));
                    } while (rows.next());
                    return Optional.of(new ReadResult(List.copyOf(predictions), serverNow));
                });
    }

    Optional<SaveResult> save(UUID playerId, UUID roundId, List<Prediction> predictions) {
        return write.execute(transaction -> {
            // Wait for this player's previous save before checking any deadlines.
            jdbc.sql("SELECT id FROM lmuml.players WHERE id = :playerId FOR NO KEY UPDATE")
                    .param("playerId", playerId).query(UUID.class).single();

            var published = jdbc.sql("""
                    SELECT id FROM lmuml.betting_rounds
                    WHERE id = :roundId AND published_at IS NOT NULL FOR SHARE
                    """).param("roundId", roundId).query(UUID.class).optional();
            if (published.isEmpty()) return Optional.empty();

            return Optional.of(jdbc.sql(SAVE_PREDICTIONS)
                    .param("playerId", playerId)
                    .param("roundId", roundId)
                    .param("matchIds", new SqlArrayValue("uuid", predictions.stream()
                            .map(Prediction::matchId).toArray(UUID[]::new)))
                    .param("homeGoals", new SqlArrayValue("integer", predictions.stream()
                            .map(Prediction::homeGoals).toArray(Integer[]::new)))
                    .param("awayGoals", new SqlArrayValue("integer", predictions.stream()
                            .map(Prediction::awayGoals).toArray(Integer[]::new)))
                    .query(PlayerPredictionsStore::saveResult));
        });
    }

    private static SaveResult saveResult(ResultSet rows) throws SQLException {
        if (!rows.next()) throw new IllegalStateException("A prediction batch must contain at least one result");
        Instant serverNow = serverNow(rows);
        var saved = new ArrayList<Prediction>();
        var rejected = new ArrayList<Rejected>();
        do {
            UUID matchId = rows.getObject("match_id", UUID.class);
            if (rows.getBoolean("saved")) {
                saved.add(prediction(rows, matchId));
            } else {
                var reason = rows.getBoolean("in_round") ? RejectionReason.LOCKED : RejectionReason.NOT_IN_ROUND;
                rejected.add(new Rejected(matchId, reason));
            }
        } while (rows.next());
        return new SaveResult(List.copyOf(saved), List.copyOf(rejected), serverNow);
    }

    private static Prediction prediction(ResultSet row, UUID matchId) throws SQLException {
        return new Prediction(matchId, row.getInt("home_goals"), row.getInt("away_goals"));
    }

    private static ScoredPrediction scoredPrediction(ResultSet row, UUID matchId) throws SQLException {
        int homeGoals = row.getInt("home_goals");
        int awayGoals = row.getInt("away_goals");
        Integer regulationHome = row.getObject("regulation_home", Integer.class);
        Integer regulationAway = row.getObject("regulation_away", Integer.class);
        Long points = PredictionScoring.settle(homeGoals, awayGoals, row.getString("provider_status"),
                regulationHome, regulationAway).map(PredictionScoring.Settlement::points).orElse(null);
        return new ScoredPrediction(matchId, homeGoals, awayGoals, points);
    }

    private static Instant serverNow(ResultSet row) throws SQLException {
        return row.getObject("server_now", OffsetDateTime.class).toInstant();
    }

    record Prediction(UUID matchId, int homeGoals, int awayGoals) {}
    record ScoredPrediction(UUID matchId, int homeGoals, int awayGoals, Long points) {}
    record ReadResult(List<ScoredPrediction> predictions, Instant serverNow) {}
    record SaveResult(List<Prediction> saved, List<Rejected> rejected, Instant serverNow) {}
    record Rejected(UUID matchId, RejectionReason reason) {}
    enum RejectionReason { LOCKED, NOT_IN_ROUND }
}
