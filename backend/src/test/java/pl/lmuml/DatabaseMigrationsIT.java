package pl.lmuml;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.sql.SQLException;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.UUID;

import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.exception.FlywayValidateException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertThrows;

@Testcontainers
class DatabaseMigrationsIT {

    private static final UUID FIRST_SEASON = UUID.fromString("10000000-0000-0000-0000-000000000001");
    private static final UUID SECOND_SEASON = UUID.fromString("10000000-0000-0000-0000-000000000002");
    private static final UUID FIRST_COMPETITION = UUID.fromString("40000000-0000-0000-0000-000000000001");
    private static final UUID FIRST_TEAM = UUID.fromString("20000000-0000-0000-0000-000000000001");
    private static final UUID FIRST_MATCH = UUID.fromString("30000000-0000-0000-0000-000000000001");
    private static final UUID SECOND_MATCH = UUID.fromString("30000000-0000-0000-0000-000000000002");
    private static final UUID THIRD_MATCH = UUID.fromString("30000000-0000-0000-0000-000000000003");

    // Each test starts with its own disposable database, without Flyway clean or shared state.
    @Container
    final PostgreSQLContainer postgres = new PostgreSQLContainer(
            DockerImageName.parse("postgres:18.6-trixie@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6")
                    .asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("lmuml_test")
            .withUsername("test_admin")
            .withPassword("test-only-admin-password")
            .withInitScript("db/test-app-role.sql");

    private JdbcTemplate migrator;
    private JdbcTemplate runtime;
    private Flyway flyway;

    @BeforeEach
    void prepareConnections() {
        migrator = connectionAs("lmuml_migrator_test", "test-only-migrator-password");
        runtime = connectionAs("lmuml_app_test", "test-only-app-password");
        flyway = configuredFlyway("classpath:db/migration");
    }

    @Test
    void createsEmptyTablesAndDoesNotRepeatMigrationOrRemoveExistingData() {
        assertThat(flyway.migrate().migrationsExecuted).isEqualTo(23);
        for (String table : new String[] {"competitions", "seasons", "teams", "matches",
                "api_football_snapshots", "season_standings", "betting_rounds",
                "betting_round_groups", "betting_round_matches", "players", "player_predictions", "active_season",
                "match_statistics", "match_event_snapshots", "match_events", "match_lineups", "match_lineup_players",
                "match_player_stat_snapshots", "match_player_statistics", "season_sync_attempts", "match_detail_auto_attempts"}) {
            assertThat(migrator.queryForObject("SELECT count(*) FROM lmuml." + table, Integer.class))
                    .isZero();
        }

        loadFixtures();
        assertThat(flyway.migrate().migrationsExecuted).isZero();

        assertThat(migrator.queryForObject("SELECT count(*) FROM lmuml.competitions", Integer.class)).isEqualTo(2);
        assertThat(migrator.queryForObject("SELECT count(*) FROM lmuml.seasons", Integer.class)).isEqualTo(3);
        assertThat(migrator.queryForObject("SELECT count(*) FROM lmuml.teams", Integer.class)).isEqualTo(4);
        assertThat(migrator.queryForObject("SELECT count(*) FROM lmuml.matches", Integer.class)).isEqualTo(3);
        assertThat(migrator.queryForObject(
                "SELECT count(*) FROM lmuml.flyway_schema_history WHERE version IS NOT NULL AND success",
                Integer.class)).isEqualTo(23);
    }

    @Test
    void rejectsDuplicateGroupsAndRetainsPublishedMembershipAfterCatalogChanges() {
        var throughStandings = configuredFlyway("classpath:db/migration", "6");
        assertThat(throughStandings.migrate().migrationsExecuted).isEqualTo(6);
        loadFixtures();
        var throughActiveSeason = configuredFlyway("classpath:db/migration", "14");
        assertThat(throughActiveSeason.migrate().migrationsExecuted).isEqualTo(8);

        UUID round = UUID.randomUUID();
        UUID otherRound = UUID.randomUUID();
        String addRound = """
                INSERT INTO lmuml.betting_rounds (id, season_id, number, name)
                VALUES (?, ?, ?, ?)
                """;
        migrator.update(addRound, round, FIRST_SEASON, 1, "Kolejka 1");
        migrator.update(addRound, otherRound, FIRST_SEASON, 2, "Kolejka 2");
        assertIntegrityFailure(addRound, UUID.randomUUID(), FIRST_SEASON, 1, "Druga kolejka nr 1");
        assertThat(migrator.queryForMap("SELECT published_at FROM lmuml.betting_rounds WHERE id = ?", round))
                .containsEntry("published_at", null);

        String addGroup = """
                INSERT INTO lmuml.betting_round_groups (season_id, group_key, tournament_round, betting_round_id)
                VALUES (?, ?, ?, ?)
                """;
        String firstLeg = "round-of-16:first-leg";
        String secondLeg = "round-of-16:second-leg";
        migrator.update(addGroup, FIRST_SEASON, firstLeg, "Round of 16", round);
        migrator.update(addGroup, FIRST_SEASON, secondLeg, "Round of 16", otherRound);
        migrator.update(addGroup, FIRST_SEASON, "final", "Final", otherRound);
        assertIntegrityFailure(addGroup, FIRST_SEASON, firstLeg, "Round of 16", otherRound);
        assertIntegrityFailure(addGroup, SECOND_SEASON, firstLeg, "Round of 16", round);

        migrator.update("UPDATE lmuml.matches SET api_round = 'Round of 16' WHERE id IN (?, ?)",
                FIRST_MATCH, SECOND_MATCH);
        String addMatch = """
                INSERT INTO lmuml.betting_round_matches (match_id, season_id, group_key)
                VALUES (?, ?, ?)
                """;
        migrator.update(addMatch, FIRST_MATCH, FIRST_SEASON, firstLeg);
        migrator.update(addMatch, SECOND_MATCH, FIRST_SEASON, secondLeg);
        assertIntegrityFailure(addMatch, FIRST_MATCH, FIRST_SEASON, secondLeg);
        assertIntegrityFailure(addMatch, THIRD_MATCH, FIRST_SEASON, firstLeg);
        assertIntegrityFailure("DELETE FROM lmuml.matches WHERE id = ?", FIRST_MATCH);

        migrator.update("UPDATE lmuml.betting_rounds SET published_at = '2026-11-01T18:00:00Z' WHERE id = ?", round);
        assertThat(configuredFlyway("classpath:db/migration", "15").migrate().migrationsExecuted).isEqualTo(1);
        assertThat(runtime.queryForObject("SELECT name FROM lmuml.betting_rounds WHERE id = ?", String.class, round))
                .isEqualTo("Runda 1");
        assertThat(runtime.queryForObject("SELECT published_at FROM lmuml.betting_rounds WHERE id = ?",
                OffsetDateTime.class, round)).isEqualTo(OffsetDateTime.parse("2026-11-01T18:00:00Z"));
        migrator.update("UPDATE lmuml.matches SET kickoff_at = NULL, api_round = 'Changed label' WHERE id = ?",
                FIRST_MATCH);
        assertThat(migrator.queryForMap("""
                SELECT g.betting_round_id, r.group_key, g.tournament_round
                FROM lmuml.betting_round_matches r
                JOIN lmuml.betting_round_groups g USING (season_id, group_key)
                WHERE r.match_id = ?
                """, FIRST_MATCH))
                .containsEntry("betting_round_id", round)
                .containsEntry("group_key", firstLeg)
                .containsEntry("tournament_round", "Round of 16");
    }

    @Test
    void addsNullableLogoUrlsToPopulatedV2CatalogWithoutChangingExistingRows() {
        assertThat(configuredFlyway("classpath:db/migration", "2").migrate().migrationsExecuted).isEqualTo(2);
        loadFixtures();
        var teamsBefore = runtime.queryForList("SELECT id, name, api_football_id FROM lmuml.teams ORDER BY id");
        var competitionsBefore = runtime.queryForList("SELECT id, code, name, api_football_id FROM lmuml.competitions ORDER BY id");

        Flyway logoMigration = configuredFlyway("classpath:db/migration", "3");
        assertThat(logoMigration.migrate().migrationsExecuted).isEqualTo(1);

        assertThat(runtime.queryForList("SELECT id, name, api_football_id FROM lmuml.teams ORDER BY id"))
                .isEqualTo(teamsBefore);
        assertThat(runtime.queryForList("SELECT id, code, name, api_football_id FROM lmuml.competitions ORDER BY id"))
                .isEqualTo(competitionsBefore);
        assertThat(runtime.queryForObject("SELECT count(*) FROM lmuml.teams WHERE logo_url IS NOT NULL", Integer.class)).isZero();
        assertThat(runtime.queryForObject("SELECT count(*) FROM lmuml.competitions WHERE logo_url IS NOT NULL", Integer.class)).isZero();
        assertThat(runtime.queryForObject("SELECT count(*) FROM lmuml.matches", Integer.class)).isEqualTo(3);

        String teamLogo = "https://assets.example.test/teams/201.png";
        String competitionLogo = "https://assets.example.test/competitions/9001.png";
        migrator.update("UPDATE lmuml.teams SET logo_url = ? WHERE id = ?", teamLogo, FIRST_TEAM);
        migrator.update("UPDATE lmuml.competitions SET logo_url = ? WHERE id = ?", competitionLogo, FIRST_COMPETITION);

        assertThat(logoMigration.migrate().migrationsExecuted).isZero();
        assertThat(runtime.queryForObject("SELECT logo_url FROM lmuml.teams WHERE id = ?", String.class, FIRST_TEAM))
                .isEqualTo(teamLogo);
        assertThat(runtime.queryForObject("SELECT logo_url FROM lmuml.competitions WHERE id = ?", String.class, FIRST_COMPETITION))
                .isEqualTo(competitionLogo);
    }

    @Test
    void addsMetadataToPopulatedV3CatalogWithoutInventingMissingValues() {
        var metadataMigration = configuredFlyway("classpath:db/migration", "4");
        assertThat(configuredFlyway("classpath:db/migration", "3").migrate().migrationsExecuted).isEqualTo(3);
        loadFixtures();
        String teamLogo = "https://assets.example.test/teams/201.png";
        String competitionLogo = "https://assets.example.test/competitions/9001.png";
        migrator.update("UPDATE lmuml.teams SET logo_url = ? WHERE id = ?", teamLogo, FIRST_TEAM);
        migrator.update("UPDATE lmuml.competitions SET logo_url = ? WHERE id = ?", competitionLogo, FIRST_COMPETITION);
        var teamsBefore = runtime.queryForList("SELECT id, name, api_football_id, logo_url FROM lmuml.teams ORDER BY id");
        var competitionsBefore = runtime.queryForList("SELECT id, code, name, api_football_id, logo_url FROM lmuml.competitions ORDER BY id");

        assertThat(metadataMigration.migrate().migrationsExecuted).isEqualTo(1);

        assertThat(runtime.queryForList("SELECT id, name, api_football_id, logo_url FROM lmuml.teams ORDER BY id"))
                .isEqualTo(teamsBefore);
        assertThat(runtime.queryForList("SELECT id, code, name, api_football_id, logo_url FROM lmuml.competitions ORDER BY id"))
                .isEqualTo(competitionsBefore);
        assertThat(runtime.queryForObject("SELECT count(*) FROM lmuml.seasons", Integer.class)).isEqualTo(3);
        assertThat(runtime.queryForObject("SELECT count(*) FROM lmuml.matches", Integer.class)).isEqualTo(3);
        assertThat(runtime.queryForMap("""
                SELECT competition_type, country_name, country_code, country_flag_url
                FROM lmuml.competitions WHERE id = ?
                """, FIRST_COMPETITION)).containsEntry("competition_type", null).containsEntry("country_name", null)
                .containsEntry("country_code", null).containsEntry("country_flag_url", null);
        assertThat(runtime.queryForMap("""
                SELECT starts_on, ends_on, provider_current, coverage FROM lmuml.seasons WHERE id = ?
                """, FIRST_SEASON)).containsEntry("starts_on", null).containsEntry("ends_on", null)
                .containsEntry("provider_current", null).containsEntry("coverage", null);
        assertThat(runtime.queryForMap("""
                SELECT referee, venue_api_football_id, venue_name, venue_city,
                    elapsed_minutes, extra_minutes, home_winner, away_winner
                FROM lmuml.matches WHERE id = ?
                """, FIRST_MATCH)).containsEntry("referee", null).containsEntry("venue_api_football_id", null)
                .containsEntry("venue_name", null).containsEntry("venue_city", null)
                .containsEntry("elapsed_minutes", null).containsEntry("extra_minutes", null)
                .containsEntry("home_winner", null).containsEntry("away_winner", null);

        migrator.update("""
                UPDATE lmuml.competitions SET competition_type = 'Cup', country_name = 'World'
                WHERE id = ?
                """, FIRST_COMPETITION);
        migrator.update("""
                UPDATE lmuml.seasons SET starts_on = DATE '2026-07-01', ends_on = DATE '2027-05-31',
                    provider_current = false,
                    coverage = '{"fixtures":{"events":true},"future_coverage":{"available":true}}'::jsonb
                WHERE id = ?
                """, FIRST_SEASON);
        // A named venue can lack its provider ID, and extra-time matches can exceed 90 minutes.
        migrator.update("""
                UPDATE lmuml.matches SET referee = 'Example referee', venue_name = 'Example stadium',
                    venue_city = 'Example city', elapsed_minutes = 120, extra_minutes = 7,
                    home_winner = true, away_winner = false
                WHERE id = ?
                """, FIRST_MATCH);

        assertThat(metadataMigration.migrate().migrationsExecuted).isZero();
        assertThat(runtime.queryForMap("""
                SELECT venue_api_football_id, venue_name, elapsed_minutes, extra_minutes, home_winner, away_winner
                FROM lmuml.matches WHERE id = ?
                """, FIRST_MATCH)).containsEntry("venue_api_football_id", null).containsEntry("venue_name", "Example stadium")
                .containsEntry("elapsed_minutes", 120).containsEntry("extra_minutes", 7)
                .containsEntry("home_winner", true).containsEntry("away_winner", false);
        assertThat(runtime.queryForObject("SELECT provider_current FROM lmuml.seasons WHERE id = ?", Boolean.class, FIRST_SEASON))
                .isFalse();
        assertThat(runtime.queryForObject("SELECT coverage #>> '{future_coverage,available}' FROM lmuml.seasons WHERE id = ?",
                String.class, FIRST_SEASON)).isEqualTo("true");
        assertThat(runtime.queryForObject("SELECT competition_type FROM lmuml.competitions WHERE id = ?", String.class, FIRST_COMPETITION))
                .isEqualTo("Cup");
    }

    @Test
    void rejectsInvalidMetadataAndRawSnapshotShapesOrRanges() {
        flyway.migrate();
        loadFixtures();
        assertIntegrityFailure("""
                UPDATE lmuml.seasons SET starts_on = DATE '2026-08-01', ends_on = DATE '2026-07-01'
                WHERE id = ?
                """, FIRST_SEASON);
        for (String invalidCoverage : new String[] {"[]", "true", "42", "\"text\"", "null"}) {
            assertIntegrityFailure("UPDATE lmuml.seasons SET coverage = ?::jsonb WHERE id = ?", invalidCoverage, FIRST_SEASON);
        }
        assertIntegrityFailure("UPDATE lmuml.matches SET venue_api_football_id = 0 WHERE id = ?", FIRST_MATCH);
        assertIntegrityFailure("UPDATE lmuml.matches SET elapsed_minutes = -1 WHERE id = ?", FIRST_MATCH);
        assertIntegrityFailure("UPDATE lmuml.matches SET extra_minutes = -1 WHERE id = ?", FIRST_MATCH);

        String insertSnapshot = """
                INSERT INTO lmuml.api_football_snapshots (endpoint, league_id, season, captured_at, payload)
                VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?::jsonb)
                """;
        String validFixturePayload = """
                {"get":"fixtures","parameters":{"league":"9001","season":"2026"},"errors":[],
                 "results":0,"paging":{"current":1,"total":1},"response":[]}
                """;
        assertIntegrityFailure(insertSnapshot, "unknown-endpoint", 9001L, 2026,
                validFixturePayload.replace("\"get\":\"fixtures\"", "\"get\":\"unknown-endpoint\""));
        assertIntegrityFailure(insertSnapshot, "fixtures", 0L, 2026, validFixturePayload);
        assertIntegrityFailure(insertSnapshot, "fixtures", 9001L, 999, validFixturePayload);
        assertIntegrityFailure(insertSnapshot, "fixtures", 9001L, 10000, validFixturePayload);
        for (String invalidPayload : new String[] {"[]", "true", "42", "\"text\"", "null"}) {
            assertIntegrityFailure(insertSnapshot, "fixtures", 9001L, 2026, invalidPayload);
        }
    }

    @Test
    void rejectsInvalidScheduleDataAndDeletingReferencedTeams() {
        flyway.migrate();
        loadFixtures();
        assertIntegrityFailure("UPDATE lmuml.seasons SET code = 'demo-2026' WHERE id = ?", SECOND_SEASON);
        assertIntegrityFailure("UPDATE lmuml.seasons SET code = 'Invalid Code' WHERE id = ?", FIRST_SEASON);
        assertIntegrityFailure("UPDATE lmuml.seasons SET competition_id = ? WHERE id = ?", UUID.randomUUID(), FIRST_SEASON);
        assertIntegrityFailure("UPDATE lmuml.seasons SET start_year = 999 WHERE id = ?", FIRST_SEASON);
        assertIntegrityFailure("UPDATE lmuml.competitions SET name = '   ' WHERE id = ?", FIRST_COMPETITION);
        assertIntegrityFailure("UPDATE lmuml.teams SET name = '   ' WHERE id = ?", FIRST_TEAM);
        assertIntegrityFailure("UPDATE lmuml.matches SET away_team_id = home_team_id WHERE id = ?", FIRST_MATCH);
        assertIntegrityFailure("UPDATE lmuml.matches SET season_id = ? WHERE id = ?", UUID.randomUUID(), FIRST_MATCH);
        assertIntegrityFailure("UPDATE lmuml.matches SET home_team_id = ? WHERE id = ?", UUID.randomUUID(), FIRST_MATCH);
        assertIntegrityFailure("UPDATE lmuml.matches SET provider_status = '   ' WHERE id = ?", FIRST_MATCH);
        assertIntegrityFailure("DELETE FROM lmuml.teams WHERE id = ?", FIRST_TEAM);
    }

    @Test
    void keepsProviderIdsPositiveAndUniqueWithoutMakingSeasonYearGloballyUnique() {
        flyway.migrate();
        loadFixtures();
        assertThat(migrator.queryForObject("SELECT count(*) FROM lmuml.seasons WHERE start_year = 2026", Integer.class))
                .isEqualTo(2);
        assertIntegrityFailure("UPDATE lmuml.seasons SET start_year = 2026 WHERE id = ?", SECOND_SEASON);

        assertIntegrityFailure("UPDATE lmuml.competitions SET api_football_id = 0 WHERE id = ?", FIRST_COMPETITION);
        assertIntegrityFailure("UPDATE lmuml.competitions SET api_football_id = 9002 WHERE id = ?", FIRST_COMPETITION);
        assertIntegrityFailure("UPDATE lmuml.teams SET api_football_id = -1 WHERE id = ?", FIRST_TEAM);
        assertIntegrityFailure("UPDATE lmuml.teams SET api_football_id = 202 WHERE id = ?", FIRST_TEAM);
        assertIntegrityFailure("UPDATE lmuml.matches SET api_football_id = 0 WHERE id = ?", FIRST_MATCH);
        assertIntegrityFailure("UPDATE lmuml.matches SET api_football_id = 7002 WHERE id = ?", FIRST_MATCH);
    }

    @Test
    void preservesUnknownStatusNullableTimeAndIndependentScorePairs() {
        flyway.migrate();
        loadFixtures();
        migrator.update("UPDATE lmuml.matches SET provider_status = 'NEW_PROVIDER_STATE', kickoff_at = NULL WHERE id = ?", FIRST_MATCH);
        Map<String, Object> missing = runtime.queryForMap("SELECT provider_status, kickoff_at, home_goals, fulltime_home FROM lmuml.matches WHERE id = ?", FIRST_MATCH);
        assertThat(missing).containsEntry("provider_status", "NEW_PROVIDER_STATE")
                .containsEntry("kickoff_at", null).containsEntry("home_goals", null).containsEntry("fulltime_home", null);

        migrator.update("""
                UPDATE lmuml.matches SET provider_status = 'PEN', home_goals = 1, away_goals = 1,
                    halftime_home = 0, halftime_away = 0, fulltime_home = 1, fulltime_away = 0,
                    extratime_home = 0, extratime_away = 1, penalty_home = 5, penalty_away = 4
                WHERE id = ?
                """, FIRST_MATCH);
        Map<String, Object> scores = runtime.queryForMap("""
                SELECT home_goals, away_goals, halftime_home, halftime_away, fulltime_home,
                    fulltime_away, extratime_home, extratime_away, penalty_home, penalty_away
                FROM lmuml.matches WHERE id = ?
                """, FIRST_MATCH);
        assertThat(scores).containsEntry("home_goals", 1).containsEntry("away_goals", 1)
                .containsEntry("halftime_home", 0).containsEntry("halftime_away", 0)
                .containsEntry("fulltime_home", 1).containsEntry("fulltime_away", 0)
                .containsEntry("extratime_home", 0).containsEntry("extratime_away", 1)
                .containsEntry("penalty_home", 5).containsEntry("penalty_away", 4);
        migrator.update("UPDATE lmuml.matches SET fulltime_away = NULL WHERE id = ?", FIRST_MATCH);
        assertThat(runtime.queryForObject("SELECT fulltime_away FROM lmuml.matches WHERE id = ?", Integer.class, FIRST_MATCH))
                .isNull();

        for (String column : new String[] {"home_goals", "away_goals", "halftime_home", "halftime_away",
                "fulltime_home", "fulltime_away", "extratime_home", "extratime_away", "penalty_home", "penalty_away"}) {
            assertIntegrityFailure("UPDATE lmuml.matches SET " + column + " = -1 WHERE id = ?", FIRST_MATCH);
        }
    }

    @Test
    void allowsRuntimeReadsWithoutWritesDdlOrAccessToMigrationHistory() {
        flyway.migrate();
        loadFixtures();
        for (String table : new String[] {"competitions", "seasons", "teams", "matches"}) {
            assertThat(runtime.queryForObject("SELECT count(*) FROM lmuml." + table, Integer.class))
                    .isPositive();
        }
        assertThat(runtime.queryForObject("SELECT count(*) FROM lmuml.season_standings", Integer.class))
                .isZero();
        assertThat(runtime.queryForObject("SELECT count(*) FROM lmuml.fixture_snapshot_times", Integer.class))
                .isZero();

        assertPermissionDenied("CREATE TABLE lmuml.forbidden_table (id INTEGER)");
        assertPermissionDenied("UPDATE lmuml.competitions SET name = 'Changed'");
        assertPermissionDenied("UPDATE lmuml.teams SET name = 'Changed'");
        assertPermissionDenied("INSERT INTO lmuml.teams (id, name, api_football_id) VALUES (gen_random_uuid(), 'Extra team', 99999)");
        assertPermissionDenied("DELETE FROM lmuml.matches");
        assertPermissionDenied("DELETE FROM lmuml.season_standings");
        assertPermissionDenied("UPDATE lmuml.fixture_snapshot_times SET captured_at = NOW()");
        assertPermissionDenied("DELETE FROM lmuml.active_season");
        assertPermissionDenied("UPDATE lmuml.active_season SET singleton = FALSE");
        assertPermissionDenied("SELECT * FROM lmuml.flyway_schema_history");
        assertPermissionDenied("SELECT * FROM lmuml.api_football_snapshots");
    }

    @Test
    void allowsRoundManagementWithoutGrantingEditsToCatalogOrRoundIdentity() {
        flyway.migrate();
        assertThat(runtime.queryForObject("SELECT count(*) FROM lmuml.betting_rounds", Integer.class))
                .isZero();
        assertThat(runtime.queryForObject("""
                SELECT has_column_privilege('lmuml.betting_rounds', 'published_at', 'UPDATE')
                """, Boolean.class)).isTrue();
        assertPermissionDenied("UPDATE lmuml.betting_rounds SET number = 2");
        assertPermissionDenied("UPDATE lmuml.betting_round_groups SET group_key = 'other'");
        assertPermissionDenied("UPDATE lmuml.betting_round_matches SET group_key = 'other'");
        assertPermissionDenied("UPDATE lmuml.matches SET api_round = 'Other'");
    }

    @Test
    void keepsMatchesScopedToTheirSeasonAndPreservesInstantsAcrossClockChange() {
        flyway.migrate();
        loadFixtures();
        String matchesInSeason = """
                SELECT id FROM lmuml.matches
                WHERE season_id = ?
                ORDER BY kickoff_at, id
                """;
        assertThat(runtime.queryForList(matchesInSeason, UUID.class, FIRST_SEASON))
                .containsExactly(FIRST_MATCH, SECOND_MATCH);
        assertThat(runtime.queryForList(matchesInSeason, UUID.class, SECOND_SEASON))
                .containsExactly(THIRD_MATCH);

        // The same local clock time with different offsets represents two different instants.
        assertThat(kickoff(FIRST_MATCH)).isEqualTo(Instant.parse("2026-10-25T00:30:00Z"));
        assertThat(kickoff(SECOND_MATCH)).isEqualTo(Instant.parse("2026-10-25T01:30:00Z"));
    }

    @Test
    void rejectsChangingAnAlreadyAppliedMigration(@TempDir Path changedMigrations) throws Exception {
        flyway.migrate();
        String original = new ClassPathResource("db/migration/V1__create_match_schedule.sql")
                .getContentAsString(StandardCharsets.UTF_8);
        String changed = original.replace("matchday > 0", "matchday >= 0");
        assertThat(changed).isNotEqualTo(original);
        Files.writeString(changedMigrations.resolve("V1__create_match_schedule.sql"), changed, StandardCharsets.UTF_8);
        for (String name : new String[] {"V2__align_schedule_with_api_football.sql", "V3__add_catalog_logo_urls.sql",
                "V4__add_provider_metadata_and_snapshots.sql", "V5__grant_catalog_import_access.sql",
                "V6__add_season_standings.sql", "V7__add_betting_rounds.sql",
                "V8__grant_betting_round_management.sql", "V9__create_players.sql",
                "V10__version_player_credentials.sql", "V11__add_player_password_reset.sql",
                "V12__add_player_predictions.sql", "V13__expose_fixture_snapshot_times.sql",
                "V14__add_active_season.sql", "V15__generate_betting_round_names.sql", "V16__add_match_statistics.sql",
                "V17__bind_match_statistics_to_teams.sql", "V18__add_match_events.sql", "V19__add_match_lineups.sql",
                "V20__add_match_player_statistics.sql", "V21__link_match_lineup_players_to_events.sql",
                "V22__track_season_sync_attempts.sql", "V23__track_automatic_match_detail_attempts.sql"}) {
            try (var input = new ClassPathResource("db/migration/" + name).getInputStream()) {
                Files.copy(input, changedMigrations.resolve(name));
            }
        }

        String location = "filesystem:" + changedMigrations.toAbsolutePath().toString().replace('\\', '/');
        Flyway alteredHistory = configuredFlyway(location);
        assertThatThrownBy(alteredHistory::validate)
                .isInstanceOf(FlywayValidateException.class)
                .hasMessageContaining("checksum mismatch");
        flyway.validate();
    }

    @Test
    void refusesUpgradeOfExistingV1MatchesAndPreservesLegacyFieldsAndHistory() {
        assertThat(configuredFlyway("classpath:db/migration", "1").migrate().migrationsExecuted).isEqualTo(1);
        new ResourceDatabasePopulator(new ClassPathResource("db/fixtures/match-schedule-v1.sql"))
                .execute(migrator.getDataSource());

        assertV2MappingRequired();

        assertThat(runtime.queryForMap("SELECT matchday, status FROM lmuml.matches WHERE id = ?", FIRST_MATCH))
                .containsEntry("matchday", 7).containsEntry("status", "SCHEDULED");
        assertThat(kickoff(FIRST_MATCH)).isEqualTo(Instant.parse("2026-10-25T00:30:00Z"));
        assertThat(migrator.queryForObject("SELECT count(*) FROM lmuml.teams", Integer.class)).isEqualTo(2);
        assertThat(migrator.queryForObject("SELECT count(*) FROM lmuml.seasons", Integer.class)).isEqualTo(1);
        assertV1HistoryAndSchemaPreserved();
    }

    @ParameterizedTest
    @ValueSource(strings = {"seasons", "teams"})
    void refusesUpgradeEvenWhenOnlyReferenceDataExists(String table) {
        configuredFlyway("classpath:db/migration", "1").migrate();
        if (table.equals("seasons")) {
            migrator.update("INSERT INTO lmuml.seasons (id, code, name) VALUES (?, 'legacy', 'Legacy season')", FIRST_SEASON);
        } else {
            migrator.update("INSERT INTO lmuml.teams (id, name) VALUES (?, 'Legacy team')", FIRST_TEAM);
        }

        assertV2MappingRequired();

        assertThat(migrator.queryForObject("SELECT count(*) FROM lmuml." + table, Integer.class)).isEqualTo(1);
        assertV1HistoryAndSchemaPreserved();
    }

    private void assertV2MappingRequired() {
        assertThatThrownBy(flyway::migrate)
                .hasMessageContaining("V2 requires explicit mapping of existing schedule data");
    }

    private void assertV1HistoryAndSchemaPreserved() {
        assertThat(migrator.queryForObject("SELECT to_regclass('lmuml.competitions')::text", String.class)).isNull();
        assertThat(migrator.queryForObject("""
                SELECT count(*) FROM information_schema.columns
                WHERE table_schema = 'lmuml' AND column_name IN ('api_football_id', 'competition_id', 'start_year', 'provider_status')
                """, Integer.class)).isZero();
        assertThat(migrator.queryForList("SELECT version FROM lmuml.flyway_schema_history WHERE success ORDER BY installed_rank", String.class))
                .containsExactly("1");
        assertThat(migrator.queryForObject("SELECT count(*) FROM lmuml.flyway_schema_history WHERE NOT success", Integer.class)).isZero();
    }

    private Flyway configuredFlyway(String location) {
        return configuredFlyway(location, null);
    }

    private Flyway configuredFlyway(String location, String target) {
        var configuration = Flyway.configure()
                .dataSource(migrator.getDataSource())
                .defaultSchema("lmuml")
                .schemas("lmuml")
                .createSchemas(false)
                .cleanDisabled(true)
                .baselineOnMigrate(false)
                .locations(location)
                .placeholders(Map.of("runtime", "lmuml_app_test", "importer", "lmuml_importer_test"));
        if (target != null) configuration.target(target);
        return configuration.load();
    }

    private JdbcTemplate connectionAs(String username, String password) {
        return new JdbcTemplate(new DriverManagerDataSource(postgres.getJdbcUrl(), username, password));
    }

    private void loadFixtures() {
        new ResourceDatabasePopulator(new ClassPathResource("db/fixtures/match-schedule.sql"))
                .execute(migrator.getDataSource());
    }

    private Instant kickoff(UUID matchId) {
        return runtime.queryForObject("SELECT kickoff_at FROM lmuml.matches WHERE id = ?",
                OffsetDateTime.class, matchId).toInstant();
    }

    private void assertIntegrityFailure(String sql, Object... parameters) {
        assertThatThrownBy(() -> migrator.update(sql, parameters))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    private void assertPermissionDenied(String sql) {
        DataAccessException error = assertThrows(DataAccessException.class, () -> runtime.execute(sql));
        assertThat(error.getMostSpecificCause()).isInstanceOf(SQLException.class);
        assertThat(((SQLException) error.getMostSpecificCause()).getSQLState()).isEqualTo("42501");
    }
}
