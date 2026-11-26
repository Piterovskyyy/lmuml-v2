package pl.lmuml.bettingrounds;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import javax.sql.DataSource;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Repository;

import static pl.lmuml.bettingrounds.AdminRoundModels.*;
import static pl.lmuml.bettingrounds.FixtureGroups.*;

@Repository
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
class RoundStore {

    private static final long CHAMPIONS_LEAGUE_PROVIDER_ID = 2;

    private final JdbcClient jdbc;

    RoundStore(DataSource source) {
        this.jdbc = JdbcClient.create(source);
    }

    List<Season> seasons() {
        return jdbc.sql("SELECT code, name FROM lmuml.seasons ORDER BY start_year DESC, name, code")
                .query((row, index) -> new Season(row.getString("code"), row.getString("name")))
                .list();
    }

    Optional<SeasonRow> season(String code) {
        return jdbc.sql("""
                SELECT s.id, s.code, s.name, c.api_football_id
                FROM lmuml.seasons s
                JOIN lmuml.competitions c ON c.id = s.competition_id
                WHERE s.code = :code
                """)
                .param("code", code)
                .query((row, index) -> new SeasonRow(row.getObject("id", UUID.class),
                        new Season(row.getString("code"), row.getString("name")),
                        row.getLong("api_football_id") == CHAMPIONS_LEAGUE_PROVIDER_ID))
                .optional();
    }

    List<Fixture> fixtures(UUID seasonId) {
        return jdbc.sql("""
                SELECT m.id, m.kickoff_at, m.api_round, m.provider_status, m.home_team_id, m.away_team_id,
                    home.name AS home_team, away.name AS away_team
                FROM lmuml.matches m
                JOIN lmuml.teams home ON home.id = m.home_team_id
                JOIN lmuml.teams away ON away.id = m.away_team_id
                WHERE m.season_id = :seasonId
                ORDER BY m.kickoff_at NULLS LAST, m.id
                """)
                .param("seasonId", seasonId)
                .query((row, index) -> new Fixture(new Match(row.getObject("id", UUID.class),
                        instant(row, "kickoff_at"), row.getString("home_team"), row.getString("away_team")),
                        row.getObject("home_team_id", UUID.class), row.getObject("away_team_id", UUID.class),
                        row.getString("api_round"), row.getString("provider_status")))
                .list();
    }

    List<RoundRow> rounds(UUID seasonId) {
        return jdbc.sql("""
                SELECT id, season_id, number, name, published_at FROM lmuml.betting_rounds
                WHERE season_id = :seasonId ORDER BY number
                """)
                .param("seasonId", seasonId)
                .query(RoundStore::roundRow)
                .list();
    }

    Optional<RoundRow> lockRound(UUID id) {
        return jdbc.sql("""
                SELECT id, season_id, number, name, published_at FROM lmuml.betting_rounds
                WHERE id = :id FOR UPDATE
                """)
                .param("id", id)
                .query(RoundStore::roundRow)
                .optional();
    }

    List<SavedGroup> groups(UUID seasonId) {
        return jdbc.sql("""
                SELECT g.group_key, g.tournament_round, g.betting_round_id, m.match_id
                FROM lmuml.betting_round_groups g
                LEFT JOIN lmuml.betting_round_matches m USING (season_id, group_key)
                WHERE g.season_id = :seasonId
                ORDER BY g.group_key, m.match_id
                """)
                .param("seasonId", seasonId)
                .query(rows -> {
                    var groups = new LinkedHashMap<String, SavedGroup>();
                    while (rows.next()) {
                        String key = rows.getString("group_key");
                        var group = groups.get(key);
                        if (group == null) {
                            group = new SavedGroup(key, rows.getString("tournament_round"),
                                    rows.getObject("betting_round_id", UUID.class), new ArrayList<>());
                            groups.put(key, group);
                        }
                        UUID matchId = rows.getObject("match_id", UUID.class);
                        if (matchId != null) {
                            group.matchIds().add(matchId);
                        }
                    }
                    return List.copyOf(groups.values());
                });
    }

    RoundRow insertRound(UUID seasonId, int number) {
        return jdbc.sql("""
                INSERT INTO lmuml.betting_rounds (id, season_id, number)
                VALUES (:id, :seasonId, :number)
                RETURNING id, season_id, number, name, published_at
                """)
                .param("id", UUID.randomUUID())
                .param("seasonId", seasonId)
                .param("number", number)
                .query(RoundStore::roundRow)
                .single();
    }

    void insertGroup(RoundRow round, Group group) {
        jdbc.sql("""
                INSERT INTO lmuml.betting_round_groups (season_id, group_key, tournament_round, betting_round_id)
                VALUES (:seasonId, :groupKey, :tournamentRound, :roundId)
                """)
                .param("seasonId", round.seasonId())
                .param("groupKey", group.key())
                .param("tournamentRound", group.tournamentRound())
                .param("roundId", round.id())
                .update();
        for (var match : group.matches()) {
            insertMatch(round.seasonId(), group.key(), match.id());
        }
    }

    void insertMatch(UUID seasonId, String groupKey, UUID matchId) {
        jdbc.sql("""
                INSERT INTO lmuml.betting_round_matches (match_id, season_id, group_key)
                VALUES (:matchId, :seasonId, :groupKey)
                """)
                .param("seasonId", seasonId)
                .param("groupKey", groupKey)
                .param("matchId", matchId)
                .update();
    }

    RoundRow publish(RoundRow round) {
        return jdbc.sql("""
                UPDATE lmuml.betting_rounds SET published_at = CURRENT_TIMESTAMP WHERE id = :id
                RETURNING id, season_id, number, name, published_at
                """)
                .param("id", round.id())
                .query(RoundStore::roundRow)
                .single();
    }

    void delete(UUID id) {
        jdbc.sql("""
                DELETE FROM lmuml.betting_round_matches m
                USING lmuml.betting_round_groups g
                WHERE g.betting_round_id = :id AND g.season_id = m.season_id AND g.group_key = m.group_key
                """).param("id", id).update();
        jdbc.sql("DELETE FROM lmuml.betting_round_groups WHERE betting_round_id = :id").param("id", id).update();
        jdbc.sql("DELETE FROM lmuml.betting_rounds WHERE id = :id").param("id", id).update();
    }

    private static RoundRow roundRow(ResultSet row, int index) throws SQLException {
        return new RoundRow(row.getObject("id", UUID.class), row.getObject("season_id", UUID.class),
                row.getInt("number"), row.getString("name"), instant(row, "published_at"));
    }

    private static Instant instant(ResultSet row, String column) throws SQLException {
        OffsetDateTime time = row.getObject(column, OffsetDateTime.class);
        return time == null ? null : time.toInstant();
    }

    record SeasonRow(UUID id, Season season, boolean championsLeague) {}

    record RoundRow(UUID id, UUID seasonId, int number, String name, Instant publishedAt) {}
}
