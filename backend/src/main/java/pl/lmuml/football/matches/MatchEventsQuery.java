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

import pl.lmuml.football.matches.MatchEventsResponse.Event;

@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class MatchEventsQuery {

    private static final String SELECT_TIMELINE = """
            SELECT s.captured_at, e.minute, e.added_time, e.side, e.kind, e.player_name, e.related_player_name
            FROM lmuml.matches m
            JOIN lmuml.match_event_snapshots s
                ON s.match_id = m.id AND s.home_team_id = m.home_team_id AND s.away_team_id = m.away_team_id
            LEFT JOIN lmuml.match_events e ON e.match_id = s.match_id
            WHERE m.id = :matchId
            ORDER BY e.position
            """;

    private final JdbcClient jdbc;

    MatchEventsQuery(DataSource dataSource) {
        jdbc = JdbcClient.create(dataSource);
    }

    Optional<MatchEventsResponse> find(UUID matchId) {
        ResultSetExtractor<Optional<MatchEventsResponse>> extract = rows -> readTimeline(matchId, rows);
        return jdbc.sql(SELECT_TIMELINE).param("matchId", matchId).query(extract);
    }

    private static Optional<MatchEventsResponse> readTimeline(UUID matchId, ResultSet rows) throws SQLException {
        if (!rows.next()) {
            return Optional.empty();
        }
        var capturedAt = rows.getObject("captured_at", OffsetDateTime.class).toInstant();
        var events = new ArrayList<Event>();
        do {
            String kind = rows.getString("kind");
            if (kind != null) {
                String side = rows.getString("side");
                events.add(new Event(rows.getInt("minute"), rows.getObject("added_time", Integer.class),
                        side == null ? null : MatchEventSide.valueOf(side), MatchEventKind.valueOf(kind),
                        rows.getString("player_name"), rows.getString("related_player_name")));
            }
        } while (rows.next());
        return Optional.of(new MatchEventsResponse(matchId, capturedAt, List.copyOf(events)));
    }
}
