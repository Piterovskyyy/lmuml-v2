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
import org.springframework.stereotype.Repository;

import pl.lmuml.player.PlayerPredictionsStore.ScoredPrediction;

@Repository
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
class PlayersPredictionsQuery {

    private static final String SELECT_PLAYERS_PREDICTIONS = """
            WITH selected_round AS (
                SELECT id FROM lmuml.betting_rounds WHERE id = :roundId AND published_at IS NOT NULL
            ), checked_at AS MATERIALIZED (
                SELECT statement_timestamp() AS server_now
            ), round_matches AS (
                SELECT m.id AS match_id, m.kickoff_at, m.provider_status, m.fulltime_home, m.fulltime_away
                FROM selected_round r
                JOIN lmuml.betting_round_groups g ON g.betting_round_id = r.id
                JOIN lmuml.betting_round_matches rm ON rm.season_id = g.season_id AND rm.group_key = g.group_key
                JOIN lmuml.matches m ON m.id = rm.match_id
            ), participants AS (
                SELECT DISTINCT p.id, p.display_name
                FROM lmuml.players p
                JOIN lmuml.player_predictions prediction ON prediction.player_id = p.id
                JOIN round_matches m ON m.match_id = prediction.match_id
            ), revealed_predictions AS (
                SELECT prediction.player_id, prediction.match_id, prediction.home_goals, prediction.away_goals,
                       m.kickoff_at, m.provider_status, m.fulltime_home, m.fulltime_away
                FROM round_matches m
                JOIN lmuml.player_predictions prediction ON prediction.match_id = m.match_id
                CROSS JOIN checked_at
                WHERE m.kickoff_at <= checked_at.server_now
                  AND m.provider_status IN ('NS', '1H', '2H', 'ET', 'P', 'LIVE', 'HT', 'BT', 'SUSP', 'INT',
                                            'FT', 'AET', 'PEN', 'ABD', 'AWD', 'WO')
            )
            SELECT r.id AS round_id, checked_at.server_now, p.id AS player_id, p.display_name,
                   prediction.match_id, prediction.home_goals, prediction.away_goals,
                   prediction.provider_status, prediction.fulltime_home, prediction.fulltime_away
            FROM selected_round r CROSS JOIN checked_at
            LEFT JOIN participants p ON TRUE
            LEFT JOIN revealed_predictions prediction ON prediction.player_id = p.id
            ORDER BY p.display_name, p.id, prediction.kickoff_at, prediction.match_id
            """;

    private final JdbcClient jdbc;

    PlayersPredictionsQuery(DataSource source) {
        jdbc = JdbcClient.create(source);
    }

    Optional<ReadResult> find(UUID roundId, UUID currentPlayerId) {
        return jdbc.sql(SELECT_PLAYERS_PREDICTIONS)
                .param("roundId", roundId)
                .query(rows -> {
                    return readPlayers(rows, currentPlayerId);
                });
    }

    private static Optional<ReadResult> readPlayers(ResultSet rows, UUID currentPlayerId) throws SQLException {
        if (!rows.next()) return Optional.empty();
        UUID roundId = rows.getObject("round_id", UUID.class);
        Instant serverNow = rows.getObject("server_now", OffsetDateTime.class).toInstant();
        var players = new ArrayList<Player>();
        boolean hasRow = true;
        while (hasRow) {
            UUID playerId = rows.getObject("player_id", UUID.class);
            if (playerId == null) break;
            String displayName = rows.getString("display_name");
            var predictions = new ArrayList<ScoredPrediction>();
            do {
                UUID matchId = rows.getObject("match_id", UUID.class);
                if (matchId != null) {
                    int homeGoals = rows.getInt("home_goals");
                    int awayGoals = rows.getInt("away_goals");
                    Long points = PredictionScoring.settle(homeGoals, awayGoals, rows.getString("provider_status"),
                            rows.getObject("fulltime_home", Integer.class), rows.getObject("fulltime_away", Integer.class))
                            .map(PredictionScoring.Settlement::points).orElse(null);
                    predictions.add(new ScoredPrediction(matchId, homeGoals, awayGoals, points));
                }
            } while ((hasRow = rows.next()) && playerId.equals(rows.getObject("player_id", UUID.class)));
            players.add(new Player(playerId, displayName, playerId.equals(currentPlayerId), List.copyOf(predictions)));
        }
        return Optional.of(new ReadResult(roundId, serverNow, List.copyOf(players)));
    }

    record ReadResult(UUID roundId, Instant serverNow, List<Player> players) {}
    record Player(UUID id, String displayName, boolean isCurrentPlayer, List<ScoredPrediction> predictions) {}
}
