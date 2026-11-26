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

import pl.lmuml.football.apifootball.ApiFootballFixturePlayersSample.Player;
import pl.lmuml.football.apifootball.ApiFootballFixturePlayersSample.Statistics;
import pl.lmuml.football.matches.MatchEventSide;
import pl.lmuml.football.matches.MatchLineupPosition;

final class ApiFootballFixturePlayersImporter {

    private final JdbcClient jdbc;
    private final TransactionTemplate transaction;

    ApiFootballFixturePlayersImporter(DataSource dataSource, PlatformTransactionManager transactions) {
        jdbc = JdbcClient.create(dataSource);
        transaction = new TransactionTemplate(transactions);
    }

    void importSample(ApiFootballFixturePlayersSample sample) {
        transaction.executeWithoutResult(status -> {
            UUID matchId = lockMatch(sample.fixtureId());
            Participants participants = findParticipants(matchId);
            var home = playersFor(sample, participants.home().providerId());
            var away = playersFor(sample, participants.away().providerId());
            if (isUnchanged(matchId, participants, sample.capturedAt(), home, away)) return;

            saveSnapshot(matchId, participants, sample.capturedAt());
            jdbc.sql("DELETE FROM lmuml.match_player_statistics WHERE match_id = :matchId")
                    .param("matchId", matchId).update();
            savePlayers(matchId, MatchEventSide.HOME, home);
            savePlayers(matchId, MatchEventSide.AWAY, away);
        });
    }

    private UUID lockMatch(long fixtureId) {
        // Keep both catalog teams stable and serialize imports of this match until commit.
        return jdbc.sql("SELECT id FROM lmuml.matches WHERE api_football_id = :fixtureId FOR UPDATE")
                .param("fixtureId", fixtureId)
                .query(UUID.class).optional()
                .orElseThrow(() -> new IllegalArgumentException("Import this fixture before its player statistics."));
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

    private static List<Player> playersFor(ApiFootballFixturePlayersSample sample, long providerTeamId) {
        return sample.teams().stream().filter(team -> team.teamId() == providerTeamId)
                .findFirst().orElseThrow(() -> new IllegalArgumentException(
                        "Player statistics teams do not match the catalog fixture.")).players();
    }

    private boolean isUnchanged(UUID matchId, Participants participants, Instant capturedAt,
            List<Player> home, List<Player> away) {
        var storedCapture = jdbc.sql("""
                SELECT captured_at FROM lmuml.match_player_stat_snapshots
                WHERE match_id = :matchId AND home_team_id = :homeId AND away_team_id = :awayId
                """)
                .param("matchId", matchId)
                .param("homeId", participants.home().id())
                .param("awayId", participants.away().id())
                .query(OffsetDateTime.class).optional();
        if (storedCapture.isEmpty()) return false;
        int freshness = capturedAt.compareTo(storedCapture.orElseThrow().toInstant());
        if (freshness < 0 || (freshness == 0
                && (!home.equals(findPlayers(matchId, MatchEventSide.HOME))
                    || !away.equals(findPlayers(matchId, MatchEventSide.AWAY))))) {
            throw new IllegalStateException("Newer or conflicting fixture player statistics already exist.");
        }
        return freshness == 0;
    }

    private List<Player> findPlayers(UUID matchId, MatchEventSide side) {
        return jdbc.sql("""
                SELECT provider_player_id, name, shirt_number, position, minutes, rating, goals, assists,
                    shots_total, shots_on_target, passes_total, key_passes, tackles, saves
                FROM lmuml.match_player_statistics
                WHERE match_id = :matchId AND side = :side ORDER BY position_index
                """)
                .param("matchId", matchId)
                .param("side", side.name())
                .query((row, index) -> new Player(row.getLong("provider_player_id"), row.getString("name"),
                        row.getObject("shirt_number", Integer.class), MatchLineupPosition.valueOf(row.getString("position")),
                        new Statistics(row.getObject("minutes", Integer.class), row.getBigDecimal("rating"),
                                row.getObject("goals", Integer.class), row.getObject("assists", Integer.class),
                                row.getObject("shots_total", Integer.class), row.getObject("shots_on_target", Integer.class),
                                row.getObject("passes_total", Integer.class), row.getObject("key_passes", Integer.class),
                                row.getObject("tackles", Integer.class), row.getObject("saves", Integer.class))))
                .list();
    }

    private void saveSnapshot(UUID matchId, Participants participants, Instant capturedAt) {
        jdbc.sql("""
                INSERT INTO lmuml.match_player_stat_snapshots (match_id, captured_at, home_team_id, away_team_id)
                VALUES (:matchId, :capturedAt, :homeId, :awayId)
                ON CONFLICT (match_id) DO UPDATE SET captured_at = EXCLUDED.captured_at,
                    home_team_id = EXCLUDED.home_team_id, away_team_id = EXCLUDED.away_team_id
                """)
                .param("matchId", matchId)
                .param("capturedAt", capturedAt.atOffset(ZoneOffset.UTC))
                .param("homeId", participants.home().id())
                .param("awayId", participants.away().id())
                .update();
    }

    private void savePlayers(UUID matchId, MatchEventSide side, List<Player> players) {
        for (int position = 0; position < players.size(); position++) {
            Player player = players.get(position);
            Statistics statistics = player.statistics();
            jdbc.sql("""
                    INSERT INTO lmuml.match_player_statistics (match_id, side, position_index, provider_player_id,
                        name, shirt_number, position, minutes, rating, goals, assists, shots_total, shots_on_target,
                        passes_total, key_passes, tackles, saves)
                    VALUES (:matchId, :side, :index, :playerId, :name, :number, :position, :minutes, :rating,
                        :goals, :assists, :shots, :onTarget, :passes, :keyPasses, :tackles, :saves)
                    """)
                    .param("matchId", matchId)
                    .param("side", side.name())
                    .param("index", position)
                    .param("playerId", player.id())
                    .param("name", player.name())
                    .param("number", player.number(), Types.INTEGER)
                    .param("position", player.position().name())
                    .param("minutes", statistics.minutes(), Types.INTEGER)
                    .param("rating", statistics.rating(), Types.NUMERIC)
                    .param("goals", statistics.goals(), Types.INTEGER)
                    .param("assists", statistics.assists(), Types.INTEGER)
                    .param("shots", statistics.shotsTotal(), Types.INTEGER)
                    .param("onTarget", statistics.shotsOnTarget(), Types.INTEGER)
                    .param("passes", statistics.passesTotal(), Types.INTEGER)
                    .param("keyPasses", statistics.keyPasses(), Types.INTEGER)
                    .param("tackles", statistics.tackles(), Types.INTEGER)
                    .param("saves", statistics.saves(), Types.INTEGER)
                    .update();
        }
    }

    private record Team(UUID id, long providerId) {}

    private record Participants(Team home, Team away) {}
}
