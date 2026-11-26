package pl.lmuml.player;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Types;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.HashMap;
import java.util.List;
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
import pl.lmuml.player.PredictionLeaderboard.Sort;

@Repository
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
class PlayerRankingQuery {

    private final JdbcClient jdbc;
    private final TransactionTemplate read;

    PlayerRankingQuery(DataSource source, PlatformTransactionManager transactions) {
        jdbc = JdbcClient.create(source);
        read = new TransactionTemplate(transactions);
        read.setReadOnly(true);
        read.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }

    Optional<Ranking> find(String seasonCode, UUID roundId, UUID currentPlayerId, Sort sort) {
        return read.execute(transaction -> jdbc.sql("""
                SELECT s.id, s.name, snapshot.captured_at
                FROM lmuml.seasons s
                JOIN lmuml.competitions c ON c.id = s.competition_id
                LEFT JOIN lmuml.fixture_snapshot_times snapshot
                    ON snapshot.league_id = c.api_football_id AND snapshot.season = s.start_year
                WHERE s.code = :seasonCode
                """)
                .param("seasonCode", seasonCode)
                .query((row, index) -> {
                    var capturedAt = row.getObject("captured_at", OffsetDateTime.class);
                    return new Season(row.getObject("id", UUID.class), row.getString("name"),
                            capturedAt == null ? null : capturedAt.toInstant());
                })
                .optional()
                .flatMap(season -> readRanking(season, roundId, currentPlayerId, sort)));
    }

    private Optional<Ranking> readRanking(Season season, UUID roundId, UUID currentPlayerId, Sort sort) {
        List<Round> rounds = jdbc.sql("""
                SELECT id, number, name
                FROM lmuml.betting_rounds
                WHERE season_id = :seasonId AND published_at IS NOT NULL
                ORDER BY number DESC
                """)
                .param("seasonId", season.id())
                .query((row, index) -> new Round(row.getObject("id", UUID.class), row.getInt("number"),
                        row.getString("name")))
                .list();
        if (roundId != null && rounds.stream().noneMatch(round -> round.id().equals(roundId))) {
            return Optional.empty();
        }

        Round latestScoredRound = roundId == null ? latestScoredRound(season.id()) : null;
        ResultSetExtractor<List<Entry>> rankingEntries = rows -> rankPlayers(rows, currentPlayerId, sort, latestScoredRound);
        List<Entry> entries = jdbc.sql(PublishedPredictionMatches.CTE + """
                SELECT p.id AS player_id, p.display_name, prediction.home_goals, prediction.away_goals,
                       m.provider_status, m.fulltime_home, m.fulltime_away, m.round_id
                FROM published_matches m
                JOIN lmuml.player_predictions prediction ON prediction.match_id = m.id
                JOIN lmuml.players p ON p.id = prediction.player_id
                """)
                .param("seasonId", season.id())
                .param("roundId", roundId, Types.OTHER)
                .query(rankingEntries);
        return Optional.of(new Ranking(season.name(), rounds, roundId, entries, refreshKickoffs(season.id(), roundId),
                latestScoredRound, season.fixturesCapturedAt()));
    }

    private Round latestScoredRound(UUID seasonId) {
        return jdbc.sql(PublishedPredictionMatches.CTE + """
                SELECT DISTINCT round_id, round_number, round_name
                FROM published_matches
                WHERE provider_status IN ('FT', 'AET', 'PEN')
                  AND fulltime_home IS NOT NULL AND fulltime_away IS NOT NULL
                ORDER BY round_number DESC
                LIMIT 1
                """)
                .param("seasonId", seasonId)
                .param("roundId", null, Types.OTHER)
                .query((row, index) -> new Round(row.getObject("round_id", UUID.class), row.getInt("round_number"),
                        row.getString("round_name")))
                .optional().orElse(null);
    }

    private List<Instant> refreshKickoffs(UUID seasonId, UUID roundId) {
        return jdbc.sql(PublishedPredictionMatches.CTE + """
                SELECT DISTINCT kickoff_at
                FROM published_matches
                WHERE kickoff_at >= CURRENT_TIMESTAMP - INTERVAL '1 day'
                  AND provider_status IN ('NS', '1H', '2H', 'ET', 'P', 'LIVE', 'HT', 'BT', 'SUSP', 'INT',
                                          'FT', 'AET', 'PEN', 'AWD', 'WO')
                ORDER BY kickoff_at
                """)
                .param("seasonId", seasonId)
                .param("roundId", roundId, Types.OTHER)
                .query((row, index) -> row.getObject("kickoff_at", OffsetDateTime.class).toInstant())
                .list();
    }

    private static List<Entry> rankPlayers(ResultSet rows, UUID currentPlayerId, Sort sort, Round latestScoredRound)
            throws SQLException {
        var totals = new HashMap<UUID, PlayerTotal>();
        while (rows.next()) {
            var settled = PredictionScoring.settle(rows.getInt("home_goals"), rows.getInt("away_goals"),
                    rows.getString("provider_status"), rows.getObject("fulltime_home", Integer.class),
                    rows.getObject("fulltime_away", Integer.class));
            if (settled.isPresent()) {
                UUID playerId = rows.getObject("player_id", UUID.class);
                var result = settled.get();
                long latestRoundPoints = latestScoredRound != null
                        && latestScoredRound.id().equals(rows.getObject("round_id", UUID.class)) ? result.points() : 0;
                totals.merge(playerId, PlayerTotal.from(playerId, rows.getString("display_name"), result,
                        latestRoundPoints), PlayerTotal::add);
            }
        }

        return PredictionLeaderboard.rank(totals.values(), sort).stream().map(placement -> {
            PlayerTotal player = placement.player();
            return new Entry(placement.position(), player.displayName(), player.points(), player.exactScores(),
                    player.correctOutcomes(), player.settledPredictions(), player.playerId().equals(currentPlayerId),
                    latestScoredRound == null ? null : player.latestRoundPoints());
        }).toList();
    }

    private record Season(UUID id, String name, Instant fixturesCapturedAt) {}

    record Ranking(String seasonName, List<Round> rounds, UUID roundId, List<Entry> entries,
            List<Instant> refreshKickoffs, Round latestScoredRound, Instant fixturesCapturedAt) {}
    record Round(UUID id, int number, String name) {}
    record Entry(int position, String displayName, long points, int exactScores, int correctOutcomes, int settledPredictions,
            boolean isCurrentPlayer, Long latestRoundPoints) {}
}
