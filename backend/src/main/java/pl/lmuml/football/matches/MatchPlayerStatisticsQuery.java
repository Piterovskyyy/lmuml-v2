package pl.lmuml.football.matches;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import javax.sql.DataSource;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.jdbc.core.ResultSetExtractor;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import pl.lmuml.football.matches.MatchPlayerStatisticsResponse.Player;

@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class MatchPlayerStatisticsQuery {

    private static final String SELECT_STATISTICS = """
            SELECT snapshot.captured_at, p.side, p.name, p.shirt_number, p.position, p.minutes, p.rating,
                p.goals, p.assists, p.shots_total, p.shots_on_target, p.passes_total, p.key_passes, p.tackles, p.saves
            FROM lmuml.matches m
            JOIN lmuml.match_player_stat_snapshots snapshot
                ON snapshot.match_id = m.id
                AND snapshot.home_team_id = m.home_team_id AND snapshot.away_team_id = m.away_team_id
            JOIN lmuml.match_player_statistics p ON p.match_id = m.id
            WHERE m.id = :matchId
            ORDER BY p.side, p.position_index
            """;

    private final JdbcClient jdbc;

    MatchPlayerStatisticsQuery(DataSource dataSource) {
        jdbc = JdbcClient.create(dataSource);
    }

    Optional<MatchPlayerStatisticsResponse> find(UUID matchId) {
        ResultSetExtractor<Optional<MatchPlayerStatisticsResponse>> extract = rows -> readStatistics(matchId, rows);
        return jdbc.sql(SELECT_STATISTICS).param("matchId", matchId).query(extract);
    }

    private static Optional<MatchPlayerStatisticsResponse> readStatistics(UUID matchId, ResultSet rows)
            throws SQLException {
        if (!rows.next()) return Optional.empty();

        var capturedAt = rows.getObject("captured_at", OffsetDateTime.class).toInstant();
        List<Player> home = new ArrayList<>();
        List<Player> away = new ArrayList<>();
        do {
            var side = "HOME".equals(rows.getString("side")) ? home : away;
            side.add(readPlayer(rows));
        } while (rows.next());

        if (home.isEmpty() || away.isEmpty()) return Optional.empty();
        return Optional.of(new MatchPlayerStatisticsResponse(matchId, capturedAt, List.copyOf(home), List.copyOf(away)));
    }

    private static Player readPlayer(ResultSet rows) throws SQLException {
        return new Player(rows.getString("name"), rows.getObject("shirt_number", Integer.class),
                MatchLineupPosition.valueOf(rows.getString("position")), rows.getObject("minutes", Integer.class),
                rows.getBigDecimal("rating"), rows.getObject("goals", Integer.class), rows.getObject("assists", Integer.class),
                rows.getObject("shots_total", Integer.class), rows.getObject("shots_on_target", Integer.class),
                rows.getObject("passes_total", Integer.class), rows.getObject("key_passes", Integer.class),
                rows.getObject("tackles", Integer.class), rows.getObject("saves", Integer.class));
    }
}
