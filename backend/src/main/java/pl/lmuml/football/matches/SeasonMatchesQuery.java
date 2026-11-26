package pl.lmuml.football.matches;

import java.sql.ResultSet;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.UUID;
import javax.sql.DataSource;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import pl.lmuml.football.matches.SeasonBettingRoundsResponse.BettingRound;

import static pl.lmuml.football.matches.SeasonMatchesResponse.*;

@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class SeasonMatchesQuery {

    private static final String SEASON_COLUMNS = """
            s.id AS season_id, s.code AS season_code, s.name AS season_name, s.start_year,
                c.id AS competition_id, c.code AS competition_code, c.name AS competition_name,
                c.logo_url AS competition_logo_url""";

    private static final String MATCH_COLUMNS = """
            m.id AS match_id, m.api_round, m.kickoff_at, m.provider_status,
                m.elapsed_minutes, m.extra_minutes, m.home_winner, m.away_winner,
                m.home_goals, m.away_goals, m.halftime_home, m.halftime_away,
                m.fulltime_home, m.fulltime_away, m.extratime_home, m.extratime_away,
                m.penalty_home, m.penalty_away,
                h.id AS home_team_id, h.name AS home_team_name, h.logo_url AS home_team_logo_url,
                a.id AS away_team_id, a.name AS away_team_name, a.logo_url AS away_team_logo_url""";

    private static final String TEAM_JOINS = """
            LEFT JOIN lmuml.teams h ON h.id = m.home_team_id
            LEFT JOIN lmuml.teams a ON a.id = m.away_team_id""";

    private static final String SELECT_SEASON_MATCHES = """
            SELECT %s, snapshot.captured_at AS fixtures_captured_at, %s
            FROM lmuml.seasons s
            JOIN lmuml.competitions c ON c.id = s.competition_id
            LEFT JOIN lmuml.fixture_snapshot_times snapshot
                ON snapshot.league_id = c.api_football_id AND snapshot.season = s.start_year
            LEFT JOIN lmuml.matches m ON m.season_id = s.id
            %s
            WHERE s.code = :seasonCode
            ORDER BY m.kickoff_at ASC NULLS LAST, m.id ASC
            """.formatted(SEASON_COLUMNS, MATCH_COLUMNS, TEAM_JOINS);

    private static final String SELECT_PUBLISHED_ROUNDS = """
            SELECT %s, br.id AS round_id, br.number AS round_number, br.name AS round_name, br.published_at,
                (g.group_key = 'final' AND rm.match_id IS NULL) AS pending_final_group, %s
            FROM lmuml.seasons s
            JOIN lmuml.competitions c ON c.id = s.competition_id
            LEFT JOIN lmuml.betting_rounds br ON br.season_id = s.id AND br.published_at IS NOT NULL
            LEFT JOIN lmuml.betting_round_groups g ON g.season_id = s.id AND g.betting_round_id = br.id
            LEFT JOIN lmuml.betting_round_matches rm ON rm.season_id = g.season_id AND rm.group_key = g.group_key
            LEFT JOIN lmuml.matches m ON m.season_id = rm.season_id AND m.id = rm.match_id
            %s
            WHERE s.code = :seasonCode
            ORDER BY br.number DESC, m.kickoff_at ASC NULLS LAST, m.id ASC
            """.formatted(SEASON_COLUMNS, MATCH_COLUMNS, TEAM_JOINS);

    private static final String SELECT_STANDINGS = """
            SELECT st.position, st.played, st.won, st.drawn, st.lost, st.goals_for, st.goals_against,
                st.goal_difference, st.points, st.form, st.captured_at, t.id AS team_id, t.name, t.logo_url
            FROM lmuml.season_standings st
            JOIN lmuml.teams t ON t.id = st.team_id
            WHERE st.season_id = :seasonId
            ORDER BY st.position
            """;

    private final JdbcClient jdbc;
    private final TransactionTemplate readTransaction;

    SeasonMatchesQuery(DataSource dataSource, PlatformTransactionManager transactions) {
        jdbc = JdbcClient.create(dataSource);
        readTransaction = new TransactionTemplate(transactions);
        readTransaction.setReadOnly(true);
        readTransaction.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }

    Optional<SeasonMatchesResponse> findBySeasonCode(String seasonCode) {
        // Read the catalog and standings from the same PostgreSQL snapshot.
        return readTransaction.execute(status -> jdbc.sql(SELECT_SEASON_MATCHES)
                .param("seasonCode", seasonCode)
                .query(this::readCatalog)
                .map(season -> new SeasonMatchesResponse(season.season(), season.competition(), season.matches(),
                        season.fixturesCapturedAt(), readStandings(season.season().id()))));
    }

    Optional<CatalogRevision> findCatalogRevision(String seasonCode) {
        return jdbc.sql("""
                SELECT s.id, snapshot.captured_at AS fixtures_captured_at,
                       (SELECT st.captured_at FROM lmuml.season_standings st
                        WHERE st.season_id = s.id ORDER BY st.position LIMIT 1) AS standings_captured_at
                FROM lmuml.seasons s
                JOIN lmuml.competitions c ON c.id = s.competition_id
                LEFT JOIN lmuml.fixture_snapshot_times snapshot
                    ON snapshot.league_id = c.api_football_id AND snapshot.season = s.start_year
                WHERE s.code = :seasonCode
                """)
                .param("seasonCode", seasonCode)
                .query((row, index) -> new CatalogRevision(row.getObject("id", UUID.class),
                        optionalInstant(row, "fixtures_captured_at"), optionalInstant(row, "standings_captured_at")))
                .optional();
    }

    private static Instant optionalInstant(ResultSet row, String column) throws SQLException {
        var timestamp = row.getObject(column, OffsetDateTime.class);
        return timestamp == null ? null : timestamp.toInstant();
    }

    Optional<SeasonBettingRoundsResponse> findBettingRoundsBySeasonCode(String seasonCode) {
        return jdbc.sql(SELECT_PUBLISHED_ROUNDS).param("seasonCode", seasonCode).query(this::readPublishedRounds);
    }

    private Optional<SeasonCatalog> readCatalog(ResultSet rows) throws SQLException {
        if (!rows.next()) {
            return Optional.empty();
        }
        var season = readSeason(rows);
        var competition = readCompetition(rows);
        Instant capturedAt = optionalInstant(rows, "fixtures_captured_at");
        var matches = new ArrayList<MatchItem>();
        do {
            // An existing season without matches still produces one LEFT JOIN row.
            if (rows.getObject("match_id", UUID.class) != null) {
                matches.add(readMatch(rows));
            }
        } while (rows.next());
        return Optional.of(new SeasonCatalog(season, competition, matches, capturedAt));
    }

    private Optional<SeasonBettingRoundsResponse> readPublishedRounds(ResultSet rows) throws SQLException {
        if (!rows.next()) {
            return Optional.empty();
        }
        var season = readSeason(rows);
        var competition = readCompetition(rows);
        var rounds = new ArrayList<BettingRound>();
        boolean hasRow = true;
        while (hasRow) {
            var id = rows.getObject("round_id", UUID.class);
            if (id == null) {
                break; // An existing season can have no published rounds.
            }
            var number = rows.getInt("round_number");
            var name = rows.getString("round_name");
            var publishedAt = rows.getObject("published_at", OffsetDateTime.class).toInstant();
            var matches = new ArrayList<MatchItem>();
            boolean awaitingFinal = false;
            do {
                if (rows.getObject("match_id", UUID.class) != null) {
                    matches.add(readMatch(rows));
                }
                awaitingFinal |= rows.getBoolean("pending_final_group");
            } while ((hasRow = rows.next()) && id.equals(rows.getObject("round_id", UUID.class)));
            rounds.add(new BettingRound(id, number, name, publishedAt, awaitingFinal, matches));
        }
        return Optional.of(new SeasonBettingRoundsResponse(season, competition, rounds));
    }

    private Season readSeason(ResultSet row) throws SQLException {
        return new Season(row.getObject("season_id", UUID.class), row.getString("season_code"),
                row.getString("season_name"), row.getInt("start_year"));
    }

    private Competition readCompetition(ResultSet row) throws SQLException {
        return new Competition(row.getObject("competition_id", UUID.class), row.getString("competition_code"),
                row.getString("competition_name"), row.getString("competition_logo_url"));
    }

    private Standings readStandings(UUID seasonId) {
        Optional<Standings> standings = jdbc.sql(SELECT_STANDINGS).param("seasonId", seasonId).query(rows -> {
            if (!rows.next()) {
                return Optional.empty();
            }
            var capturedAt = rows.getObject("captured_at", OffsetDateTime.class).toInstant();
            var entries = new ArrayList<StandingRow>();
            do {
                var team = new Team(rows.getObject("team_id", UUID.class), rows.getString("name"),
                        rows.getString("logo_url"));
                entries.add(new StandingRow(rows.getInt("position"), team, rows.getInt("played"),
                        rows.getInt("won"), rows.getInt("drawn"), rows.getInt("lost"),
                        rows.getInt("goals_for"), rows.getInt("goals_against"),
                        rows.getInt("goal_difference"), rows.getInt("points"), rows.getString("form")));
            } while (rows.next());
            return Optional.of(new Standings(capturedAt, entries));
        });
        return standings.orElse(null);
    }

    private MatchItem readMatch(ResultSet row) throws SQLException {
        OffsetDateTime kickoff = row.getObject("kickoff_at", OffsetDateTime.class);
        return new MatchItem(row.getObject("match_id", UUID.class), row.getString("api_round"),
                kickoff == null ? null : kickoff.toInstant(),
                MatchStatus.fromApiFootball(row.getString("provider_status"),
                        row.getObject("elapsed_minutes", Integer.class), row.getObject("extra_minutes", Integer.class)),
                new Team(row.getObject("home_team_id", UUID.class), row.getString("home_team_name"), row.getString("home_team_logo_url")),
                new Team(row.getObject("away_team_id", UUID.class), row.getString("away_team_name"), row.getString("away_team_logo_url")),
                new Scores(score(row, "home_goals", "away_goals"), score(row, "halftime_home", "halftime_away"),
                        score(row, "fulltime_home", "fulltime_away"), score(row, "extratime_home", "extratime_away"),
                        score(row, "penalty_home", "penalty_away")),
                row.getObject("home_winner", Boolean.class), row.getObject("away_winner", Boolean.class));
    }

    private Score score(ResultSet row, String homeColumn, String awayColumn) throws SQLException {
        return new Score(row.getObject(homeColumn, Integer.class), row.getObject(awayColumn, Integer.class));
    }

    private record SeasonCatalog(Season season, Competition competition, List<MatchItem> matches,
            Instant fixturesCapturedAt) {}

    // The standings importer replaces all rows together, with a single capture time.
    record CatalogRevision(UUID seasonId, Instant fixturesCapturedAt, Instant standingsCapturedAt) {}
}
