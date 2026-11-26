package pl.lmuml.football.apifootball;

import java.sql.Types;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.UUID;
import javax.sql.DataSource;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import pl.lmuml.football.matches.MatchEventKind;
import pl.lmuml.football.matches.MatchEventSide;

import static pl.lmuml.football.apifootball.ApiFootballFixturePlayerData.canReplayRows;

final class ApiFootballFixtureEventsImporter {

    private final JdbcClient jdbc;
    private final TransactionTemplate transaction;

    ApiFootballFixtureEventsImporter(DataSource dataSource, PlatformTransactionManager transactions) {
        this.jdbc = JdbcClient.create(dataSource);
        this.transaction = new TransactionTemplate(transactions);
    }

    void importSample(ApiFootballFixtureEventsSample sample) {
        transaction.executeWithoutResult(status -> {
            UUID matchId = lockMatch(sample.fixtureId());
            Participants participants = findParticipants(matchId);
            var events = sample.events().stream().map(event -> new StoredEvent(event.minute(), event.addedTime(),
                    participants.side(event.providerTeamId()), event.kind(), event.playerName(),
                    event.relatedPlayerName(), event.providerPlayerId(), event.relatedProviderPlayerId())).toList();

            var existing = findSnapshot(matchId);
            if (existing != null && existing.homeId().equals(participants.home().id())
                    && existing.awayId().equals(participants.away().id())) {
                int freshness = sample.capturedAt().compareTo(existing.capturedAt());
                if (freshness < 0) {
                    throw new IllegalStateException("Newer or conflicting fixture events already exist.");
                }
                if (freshness == 0) {
                    List<StoredEvent> stored = findEvents(matchId);
                    if (stored.equals(events)) return;
                    // An otherwise identical sample can fill IDs missing from a legacy import.
                    if (!canReplayRows(stored, events, StoredEvent::matchesForReplay)) {
                        throw new IllegalStateException("Newer or conflicting fixture events already exist.");
                    }
                }
            }

            replaceSnapshot(matchId, participants, sample.capturedAt(), events);
        });
    }

    private UUID lockMatch(long fixtureId) {
        // Serialize imports and keep the catalog participants stable until commit.
        return jdbc.sql("SELECT id FROM lmuml.matches WHERE api_football_id = :fixtureId FOR UPDATE")
                .param("fixtureId", fixtureId)
                .query(UUID.class)
                .optional()
                .orElseThrow(() -> new IllegalArgumentException("Import this fixture before its events."));
    }

    private Participants findParticipants(UUID matchId) {
        return jdbc.sql("""
                SELECT home.id AS home_id, home.api_football_id AS home_provider_id,
                       away.id AS away_id, away.api_football_id AS away_provider_id
                FROM lmuml.matches m
                JOIN lmuml.teams home ON home.id = m.home_team_id
                JOIN lmuml.teams away ON away.id = m.away_team_id
                WHERE m.id = :matchId
                """)
                .param("matchId", matchId)
                .query((row, index) -> new Participants(
                        new Team(row.getObject("home_id", UUID.class), row.getLong("home_provider_id")),
                        new Team(row.getObject("away_id", UUID.class), row.getLong("away_provider_id"))))
                .single();
    }

    private Snapshot findSnapshot(UUID matchId) {
        return jdbc.sql("""
                SELECT captured_at, home_team_id, away_team_id FROM lmuml.match_event_snapshots
                WHERE match_id = :matchId
                """)
                .param("matchId", matchId)
                .query((row, index) -> new Snapshot(row.getObject("captured_at", OffsetDateTime.class).toInstant(),
                        row.getObject("home_team_id", UUID.class), row.getObject("away_team_id", UUID.class)))
                .optional().orElse(null);
    }

    private List<StoredEvent> findEvents(UUID matchId) {
        return jdbc.sql("""
                SELECT minute, added_time, side, kind, player_name, related_player_name,
                    provider_player_id, related_provider_player_id
                FROM lmuml.match_events WHERE match_id = :matchId ORDER BY position
                """)
                .param("matchId", matchId)
                .query((row, index) -> {
                    String side = row.getString("side");
                    return new StoredEvent(row.getInt("minute"), row.getObject("added_time", Integer.class),
                            side == null ? null : MatchEventSide.valueOf(side),
                            MatchEventKind.valueOf(row.getString("kind")),
                            row.getString("player_name"), row.getString("related_player_name"),
                            row.getObject("provider_player_id", Long.class),
                            row.getObject("related_provider_player_id", Long.class));
                }).list();
    }

    private void replaceSnapshot(UUID matchId, Participants participants, Instant capturedAt, List<StoredEvent> events) {
        jdbc.sql("""
                INSERT INTO lmuml.match_event_snapshots (match_id, captured_at, home_team_id, away_team_id)
                VALUES (:matchId, :capturedAt, :homeId, :awayId)
                ON CONFLICT (match_id) DO UPDATE SET captured_at = EXCLUDED.captured_at,
                    home_team_id = EXCLUDED.home_team_id, away_team_id = EXCLUDED.away_team_id
                """)
                .param("matchId", matchId)
                .param("capturedAt", capturedAt.atOffset(ZoneOffset.UTC))
                .param("homeId", participants.home().id())
                .param("awayId", participants.away().id())
                .update();
        jdbc.sql("DELETE FROM lmuml.match_events WHERE match_id = :matchId").param("matchId", matchId).update();
        for (int position = 0; position < events.size(); position++) {
            StoredEvent event = events.get(position);
            jdbc.sql("""
                    INSERT INTO lmuml.match_events
                        (match_id, position, minute, added_time, side, kind, player_name, related_player_name,
                         provider_player_id, related_provider_player_id)
                    VALUES (:matchId, :position, :minute, :extra, :side, :kind, :player, :related, :playerId, :relatedId)
                    """)
                    .param("matchId", matchId)
                    .param("position", position)
                    .param("minute", event.minute())
                    .param("extra", event.addedTime(), Types.INTEGER)
                    .param("side", event.side() == null ? null : event.side().name(), Types.VARCHAR)
                    .param("kind", event.kind().name())
                    .param("player", event.playerName(), Types.VARCHAR)
                    .param("related", event.relatedPlayerName(), Types.VARCHAR)
                    .param("playerId", event.providerPlayerId(), Types.BIGINT)
                    .param("relatedId", event.relatedProviderPlayerId(), Types.BIGINT)
                    .update();
        }
    }

    private record Team(UUID id, long providerId) {}

    private record Participants(Team home, Team away) {
        MatchEventSide side(Long teamId) {
            if (teamId == null) return null;
            if (teamId == home.providerId()) return MatchEventSide.HOME;
            if (teamId == away.providerId()) return MatchEventSide.AWAY;
            throw new IllegalArgumentException("Event team does not match the catalog fixture.");
        }
    }

    private record Snapshot(Instant capturedAt, UUID homeId, UUID awayId) {}

    private record StoredEvent(int minute, Integer addedTime, MatchEventSide side, MatchEventKind kind,
                               String playerName, String relatedPlayerName, Long providerPlayerId,
                               Long relatedProviderPlayerId) {
        boolean matchesForReplay(StoredEvent incoming) {
            Long playerId = providerPlayerId == null ? incoming.providerPlayerId : providerPlayerId;
            Long relatedId = relatedProviderPlayerId == null ? incoming.relatedProviderPlayerId : relatedProviderPlayerId;
            return incoming.equals(new StoredEvent(minute, addedTime, side, kind, playerName, relatedPlayerName,
                    playerId, relatedId));
        }
    }
}
