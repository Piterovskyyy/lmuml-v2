package pl.lmuml.football.matches;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.OffsetDateTime;
import java.util.Optional;
import java.util.UUID;
import javax.sql.DataSource;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

import pl.lmuml.football.matches.MatchStatisticsResponse.TeamStatistics;

@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class MatchStatisticsQuery {

    private static final String SELECT_COMPARISON = """
            SELECT home.captured_at,
                home.shots_total AS home_shots_total, away.shots_total AS away_shots_total,
                home.shots_on_target AS home_shots_on_target, away.shots_on_target AS away_shots_on_target,
                home.possession_percent AS home_possession_percent, away.possession_percent AS away_possession_percent,
                home.corners AS home_corners, away.corners AS away_corners,
                home.fouls AS home_fouls, away.fouls AS away_fouls,
                home.saves AS home_saves, away.saves AS away_saves
            FROM lmuml.matches m
            JOIN lmuml.match_statistics home
                ON home.match_id = m.id AND home.side = 'HOME' AND home.team_id = m.home_team_id
            JOIN lmuml.match_statistics away
                ON away.match_id = m.id AND away.side = 'AWAY' AND away.team_id = m.away_team_id
                AND away.captured_at = home.captured_at
            WHERE m.id = :matchId
            """;

    private final JdbcClient jdbc;

    MatchStatisticsQuery(DataSource dataSource) {
        jdbc = JdbcClient.create(dataSource);
    }

    Optional<MatchStatisticsResponse> find(UUID matchId) {
        return jdbc.sql(SELECT_COMPARISON).param("matchId", matchId)
                .query((row, index) -> new MatchStatisticsResponse(matchId,
                        row.getObject("captured_at", OffsetDateTime.class).toInstant(),
                        readTeam(row, "home_"), readTeam(row, "away_")))
                .optional();
    }

    private static TeamStatistics readTeam(ResultSet row, String prefix) throws SQLException {
        return new TeamStatistics(row.getObject(prefix + "shots_total", Integer.class),
                row.getObject(prefix + "shots_on_target", Integer.class),
                row.getBigDecimal(prefix + "possession_percent"),
                row.getObject(prefix + "corners", Integer.class), row.getObject(prefix + "fouls", Integer.class),
                row.getObject(prefix + "saves", Integer.class));
    }
}
