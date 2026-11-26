package pl.lmuml.football.apifootball;

import java.sql.Types;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Objects;
import java.util.UUID;
import javax.sql.DataSource;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import pl.lmuml.football.apifootball.ApiFootballFixtureLineupsSample.Player;
import pl.lmuml.football.apifootball.ApiFootballFixtureLineupsSample.TeamLineup;
import pl.lmuml.football.matches.MatchLineupPosition;

import static pl.lmuml.football.apifootball.ApiFootballFixturePlayerData.canReplayRows;

final class ApiFootballFixtureLineupsImporter {

    private final JdbcClient jdbc;
    private final TransactionTemplate transaction;

    ApiFootballFixtureLineupsImporter(DataSource dataSource, PlatformTransactionManager transactions) {
        this.jdbc = JdbcClient.create(dataSource);
        this.transaction = new TransactionTemplate(transactions);
    }

    void importSample(ApiFootballFixtureLineupsSample sample) {
        transaction.executeWithoutResult(status -> {
            UUID matchId = lockMatch(sample.fixtureId());
            Participants participants = findParticipants(matchId);
            TeamLineup home = lineupFor(sample, participants.home().providerId());
            TeamLineup away = lineupFor(sample, participants.away().providerId());
            if (isUnchanged(matchId, participants, sample.capturedAt(), home, away)) return;

            var capturedAt = sample.capturedAt().atOffset(ZoneOffset.UTC);
            saveLineup(matchId, Side.HOME, participants.home().id(), capturedAt, home);
            saveLineup(matchId, Side.AWAY, participants.away().id(), capturedAt, away);
            jdbc.sql("DELETE FROM lmuml.match_lineup_players WHERE match_id = :matchId")
                    .param("matchId", matchId).update();
            savePlayers(matchId, Side.HOME, true, home.starters());
            savePlayers(matchId, Side.HOME, false, home.substitutes());
            savePlayers(matchId, Side.AWAY, true, away.starters());
            savePlayers(matchId, Side.AWAY, false, away.substitutes());
        });
    }

    private UUID lockMatch(long fixtureId) {
        // Serialize imports and keep the catalog participants stable until commit.
        return jdbc.sql("SELECT id FROM lmuml.matches WHERE api_football_id = :fixtureId FOR UPDATE")
                .param("fixtureId", fixtureId)
                .query(UUID.class)
                .optional()
                .orElseThrow(() -> new IllegalArgumentException("Import this fixture before its lineups."));
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

    private static TeamLineup lineupFor(ApiFootballFixtureLineupsSample sample, long providerTeamId) {
        return sample.teams().stream().filter(team -> team.teamId() == providerTeamId).findFirst()
                .orElseThrow(() -> new IllegalArgumentException("Lineup teams do not match the catalog fixture."));
    }

    private boolean isUnchanged(UUID matchId, Participants participants, Instant capturedAt,
            TeamLineup home, TeamLineup away) {
        var stored = jdbc.sql("""
                SELECT side, captured_at, formation, coach_name FROM lmuml.match_lineups
                WHERE match_id = :matchId
                    AND ((side = 'HOME' AND team_id = :homeId) OR (side = 'AWAY' AND team_id = :awayId))
                """)
                .param("matchId", matchId)
                .param("homeId", participants.home().id())
                .param("awayId", participants.away().id())
                .query((row, index) -> new StoredLineup(Side.valueOf(row.getString("side")),
                        row.getObject("captured_at", OffsetDateTime.class).toInstant(), row.getString("formation"),
                        row.getString("coach_name")))
                .list();

        // Only compare freshness with a snapshot for the same pairing.
        if (stored.size() != 2) return false;
        boolean unchanged = true;
        for (var lineup : stored) {
            int freshness = capturedAt.compareTo(lineup.capturedAt());
            if (freshness < 0) {
                throw new IllegalStateException("Newer or conflicting fixture lineups already exist.");
            }
            if (freshness > 0) {
                unchanged = false;
                continue;
            }
            TeamLineup incoming = lineup.side() == Side.HOME ? home : away;
            boolean sideUnchanged = isUnchangedReplay(matchId, lineup, incoming);
            unchanged = unchanged && sideUnchanged;
        }
        return unchanged;
    }

    private boolean isUnchangedReplay(UUID matchId, StoredLineup stored, TeamLineup incoming) {
        List<Player> starters = findPlayers(matchId, stored.side(), true);
        List<Player> substitutes = findPlayers(matchId, stored.side(), false);
        if (!Objects.equals(stored.formation(), incoming.formation())
                || !Objects.equals(stored.coachName(), incoming.coachName())
                || !canReplayRows(starters, incoming.starters(), Player::matchesForReplay)
                || !canReplayRows(substitutes, incoming.substitutes(), Player::matchesForReplay)) {
            throw new IllegalStateException("Newer or conflicting fixture lineups already exist.");
        }
        // An otherwise identical sample can fill IDs missing from a legacy import.
        return starters.equals(incoming.starters()) && substitutes.equals(incoming.substitutes());
    }

    private List<Player> findPlayers(UUID matchId, Side side, boolean starter) {
        return jdbc.sql("""
                SELECT player_name, shirt_number, position, grid_row, grid_column, provider_player_id
                FROM lmuml.match_lineup_players
                WHERE match_id = :matchId AND side = :side AND starter = :starter ORDER BY position_index
                """)
                .param("matchId", matchId)
                .param("side", side.name())
                .param("starter", starter)
                .query((row, index) -> new Player(row.getString("player_name"),
                        row.getObject("shirt_number", Integer.class),
                        MatchLineupPosition.valueOf(row.getString("position")),
                        row.getObject("grid_row", Integer.class), row.getObject("grid_column", Integer.class),
                        row.getObject("provider_player_id", Long.class)))
                .list();
    }

    private void saveLineup(UUID matchId, Side side, UUID teamId, OffsetDateTime capturedAt, TeamLineup lineup) {
        jdbc.sql("""
                INSERT INTO lmuml.match_lineups (match_id, side, team_id, captured_at, formation, coach_name)
                VALUES (:matchId, :side, :teamId, :capturedAt, :formation, :coachName)
                ON CONFLICT (match_id, side) DO UPDATE SET team_id = EXCLUDED.team_id,
                    captured_at = EXCLUDED.captured_at, formation = EXCLUDED.formation, coach_name = EXCLUDED.coach_name
                """)
                .param("matchId", matchId)
                .param("side", side.name())
                .param("teamId", teamId)
                .param("capturedAt", capturedAt)
                .param("formation", lineup.formation(), Types.VARCHAR)
                .param("coachName", lineup.coachName(), Types.VARCHAR)
                .update();
    }

    private void savePlayers(UUID matchId, Side side, boolean starter, List<Player> players) {
        for (int positionIndex = 0; positionIndex < players.size(); positionIndex++) {
            Player player = players.get(positionIndex);
            jdbc.sql("""
                    INSERT INTO lmuml.match_lineup_players (match_id, side, starter, position_index,
                        player_name, shirt_number, position, grid_row, grid_column, provider_player_id)
                    VALUES (:matchId, :side, :starter, :index, :name, :number, :position, :gridRow, :gridColumn, :playerId)
                    """)
                    .param("matchId", matchId)
                    .param("side", side.name())
                    .param("starter", starter)
                    .param("index", positionIndex)
                    .param("name", player.name())
                    .param("number", player.number(), Types.INTEGER)
                    .param("position", player.position().name())
                    .param("gridRow", player.gridRow(), Types.INTEGER)
                    .param("gridColumn", player.gridColumn(), Types.INTEGER)
                    .param("playerId", player.providerPlayerId(), Types.BIGINT)
                    .update();
        }
    }

    private record Team(UUID id, long providerId) {}

    private record Participants(Team home, Team away) {}

    private record StoredLineup(Side side, Instant capturedAt, String formation, String coachName) {}

    private enum Side { HOME, AWAY }
}
