package pl.lmuml.football.apifootball;

import java.sql.Types;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import pl.lmuml.football.apifootball.dto.ApiFootballStanding;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.json.JsonMapper;

final class ApiFootballStandingsImporter {

    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final ApiFootballSnapshotStore snapshots;
    private final TransactionTemplate transaction;

    ApiFootballStandingsImporter(DataSource dataSource, PlatformTransactionManager transactions, JsonMapper json) {
        this.jdbc = JdbcClient.create(dataSource);
        this.json = json.rebuild().disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .disable(MapperFeature.ALLOW_COERCION_OF_SCALARS).build();
        this.snapshots = new ApiFootballSnapshotStore(dataSource, transactions, json);
        this.transaction = new TransactionTemplate(transactions);
    }

    int importSnapshot(ApiFootballSnapshot snapshot) {
        if (snapshot.endpoint() != ApiFootballSnapshot.Endpoint.STANDINGS) {
            throw new IllegalArgumentException("A standings snapshot is required.");
        }
        List<ApiFootballStanding.Row> rows = decodeRows(snapshot);
        return transaction.execute(status -> {
            // Serialize writes for this league and season and reject older samples.
            snapshots.save(snapshot);
            UUID seasonId = jdbc.sql("""
                    SELECT season.id FROM lmuml.seasons season
                    JOIN lmuml.competitions competition ON competition.id = season.competition_id
                    WHERE competition.api_football_id = :league AND season.start_year = :year
                    """)
                    .param("league", snapshot.leagueId()).param("year", snapshot.season())
                    .query(UUID.class).optional()
                    .orElseThrow(() -> new IllegalStateException("Import the league and fixture catalog before standings."));
            Map<Long, UUID> teamIds = catalogTeams(seasonId);
            if (rows.stream().anyMatch(row -> !teamIds.containsKey(row.team().id()))) {
                throw new IllegalArgumentException("Standing refers to a team absent from the season catalog.");
            }
            int previousCount = jdbc.sql("SELECT count(*) FROM lmuml.season_standings WHERE season_id = :seasonId")
                    .param("seasonId", seasonId).query(Integer.class).single();
            if (rows.size() < previousCount) {
                throw new IllegalArgumentException("Standings sample has fewer teams than the stored table.");
            }
            jdbc.sql("DELETE FROM lmuml.season_standings WHERE season_id = :seasonId")
                    .param("seasonId", seasonId).update();
            for (var row : rows) {
                var tally = row.all();
                jdbc.sql("""
                        INSERT INTO lmuml.season_standings
                            (season_id, team_id, position, played, won, drawn, lost,
                             goals_for, goals_against, goal_difference, points, form, captured_at)
                        VALUES (:seasonId, :teamId, :position, :played, :won, :drawn, :lost,
                                :goalsFor, :goalsAgainst, :goalDifference, :points, :form, :capturedAt)
                        """)
                        .param("seasonId", seasonId).param("teamId", teamIds.get(row.team().id()))
                        .param("position", row.rank()).param("played", tally.played())
                        .param("won", tally.win()).param("drawn", tally.draw()).param("lost", tally.lose())
                        .param("goalsFor", tally.goals().goalsFor()).param("goalsAgainst", tally.goals().against())
                        .param("goalDifference", row.goalsDiff()).param("points", row.points())
                        .param("form", row.form(), Types.VARCHAR)
                        .param("capturedAt", snapshot.capturedAt().atOffset(ZoneOffset.UTC))
                        .update();
            }
            return rows.size();
        });
    }

    private Map<Long, UUID> catalogTeams(UUID seasonId) {
        return jdbc.sql("""
                SELECT team.api_football_id, team.id
                FROM lmuml.teams team
                JOIN (
                    SELECT home_team_id AS team_id FROM lmuml.matches WHERE season_id = :seasonId
                    UNION
                    SELECT away_team_id AS team_id FROM lmuml.matches WHERE season_id = :seasonId
                ) participants ON participants.team_id = team.id
                """)
                .param("seasonId", seasonId)
                .query(result -> {
                    var teams = new HashMap<Long, UUID>();
                    while (result.next()) {
                        teams.put(result.getLong("api_football_id"), result.getObject("id", UUID.class));
                    }
                    return teams;
                });
    }

    private List<ApiFootballStanding.Row> decodeRows(ApiFootballSnapshot snapshot) {
        List<ApiFootballStanding> items;
        try {
            items = json.convertValue(snapshot.payload().get("response"), new TypeReference<>() {});
        } catch (JacksonException | IllegalArgumentException invalid) {
            throw new IllegalArgumentException("Standings sample fields do not match the expected types.");
        }
        var league = items.size() == 1 && items.getFirst() != null ? items.getFirst().league() : null;
        if (league == null || league.standings() == null || league.standings().size() != 1) {
            throw new IllegalArgumentException("Expected exactly one standings group.");
        }
        List<ApiFootballStanding.Row> rows = league.standings().getFirst();
        if (rows == null || rows.isEmpty()) {
            throw new IllegalArgumentException("Standings group must contain teams.");
        }
        var ranks = new HashSet<Integer>();
        var teams = new HashSet<Long>();
        for (var row : rows) {
            if (row == null || row.rank() == null || row.rank() < 1 || row.rank() > rows.size()
                    || !ranks.add(row.rank()) || row.team() == null
                    || row.team().id() == null || row.team().id() <= 0 || !teams.add(row.team().id())
                    || row.points() == null || row.goalsDiff() == null || !validTally(row.all(), row.goalsDiff())) {
                throw new IllegalArgumentException("Standings group contains invalid or duplicate rows.");
            }
        }
        return rows;
    }

    private static boolean validTally(ApiFootballStanding.Tally tally, int goalDifference) {
        return tally != null && nonnegative(tally.played()) && nonnegative(tally.win())
                && nonnegative(tally.draw()) && nonnegative(tally.lose())
                && tally.played() == (long) tally.win() + tally.draw() + tally.lose()
                && tally.goals() != null && nonnegative(tally.goals().goalsFor()) && nonnegative(tally.goals().against())
                && goalDifference == tally.goals().goalsFor() - tally.goals().against();
    }

    private static boolean nonnegative(Integer value) {
        return value != null && value >= 0;
    }
}
