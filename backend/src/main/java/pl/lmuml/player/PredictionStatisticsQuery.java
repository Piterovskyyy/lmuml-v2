package pl.lmuml.player;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Objects;
import java.util.Optional;
import java.util.UUID;
import javax.sql.DataSource;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import pl.lmuml.player.PredictionLeaderboard.PlayerTotal;

@Repository
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
class PredictionStatisticsQuery {

    private static final Totals EMPTY_TOTALS = new Totals(0, 0, 0, 0);
    private static final int PUBLIC_LEADERS_LIMIT = 5;

    private final JdbcClient jdbc;
    private final TransactionTemplate read;

    PredictionStatisticsQuery(DataSource source, PlatformTransactionManager transactions) {
        jdbc = JdbcClient.create(source);
        read = new TransactionTemplate(transactions);
        read.setReadOnly(true);
        read.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }

    Optional<PublicStatistics> findPublic(String seasonCode) {
        return read.execute(transaction -> findSeason(seasonCode).map(season -> {
            ResultSetExtractor<PublicStatistics> totals = rows -> publicTotals(season.name(), rows);
            return predictions(season.id(), null).query(totals);
        }));
    }

    Optional<PersonalStatistics> findPersonal(String seasonCode, UUID playerId) {
        Objects.requireNonNull(playerId);
        return read.execute(transaction -> findSeason(seasonCode).map(season -> {
            ResultSetExtractor<PersonalStatistics> totals = rows -> personalTotals(season.name(), rows);
            return predictions(season.id(), playerId).query(totals);
        }));
    }

    private Optional<Season> findSeason(String seasonCode) {
        return jdbc.sql("SELECT id, name FROM lmuml.seasons WHERE code = :seasonCode")
                .param("seasonCode", seasonCode)
                .query((row, index) -> new Season(row.getObject("id", UUID.class), row.getString("name")))
                .optional();
    }

    private JdbcClient.StatementSpec predictions(UUID seasonId, UUID playerId) {
        return jdbc.sql(PublishedPredictionMatches.CTE + """
                SELECT m.round_id, m.round_number, m.round_name, prediction.player_id,
                       p.display_name, prediction.home_goals, prediction.away_goals,
                       m.provider_status, m.fulltime_home, m.fulltime_away
                FROM published_matches m
                JOIN lmuml.player_predictions prediction ON prediction.match_id = m.id
                JOIN lmuml.players p ON p.id = prediction.player_id
                WHERE m.kickoff_at <= statement_timestamp()
                  AND (CAST(:playerId AS uuid) IS NULL OR prediction.player_id = :playerId)
                ORDER BY m.round_number
                """)
                .param("seasonId", seasonId)
                .param("roundId", null, Types.OTHER)
                .param("playerId", playerId, Types.OTHER);
    }

    private static PublicStatistics publicTotals(String seasonName, ResultSet rows) throws SQLException {
        var players = new HashMap<UUID, PlayerTotal>();
        var rounds = new LinkedHashMap<Round, Totals>();
        var total = EMPTY_TOTALS;
        while (rows.next()) {
            var settled = settle(rows);
            if (settled.isPresent()) {
                var result = settled.get();
                var playerId = rows.getObject("player_id", UUID.class);
                players.merge(playerId, PlayerTotal.from(playerId, rows.getString("display_name"), result, 0),
                        PlayerTotal::add);
                var points = Totals.from(result);
                rounds.merge(readRound(rows), points, Totals::add);
                total = total.add(points);
            }
        }
        var leaders = PredictionLeaderboard.rank(players.values(), PredictionLeaderboard.Sort.POINTS).stream()
                .limit(PUBLIC_LEADERS_LIMIT)
                .map(placement -> new Leader(placement.position(), placement.player().displayName(),
                        placement.player().points()))
                .toList();
        var roundStatistics = rounds.entrySet().stream().map(entry -> {
            var round = entry.getKey();
            var score = entry.getValue();
            return new PublicRoundStatistics(round.number(), round.name(), score.settledPredictions(),
                    score.exactScores(), score.correctOutcomes());
        }).toList();
        return new PublicStatistics(seasonName, players.size(), total.settledPredictions(), total.exactScores(),
                total.correctOutcomes(), leaders, roundStatistics);
    }

    private static PersonalStatistics personalTotals(String seasonName, ResultSet rows) throws SQLException {
        var rounds = new LinkedHashMap<Round, Totals>();
        var total = EMPTY_TOTALS;
        while (rows.next()) {
            var settled = settle(rows);
            if (settled.isPresent()) {
                var points = Totals.from(settled.get());
                rounds.merge(readRound(rows), points, Totals::add);
                total = total.add(points);
            }
        }
        var roundStatistics = rounds.entrySet().stream().map(entry -> {
            var round = entry.getKey();
            var score = entry.getValue();
            return new RoundStatistics(round.id(), round.number(), round.name(), score.points(),
                    score.settledPredictions(), score.exactScores(), score.correctOutcomes());
        }).toList();
        return new PersonalStatistics(seasonName, total, roundStatistics);
    }

    private static Round readRound(ResultSet rows) throws SQLException {
        return new Round(rows.getObject("round_id", UUID.class), rows.getInt("round_number"),
                rows.getString("round_name"));
    }

    private static Optional<PredictionScoring.Settlement> settle(ResultSet rows) throws SQLException {
        return PredictionScoring.settle(rows.getInt("home_goals"), rows.getInt("away_goals"),
                rows.getString("provider_status"), rows.getObject("fulltime_home", Integer.class),
                rows.getObject("fulltime_away", Integer.class));
    }

    private record Season(UUID id, String name) {}

    private record Round(UUID id, int number, String name) {}

    record Totals(long points, int settledPredictions, int exactScores, int correctOutcomes) {
        static Totals from(PredictionScoring.Settlement result) {
            return new Totals(result.points(), 1, result.exactScore() ? 1 : 0, result.correctOutcome() ? 1 : 0);
        }

        Totals add(Totals other) {
            return new Totals(points + other.points(), settledPredictions + other.settledPredictions(),
                    exactScores + other.exactScores(), correctOutcomes + other.correctOutcomes());
        }
    }

    record PublicStatistics(String seasonName, int playersWithSettledPredictions, int settledPredictions,
            int exactScores, int correctOutcomes, List<Leader> leaders, List<PublicRoundStatistics> rounds) {}

    record Leader(int position, String displayName, long points) {}

    record PublicRoundStatistics(int number, String name, int settledPredictions, int exactScores, int correctOutcomes) {}

    record PersonalStatistics(String seasonName, Totals totals, List<RoundStatistics> rounds) {}

    record RoundStatistics(UUID id, int number, String name, long points, int settledPredictions,
            int exactScores, int correctOutcomes) {}
}
