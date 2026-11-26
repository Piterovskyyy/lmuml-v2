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

import pl.lmuml.football.matches.MatchLineupsResponse.Player;
import pl.lmuml.football.matches.MatchLineupsResponse.Substitution;
import pl.lmuml.football.matches.MatchLineupsResponse.TeamLineup;

@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class MatchLineupsQuery {

    private static final String SELECT_LINEUPS = """
            SELECT home.captured_at, home.formation AS home_formation, home.coach_name AS home_coach_name,
                away.formation AS away_formation, away.coach_name AS away_coach_name,
                p.side, p.starter, p.player_name, p.shirt_number, p.position, p.grid_row, p.grid_column,
                stats.rating, stats.goals, stats.assists,
                sub_on.minute AS on_minute, sub_on.added_time AS on_added_time,
                sub_off.minute AS off_minute, sub_off.added_time AS off_added_time
            FROM lmuml.matches m
            JOIN lmuml.match_lineups home
                ON home.match_id = m.id AND home.side = 'HOME' AND home.team_id = m.home_team_id
            JOIN lmuml.match_lineups away
                ON away.match_id = m.id AND away.side = 'AWAY' AND away.team_id = m.away_team_id
                AND away.captured_at = home.captured_at
            JOIN lmuml.match_lineup_players p ON p.match_id = m.id
            LEFT JOIN lmuml.match_player_stat_snapshots stat_snapshot
                ON stat_snapshot.match_id = m.id
                AND stat_snapshot.home_team_id = m.home_team_id AND stat_snapshot.away_team_id = m.away_team_id
            LEFT JOIN lmuml.match_player_statistics stats
                ON stats.match_id = stat_snapshot.match_id
                AND stats.side = p.side AND stats.provider_player_id = p.provider_player_id
            LEFT JOIN lmuml.match_event_snapshots event_snapshot
                ON event_snapshot.match_id = m.id
                AND event_snapshot.home_team_id = m.home_team_id AND event_snapshot.away_team_id = m.away_team_id
            LEFT JOIN LATERAL (
                SELECT e.minute, e.added_time FROM lmuml.match_events e
                WHERE e.match_id = event_snapshot.match_id AND e.side = p.side AND e.kind = 'SUBSTITUTION'
                    AND e.related_provider_player_id = p.provider_player_id
                ORDER BY e.minute, coalesce(e.added_time, 0), e.position
                LIMIT 1
            ) sub_on ON TRUE
            LEFT JOIN LATERAL (
                SELECT e.minute, e.added_time FROM lmuml.match_events e
                WHERE e.match_id = event_snapshot.match_id AND e.side = p.side AND e.kind = 'SUBSTITUTION'
                    AND e.provider_player_id = p.provider_player_id
                ORDER BY e.minute, coalesce(e.added_time, 0), e.position
                LIMIT 1
            ) sub_off ON TRUE
            WHERE m.id = :matchId
            ORDER BY p.side, p.starter DESC, p.position_index
            """;

    private final JdbcClient jdbc;

    MatchLineupsQuery(DataSource dataSource) {
        jdbc = JdbcClient.create(dataSource);
    }

    Optional<MatchLineupsResponse> find(UUID matchId) {
        ResultSetExtractor<Optional<MatchLineupsResponse>> extract = rows -> readLineups(matchId, rows);
        return jdbc.sql(SELECT_LINEUPS).param("matchId", matchId).query(extract);
    }

    private static Optional<MatchLineupsResponse> readLineups(UUID matchId, ResultSet rows) throws SQLException {
        if (!rows.next()) return Optional.empty();

        var capturedAt = rows.getObject("captured_at", OffsetDateTime.class).toInstant();
        var home = new TeamLineupBuilder(rows, "home_");
        var away = new TeamLineupBuilder(rows, "away_");
        do {
            TeamLineupBuilder team = "HOME".equals(rows.getString("side")) ? home : away;
            team.addPlayer(rows);
        } while (rows.next());

        if (home.starters.isEmpty() || away.starters.isEmpty()) return Optional.empty();
        return Optional.of(new MatchLineupsResponse(matchId, capturedAt, home.toLineup(), away.toLineup()));
    }

    private static Substitution readSubstitution(ResultSet rows, String prefix) throws SQLException {
        Integer minute = rows.getObject(prefix + "minute", Integer.class);
        return minute == null ? null : new Substitution(minute, rows.getObject(prefix + "added_time", Integer.class));
    }

    private static final class TeamLineupBuilder {
        private final String formation;
        private final String coachName;
        private final List<Player> starters = new ArrayList<>();
        private final List<Player> substitutes = new ArrayList<>();

        private TeamLineupBuilder(ResultSet rows, String prefix) throws SQLException {
            formation = rows.getString(prefix + "formation");
            coachName = rows.getString(prefix + "coach_name");
        }

        private void addPlayer(ResultSet rows) throws SQLException {
            var player = new Player(rows.getString("player_name"), rows.getObject("shirt_number", Integer.class),
                    MatchLineupPosition.valueOf(rows.getString("position")), rows.getObject("grid_row", Integer.class),
                    rows.getObject("grid_column", Integer.class), rows.getBigDecimal("rating"),
                    rows.getObject("goals", Integer.class), rows.getObject("assists", Integer.class),
                    readSubstitution(rows, "on_"), readSubstitution(rows, "off_"));
            List<Player> selection = rows.getBoolean("starter") ? starters : substitutes;
            selection.add(player);
        }

        private TeamLineup toLineup() {
            return new TeamLineup(formation, coachName, List.copyOf(starters), List.copyOf(substitutes));
        }
    }
}
