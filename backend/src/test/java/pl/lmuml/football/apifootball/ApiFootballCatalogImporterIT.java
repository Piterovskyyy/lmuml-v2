package pl.lmuml.football.apifootball;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import pl.lmuml.football.apifootball.ApiFootballFixtureEventsSample.Event;
import pl.lmuml.football.apifootball.ApiFootballFixtureLineupsSample.Player;
import pl.lmuml.football.apifootball.ApiFootballFixtureLineupsSample.TeamLineup;
import pl.lmuml.football.apifootball.ApiFootballFixturePlayersSample.TeamPlayers;
import pl.lmuml.football.apifootball.ApiFootballFixtureStatisticsSample.Statistics;
import pl.lmuml.football.apifootball.ApiFootballFixtureStatisticsSample.TeamStatistics;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static pl.lmuml.football.apifootball.ApiFootballSnapshot.Endpoint.*;
import static pl.lmuml.football.matches.MatchEventKind.*;
import static pl.lmuml.football.matches.MatchLineupPosition.GOALKEEPER;
import static pl.lmuml.football.matches.MatchLineupPosition.MIDFIELDER;

@Testcontainers
class ApiFootballCatalogImporterIT {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Instant EARLY = Instant.parse("2026-11-02T10:00:00Z");
    private static final Instant LATE = EARLY.plusSeconds(120);

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(
            DockerImageName.parse("postgres:18.6-trixie@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6")
                    .asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("lmuml_test").withUsername("test_admin")
            .withPassword("test-only-admin-password").withInitScript("db/test-app-role.sql");

    private JdbcTemplate owner;
    private JdbcTemplate importerSql;
    private ApiFootballCatalogImporter importer;
    private ApiFootballStandingsImporter standings;
    private ApiFootballFixtureStatisticsImporter fixtureStatistics;
    private ApiFootballFixtureEventsImporter fixtureEvents;
    private ApiFootballFixtureLineupsImporter fixtureLineups;
    private ApiFootballFixturePlayersImporter fixturePlayers;
    private ApiFootballFixtureDetailsImporter fixtureDetails;
    private ApiFootballAutomaticDetailClaims automaticDetails;

    @BeforeEach
    void preparePrivateDatabase() {
        var migration = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), "lmuml_migrator_test", "test-only-migrator-password");
        Flyway.configure().dataSource(migration).schemas("lmuml").defaultSchema("lmuml").createSchemas(false)
                .cleanDisabled(true).locations("classpath:db/migration")
                .placeholders(Map.of("runtime", "lmuml_app_test", "importer", "lmuml_importer_test")).load().migrate();
        owner = new JdbcTemplate(migration);
        for (String table : new String[] {"api_football_snapshots", "season_standings", "matches", "seasons", "teams", "competitions"}) {
            owner.update("DELETE FROM lmuml." + table);
        }
        var source = new DriverManagerDataSource(POSTGRES.getJdbcUrl(), "lmuml_importer_test", "test-only-importer-password");
        importerSql = new JdbcTemplate(source);
        var transactions = new JdbcTransactionManager(source);
        importer = new ApiFootballCatalogImporter(source, transactions, JSON);
        standings = new ApiFootballStandingsImporter(source, transactions, JSON);
        fixtureStatistics = new ApiFootballFixtureStatisticsImporter(source, transactions);
        fixtureEvents = new ApiFootballFixtureEventsImporter(source, transactions);
        fixtureLineups = new ApiFootballFixtureLineupsImporter(source, transactions);
        fixturePlayers = new ApiFootballFixturePlayersImporter(source, transactions);
        fixtureDetails = new ApiFootballFixtureDetailsImporter(source, transactions);
        automaticDetails = new ApiFootballAutomaticDetailClaims(source);
    }

    @Test
    void claimsOnlyRecentFinishedFixturesWithMissingDetailsAndLimitsRetries() {
        run(2024, 7001, EARLY, "Original");
        run(2025, 8000, LATE, "Another season");
        var at = Instant.parse("2026-11-24T22:00:00Z");
        var recentKickoff = at.minusSeconds(7_200);
        owner.update("UPDATE lmuml.matches SET kickoff_at = ?", recentKickoff.atOffset(ZoneOffset.UTC));
        fixtureDetails.importSample(details(LATE, new Event(1, null, 201L, GOAL, "Scorer", null, 7L, null),
                "Home keeper", 9, "Away keeper"));
        addAutomaticDetailMatch(7002, "FT", recentKickoff.minusSeconds(1));
        addAutomaticDetailMatch(7003, "AET", recentKickoff);
        addAutomaticDetailMatch(7004, "PEN", recentKickoff.plusSeconds(1));
        addAutomaticDetailMatch(7005, "1H", recentKickoff);
        addAutomaticDetailMatch(7006, "AWD", recentKickoff);
        addAutomaticDetailMatch(7007, "FT", at.minusSeconds(86_401));
        addAutomaticDetailMatch(7008, "FT", at.plusSeconds(1));

        assertThat(automaticDetails.claim(2, 2024, at)).containsExactly("7002", "7003", "7004");
        assertThat(automaticDetails.claim(2, 2024, at.plusSeconds(3_599))).containsExactly("7008");
        assertThat(automaticDetails.claim(2, 2024, at.plusSeconds(3_600)))
                .containsExactly("7002", "7003", "7004");
        assertThat(automaticDetails.claim(2, 2024, at.plusSeconds(7_200))).containsExactly("7008");
        assertThat(automaticDetails.claim(2, 2024, at.plusSeconds(10_800))).isEmpty();
    }

    @Test
    void considersOnlySupportedSectionsAndTreatsEmptyEventsAsSavedUntilParticipantsChange() {
        run(2024, 7001, EARLY, "Original");
        var at = Instant.parse("2026-11-24T22:00:00Z");
        owner.update("UPDATE lmuml.matches SET kickoff_at = ?", at.minusSeconds(7_200).atOffset(ZoneOffset.UTC));
        owner.update("""
                UPDATE lmuml.seasons SET coverage =
                    '{"fixtures":{"events":true,"lineups":false,"statistics_fixtures":false,"statistics_players":false}}'
                """);
        fixtureEvents.importSample(events(LATE));

        assertThat(automaticDetails.claim(2, 2024, at)).isEmpty();
        owner.update("UPDATE lmuml.match_event_snapshots SET home_team_id = away_team_id, away_team_id = home_team_id");
        assertThat(automaticDetails.claim(2, 2024, at)).containsExactly("7001");
    }

    private void addAutomaticDetailMatch(long providerId, String status, Instant kickoffAt) {
        owner.update("""
                INSERT INTO lmuml.matches (id, season_id, home_team_id, away_team_id, provider_status,
                    api_football_id, kickoff_at)
                SELECT gen_random_uuid(), season_id, home_team_id, away_team_id, ?, ?, ?
                FROM lmuml.matches WHERE api_football_id = 7001
                """, status, providerId, kickoffAt.atOffset(ZoneOffset.UTC));
    }

    @Test
    void importsAllFixtureDetailsAndPreservesUnavailableSectionsOnLaterCapture() {
        run(2024, 7001, EARLY, "Original");
        var goal = new Event(12, null, 201L, GOAL, "Scorer", null, 11L, null);
        var first = details(EARLY, goal, "Home keeper", 9, "Away keeper");
        var allSections = new ApiFootballFixtureDetailsImporter.ImportResult(
                List.of("events", "lineups", "statistics", "players"), List.of());

        assertThat(fixtureDetails.importSample(first)).isEqualTo(allSections);
        assertThat(fixtureDetails.importSample(first)).isEqualTo(allSections);
        assertThat(eventKinds()).containsExactly("GOAL");
        assertThat(lineupPlayers()).containsExactly("Home keeper", "Starter", "Substitute", "Visiting keeper");
        assertThat(statisticShotsBySide()).containsExactly(3, 9);
        assertThat(statisticPlayers()).containsExactly("Home keeper", "Second home player", "Away keeper");

        var statisticsOnly = new ApiFootballFixtureDetailsSample(7001, 201, 202,
                Optional.empty(), Optional.empty(), Optional.of(statistics(7001, LATE, 202, 15, 5)), Optional.empty());
        assertThat(fixtureDetails.importSample(statisticsOnly)).isEqualTo(
                new ApiFootballFixtureDetailsImporter.ImportResult(List.of("statistics"),
                        List.of("events", "lineups", "players")));
        assertThat(eventKinds()).containsExactly("GOAL");
        assertThat(lineupPlayers()).containsExactly("Home keeper", "Starter", "Substitute", "Visiting keeper");
        assertThat(statisticShotsBySide()).containsExactly(5, 15);
        assertThat(statisticPlayers()).containsExactly("Home keeper", "Second home player", "Away keeper");
    }

    @Test
    void importsTheWholeFixtureDetailsBatchOrRollsItBack() {
        run(2024, 7001, EARLY, "First");
        run(2025, 7002, EARLY, "Second");
        var goal = new Event(12, null, 201L, GOAL, "Scorer", null, 11L, null);
        var first = details(LATE, goal, "Home keeper", 9, "Away keeper");
        var secondStatistics = statistics(7002, LATE, 202, 14, 8);
        var invalid = new ApiFootballFixtureDetailsSample(7002, 202, 201,
                Optional.empty(), Optional.empty(), Optional.of(secondStatistics), Optional.empty());

        assertThatThrownBy(() -> fixtureDetails.importBatch(List.of(invalid, first)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("do not match the catalog fixture");
        assertThat(eventKinds()).isEmpty();
        assertThat(lineupPlayers()).isEmpty();
        assertThat(statisticShotsBySide()).isEmpty();
        assertThat(statisticPlayers()).isEmpty();

        var second = new ApiFootballFixtureDetailsSample(7002, 201, 202,
                Optional.empty(), Optional.empty(), Optional.of(secondStatistics), Optional.empty());
        var imported = fixtureDetails.importBatch(List.of(second, first));
        assertThat(imported).extracting(ApiFootballFixtureDetailsImporter.ImportedFixture::fixtureId)
                .containsExactly(7001L, 7002L);
        assertThat(imported.getLast().result().imported()).containsExactly("statistics");
        assertThat(statisticShotsBySide()).containsExactlyInAnyOrder(3, 9, 8, 14);
        assertThat(fixtureDetails.importBatch(List.of(first, second))).isEqualTo(imported);
    }

    @Test
    void rollsBackEarlierFixtureDetailUpdatesWhenTheLastSectionFails() {
        run(2024, 7001, EARLY, "Original");
        var goal = new Event(12, null, 201L, GOAL, "Scorer", null, 11L, null);
        var first = details(EARLY, goal, "Home keeper", 9, "Away keeper");
        fixtureDetails.importSample(first);

        var card = new Event(18, null, 202L, RED_CARD, "Booked", null, null, null);
        // The final section writes its home players before the away name exceeds the database constraint.
        var invalid = details(LATE, card, "Replacement keeper", 15, "x".repeat(201));
        assertThatThrownBy(() -> fixtureDetails.importSample(invalid))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(eventKinds()).containsExactly("GOAL");
        assertThat(lineupPlayers()).containsExactly("Home keeper", "Starter", "Substitute", "Visiting keeper");
        assertThat(statisticShotsBySide()).containsExactly(3, 9);
        assertThat(statisticPlayers()).containsExactly("Home keeper", "Second home player", "Away keeper");
        // The original capture must still pass every section's freshness check.
        assertThat(fixtureDetails.importSample(first).imported()).containsExactly("events", "lineups", "statistics", "players");

        var corrected = details(LATE, card, "Replacement keeper", 15, "New away keeper");
        assertThat(fixtureDetails.importSample(corrected).imported()).containsExactly("events", "lineups", "statistics", "players");
        assertThat(eventKinds()).containsExactly("RED_CARD");
        assertThat(lineupPlayers()).containsExactly("Replacement keeper", "Starter", "Substitute", "Visiting keeper");
        assertThat(statisticShotsBySide()).containsExactly(3, 15);
        assertThat(statisticPlayers()).containsExactly("Replacement keeper", "Second home player", "New away keeper");
    }

    @Test
    void rejectsFixtureDetailsWithReversedParticipantsBeforeWritingAnySection() {
        run(2024, 7001, EARLY, "Original");
        var goal = new Event(12, null, 201L, GOAL, "Scorer", null, 11L, null);
        var sample = details(EARLY, goal, "Home keeper", 9, "Away keeper");
        var reversed = new ApiFootballFixtureDetailsSample(7001, 202, 201,
                sample.events(), sample.lineups(), sample.statistics(), sample.players());

        assertThatThrownBy(() -> fixtureDetails.importSample(reversed))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("do not match the catalog fixture");
        assertThat(eventKinds()).isEmpty();
        assertThat(lineupPlayers()).isEmpty();
        assertThat(statisticShotsBySide()).isEmpty();
        assertThat(statisticPlayers()).isEmpty();
    }

    @Test
    void importsProviderRankAndFormAndKeepsTheStoredTableWhenLaterInputIsInvalid() {
        run(2024, 7001, EARLY, "Original");
        assertThat(standings.importSnapshot(standings(EARLY, 202))).isEqualTo(2);
        assertThat(standings.importSnapshot(standings(EARLY, 202))).isEqualTo(2);
        assertThat(owner.queryForMap("""
                SELECT team.api_football_id, standing.position, standing.points, standing.form
                FROM lmuml.season_standings standing JOIN lmuml.teams team ON team.id = standing.team_id
                WHERE standing.position = 1
                """)).containsEntry("api_football_id", 202L).containsEntry("position", 1)
                .containsEntry("points", 3).containsEntry("form", "W");

        assertThatThrownBy(() -> standings.importSnapshot(standings(LATE, 999)))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> standings.importSnapshot(standings(EARLY.minusSeconds(1), 202)))
                .isInstanceOf(IllegalStateException.class);
        assertThat(owner.queryForObject("SELECT count(*) FROM lmuml.season_standings", Integer.class)).isEqualTo(2);
        assertThat(owner.queryForObject("""
                SELECT payload->>'future_root' FROM lmuml.api_football_snapshots WHERE endpoint='standings'
                """, String.class)).isEqualTo("preserved");
        // Replaying the original would fail if the newer invalid snapshot had been committed.
        assertThat(standings.importSnapshot(standings(EARLY, 202))).isEqualTo(2);
    }

    @Test
    void mapsTeamIdsToSidesAndKeepsBothRowsWhenAStatisticsUpdateIsRejected() {
        var first = statistics(7001, EARLY, 202, 9, 3);
        assertThatThrownBy(() -> fixtureStatistics.importSample(first))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("Import this fixture");

        run(2024, 7001, EARLY, "Original");
        fixtureStatistics.importSample(first);
        fixtureStatistics.importSample(first);
        assertThat(statisticShotsBySide()).containsExactly(3, 9);

        assertThatThrownBy(() -> fixtureStatistics.importSample(statistics(7001, LATE, 999, 15, 5)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("do not match");
        assertThatThrownBy(() -> fixtureStatistics.importSample(statistics(7001, EARLY, 202, 9, 5)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("conflicting");
        assertThat(statisticShotsBySide()).containsExactly(3, 9);

        fixtureStatistics.importSample(statistics(7001, LATE, 202, 15, 5));
        assertThatThrownBy(() -> fixtureStatistics.importSample(first))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("Newer");
        assertThat(statisticShotsBySide()).containsExactly(5, 15);
    }

    @Test
    void acceptsAnEarlierStatisticsCaptureForTheCorrectedPairing() {
        run(2024, 7001, EARLY, "Original");
        fixtureStatistics.importSample(statistics(7001, LATE, 202, 9, 3));

        Instant correction = LATE.plusSeconds(1);
        importer.importSnapshots(leagues(2024, correction, "Corrected"),
                fixtures(2024, 7001, correction, "Corrected", 203));

        assertThatThrownBy(() -> fixtureStatistics.importSample(statistics(7001, correction, 202, 15, 5)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("do not match");
        fixtureStatistics.importSample(statistics(7001, EARLY, 203, 15, 5));
        assertThat(statisticShotsBySide()).containsExactly(5, 15);
        assertThat(owner.queryForList("""
                SELECT team.api_football_id FROM lmuml.match_statistics stats
                JOIN lmuml.teams team ON team.id = stats.team_id ORDER BY stats.side
                """, Long.class)).containsExactly(203L, 201L);
        assertThatThrownBy(() -> fixtureStatistics.importSample(statistics(7001, EARLY.minusSeconds(1), 203, 1, 2)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("Newer");
    }

    @Test
    void replacesTheTimelineAtomicallyAndDistinguishesAnEmptyCapture() {
        var goal = new Event(12, null, 201L, GOAL, "Scorer", "Assist", 11L, 12L);
        var card = new Event(14, null, 202L, YELLOW_CARD, "Booked", null, null, null);
        var first = events(EARLY, card, goal);
        assertThatThrownBy(() -> fixtureEvents.importSample(first))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("Import this fixture");

        run(2024, 7001, EARLY, "Original");
        fixtureEvents.importSample(first);
        owner.update("UPDATE lmuml.match_events SET provider_player_id = NULL, related_provider_player_id = NULL");
        var renamedGoal = new Event(12, null, 201L, GOAL, "Different scorer", "Assist", 11L, 12L);
        assertThatThrownBy(() -> fixtureEvents.importSample(events(EARLY, renamedGoal, card)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("conflicting");
        assertThat(owner.queryForObject("SELECT provider_player_id FROM lmuml.match_events WHERE position = 0",
                Long.class)).isNull();

        fixtureEvents.importSample(first);
        fixtureEvents.importSample(first);
        assertThat(owner.queryForList("SELECT provider_player_id FROM lmuml.match_events ORDER BY position", Long.class))
                .containsExactly(11L, null);
        assertThat(owner.queryForList("SELECT related_provider_player_id FROM lmuml.match_events ORDER BY position", Long.class))
                .containsExactly(12L, null);
        var differentAssistId = new Event(12, null, 201L, GOAL, "Scorer", "Assist", 11L, 13L);
        assertThatThrownBy(() -> fixtureEvents.importSample(events(EARLY, differentAssistId, card)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("conflicting");
        var missingScorerId = new Event(12, null, 201L, GOAL, "Scorer", "Assist", null, 12L);
        assertThatThrownBy(() -> fixtureEvents.importSample(events(EARLY, missingScorerId, card)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("conflicting");
        assertThat(owner.queryForList("SELECT side FROM lmuml.match_events ORDER BY position", String.class))
                .containsExactly("HOME", "AWAY");
        assertThat(eventKinds()).containsExactly("GOAL", "YELLOW_CARD");

        assertThatThrownBy(() -> fixtureEvents.importSample(events(EARLY, goal)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("conflicting");
        assertThatThrownBy(() -> fixtureEvents.importSample(events(EARLY.minusSeconds(1), goal, card)))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("Newer");
        var unrelated = new Event(18, null, 999L, GOAL, "Unknown", null, null, null);
        assertThatThrownBy(() -> fixtureEvents.importSample(events(LATE, goal, unrelated)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("does not match");
        // Force a persistence failure after the snapshot and first event were written.
        var invalid = new Event(20, null, 202L, RED_CARD, "a".repeat(201), null, null, null);
        assertThatThrownBy(() -> fixtureEvents.importSample(events(LATE, goal, invalid)))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(eventKinds()).containsExactly("GOAL", "YELLOW_CARD");
        fixtureEvents.importSample(first);

        fixtureEvents.importSample(events(LATE));
        fixtureEvents.importSample(events(LATE));
        assertThat(eventKinds()).isEmpty();
        assertThat(owner.queryForObject("SELECT count(*) FROM lmuml.match_event_snapshots", Integer.class)).isOne();
    }

    @Test
    void capturesTheCorrectedPairingAndRejectsEventsFromTheFormerTeam() {
        run(2024, 7001, EARLY, "Original");
        var originalCard = new Event(14, null, 202L, YELLOW_CARD, "Booked", null, null, null);
        fixtureEvents.importSample(events(LATE, originalCard));
        Instant correction = LATE.plusSeconds(1);
        importer.importSnapshots(leagues(2024, correction, "Corrected"),
                fixtures(2024, 7001, correction, "Corrected", 203));
        assertThatThrownBy(() -> fixtureEvents.importSample(events(correction, originalCard)))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("does not match");

        var correctedCard = new Event(14, null, 203L, RED_CARD, "Booked", null, null, null);
        fixtureEvents.importSample(events(EARLY, correctedCard));
        assertThat(eventKinds()).containsExactly("RED_CARD");
        assertThat(owner.queryForObject("""
                SELECT team.api_football_id FROM lmuml.match_event_snapshots snapshot
                JOIN lmuml.teams team ON team.id = snapshot.away_team_id
                """, Long.class)).isEqualTo(203L);
    }

    @Test
    void replacesBothLineupsAsAUnitWhenAFixtureRosterChanges() {
        var first = lineups(EARLY, 202, "Goalkeeper", "Visiting keeper");
        assertThatThrownBy(() -> fixtureLineups.importSample(first))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("Import this fixture");

        run(2024, 7001, EARLY, "Original");
        fixtureLineups.importSample(first);
        owner.update("UPDATE lmuml.match_lineup_players SET provider_player_id = NULL");
        assertThatThrownBy(() -> fixtureLineups.importSample(lineups(EARLY, 202, "Changed", "Visiting keeper")))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("conflicting");
        assertThat(owner.queryForObject("SELECT count(provider_player_id) FROM lmuml.match_lineup_players",
                Integer.class)).isZero();

        fixtureLineups.importSample(first);
        fixtureLineups.importSample(first);
        assertThat(owner.queryForList("""
                SELECT provider_player_id FROM lmuml.match_lineup_players
                ORDER BY side DESC, starter DESC, position_index
                """, Long.class)).containsExactly(11L, 12L, null, 31L);
        owner.update("UPDATE lmuml.match_lineup_players SET provider_player_id = 99 WHERE player_name = 'Starter'");
        assertThatThrownBy(() -> fixtureLineups.importSample(first))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("conflicting");
        owner.update("UPDATE lmuml.match_lineup_players SET provider_player_id = 12 WHERE player_name = 'Starter'");
        assertThat(lineupPlayers()).containsExactly("Goalkeeper", "Starter", "Substitute", "Visiting keeper");
        assertThat(owner.queryForList("""
                SELECT team.api_football_id FROM lmuml.match_lineups lineup
                JOIN lmuml.teams team ON team.id = lineup.team_id ORDER BY lineup.side DESC
                """, Long.class)).containsExactly(201L, 202L);

        var sameTime = lineups(EARLY, 202, "Changed", "Visiting keeper");
        assertThatThrownBy(() -> fixtureLineups.importSample(sameTime))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("conflicting");
        assertThatThrownBy(() -> fixtureLineups.importSample(lineups(LATE, 999, "Changed", "Visiting keeper")))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("do not match");
        // Trigger a database rejection after both lineup headers and the home roster are replaced.
        assertThatThrownBy(() -> fixtureLineups.importSample(lineups(LATE, 202, "Changed", "x".repeat(201))))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(lineupPlayers()).containsExactly("Goalkeeper", "Starter", "Substitute", "Visiting keeper");
        fixtureLineups.importSample(first);

        var newHome = new TeamLineup(201, "3-4-3", null, List.of(keeper("New goalkeeper")), List.of());
        fixtureLineups.importSample(new ApiFootballFixtureLineupsSample(7001, LATE,
                List.of(first.teams().getFirst(), newHome)));
        assertThat(lineupPlayers()).containsExactly("New goalkeeper", "Visiting keeper");
        assertThatThrownBy(() -> fixtureLineups.importSample(first))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("Newer");
    }

    @Test
    void acceptsAnEarlierLineupCaptureForTheCorrectedPairing() {
        run(2024, 7001, EARLY, "Original");
        fixtureLineups.importSample(lineups(LATE, 202, "Original", "Former opponent"));

        Instant correction = LATE.plusSeconds(1);
        importer.importSnapshots(leagues(2024, correction, "Corrected"),
                fixtures(2024, 7001, correction, "Corrected", 203));
        assertThatThrownBy(() -> fixtureLineups.importSample(lineups(correction, 202, "Original", "Former opponent")))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("do not match");
        fixtureLineups.importSample(lineups(EARLY, 203, "New goalkeeper", "Corrected opponent"));
        assertThat(lineupPlayers()).containsExactly("New goalkeeper", "Starter", "Substitute", "Corrected opponent");
        assertThat(owner.queryForObject("""
                SELECT team.api_football_id FROM lmuml.match_lineups lineup
                JOIN lmuml.teams team ON team.id = lineup.team_id WHERE lineup.side = 'AWAY'
                """, Long.class)).isEqualTo(203L);
    }

    @Test
    void replacesBothPlayerListsAtomicallyAndRejectsConflictingOrOlderSamples() {
        var first = playerStatistics(EARLY, 202, "Home keeper", "Away keeper");
        assertThatThrownBy(() -> fixturePlayers.importSample(first))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("Import this fixture");

        run(2024, 7001, EARLY, "Original");
        fixturePlayers.importSample(first);
        fixturePlayers.importSample(first);
        assertThat(statisticPlayers()).containsExactly("Home keeper", "Second home player", "Away keeper");
        assertThat(owner.queryForMap("""
                SELECT minutes, rating, goals, assists, shots_total, shots_on_target, passes_total, key_passes, tackles, saves
                FROM lmuml.match_player_statistics WHERE side = 'HOME' AND position_index = 0
                """)).containsEntry("minutes", 90).containsEntry("rating", new BigDecimal("7.20"))
                .containsEntry("goals", 0).containsEntry("assists", null).containsEntry("shots_total", null)
                .containsEntry("shots_on_target", null).containsEntry("passes_total", 16)
                .containsEntry("key_passes", 0).containsEntry("tackles", null).containsEntry("saves", 4);

        assertThatThrownBy(() -> fixturePlayers.importSample(playerStatistics(EARLY, 202, "Changed", "Away keeper")))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("conflicting");
        // The away row fails after the snapshot and home rows have been written.
        assertThatThrownBy(() -> fixturePlayers.importSample(playerStatistics(LATE, 202, "Changed", "x".repeat(201))))
                .isInstanceOf(DataIntegrityViolationException.class);
        assertThat(statisticPlayers()).containsExactly("Home keeper", "Second home player", "Away keeper");
        fixturePlayers.importSample(first);

        var shorterHome = new TeamPlayers(201, List.of(keeperStatistics(18, "Replacement")));
        fixturePlayers.importSample(new ApiFootballFixturePlayersSample(7001, LATE,
                List.of(first.teams().getFirst(), shorterHome)));
        assertThat(statisticPlayers()).containsExactly("Replacement", "Away keeper");
        assertThatThrownBy(() -> fixturePlayers.importSample(first))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("Newer");
    }

    @Test
    void storesStatisticsForCorrectedParticipantsWithoutReusingTheFormerTeams() {
        run(2024, 7001, EARLY, "Original");
        fixturePlayers.importSample(playerStatistics(LATE, 202, "Original keeper", "Former opponent"));

        Instant correction = LATE.plusSeconds(1);
        importer.importSnapshots(leagues(2024, correction, "Corrected"),
                fixtures(2024, 7001, correction, "Corrected", 203));
        assertThatThrownBy(() -> fixturePlayers.importSample(playerStatistics(correction, 202, "Home", "Away")))
                .isInstanceOf(IllegalArgumentException.class).hasMessageContaining("do not match");
        fixturePlayers.importSample(playerStatistics(EARLY, 203, "New keeper", "Corrected opponent"));
        assertThat(statisticPlayers()).containsExactly("New keeper", "Second home player", "Corrected opponent");
        assertThat(owner.queryForObject("""
                SELECT team.api_football_id FROM lmuml.match_player_stat_snapshots snapshot
                JOIN lmuml.teams team ON team.id = snapshot.away_team_id
                """, Long.class)).isEqualTo(203L);
    }

    @Test
    void importsMetadataAndSnapshotsUsingRestrictedRoleAndPreservesIdentityOnReplay() {
        var result = run(2024, 7001, EARLY, "Original");
        assertThat(result).isEqualTo(new ApiFootballCatalogImporter.ImportResult(1, 1, 2, 1));
        var ids = identities();
        run(2024, 7001, EARLY, "Original");
        assertThat(identities()).isEqualTo(ids);
        assertCounts(1, 1, 2, 1, 2);
        assertThat(owner.queryForMap("SELECT fulltime_home, fulltime_away, extratime_home, extratime_away, home_winner, venue_api_football_id, venue_name FROM lmuml.matches"))
                .containsEntry("fulltime_home", 1).containsEntry("fulltime_away", 0)
                .containsEntry("extratime_home", 0).containsEntry("extratime_away", 1)
                .containsEntry("home_winner", true).containsEntry("venue_api_football_id", null)
                .containsEntry("venue_name", "Example Ground");
        assertThat(owner.queryForObject("SELECT coverage->>'future_flag' FROM lmuml.seasons", String.class)).isEqualTo("true");
        assertThat(owner.queryForObject("SELECT count(*) FROM lmuml.teams WHERE logo_url IS NOT NULL", Integer.class)).isEqualTo(2);
        assertThat(owner.queryForObject("SELECT payload->>'future_root' FROM lmuml.api_football_snapshots WHERE endpoint='fixtures'", String.class))
                .isEqualTo("preserved");
    }

    @Test
    void updatesNewerInputWithoutChangingUuidsAndRejectsOlderBundles() {
        run(2024, 7001, EARLY, "Original");
        var ids = identities();
        run(2024, 7001, LATE, "Updated");
        assertThat(identities()).isEqualTo(ids);
        assertThat(owner.queryForObject("SELECT name FROM lmuml.teams WHERE api_football_id=201", String.class)).isEqualTo("Updated home");
        assertThatThrownBy(() -> run(2024, 7001, EARLY, "Original")).isInstanceOf(IllegalStateException.class);
        assertThat(owner.queryForObject("SELECT name FROM lmuml.teams WHERE api_football_id=201", String.class)).isEqualTo("Updated home");
        assertCounts(1, 1, 2, 1, 2);
    }

    @Test
    void invalidTypedDataDoesNotWriteAnything() {
        var valid = fixtures(2024, 7001, EARLY, "Original");
        String invalid = valid.payload().toString().replace("\"id\":201", "\"id\":0");
        var malformed = new ApiFootballSnapshot(FIXTURES, 2, 2024, EARLY, JSON.readTree(invalid));
        assertThatThrownBy(() -> importer.importSnapshots(leagues(2024, EARLY, "Original"), malformed))
                .isInstanceOf(IllegalArgumentException.class);
        assertCounts(0, 0, 0, 0, 0);
    }

    @Test
    void fixtureSeasonConflictRollsBackEntireNewSeasonAndBothSnapshots() {
        run(2025, 7001, EARLY, "Original");
        var before = identities();
        assertThatThrownBy(() -> run(2024, 7001, LATE, "Conflicting"))
                .isInstanceOf(IllegalStateException.class);
        assertThat(identities()).isEqualTo(before);
        assertThat(owner.queryForObject("SELECT count(*) FROM lmuml.api_football_snapshots WHERE season=2024", Integer.class)).isZero();
        assertThat(owner.queryForObject("SELECT name FROM lmuml.teams WHERE api_football_id=201", String.class)).isEqualTo("Original home");
        assertCounts(1, 1, 2, 1, 2);
    }

    @Test
    void olderOtherSeasonDoesNotRegressSharedCompetitionAndTeamMetadata() {
        run(2025, 7001, LATE, "Newer");
        run(2024, 7002, EARLY, "Older");
        assertCounts(1, 2, 2, 2, 4);
        assertThat(owner.queryForObject("SELECT name FROM lmuml.competitions", String.class)).isEqualTo("Newer cup");
        assertThat(owner.queryForObject("SELECT name FROM lmuml.teams WHERE api_football_id=201", String.class)).isEqualTo("Newer home");
    }

    @Test
    void emptyFixtureResponseDoesNotDeletePreviouslyImportedMatches() {
        run(2024, 7001, EARLY, "Original");
        var raw = JSON.readTree("""
                {"get":"fixtures","parameters":{"league":"2","season":"2024"},"errors":[],
                 "results":0,"paging":{"current":1,"total":1},"response":[]}
                """);
        importer.importSnapshots(leagues(2024, LATE, "Original"), new ApiFootballSnapshot(FIXTURES, 2, 2024, LATE, raw));
        assertCounts(1, 1, 2, 1, 2);
    }

    @Test
    void importerCannotDeleteChangeSchemaOrReadMigrationHistory() {
        for (String sql : new String[] {"DELETE FROM lmuml.teams", "TRUNCATE lmuml.matches",
                "CREATE TABLE lmuml.forbidden (id INTEGER)", "SELECT * FROM lmuml.flyway_schema_history"}) {
            assertThatThrownBy(() -> importerSql.execute(sql)).isInstanceOf(DataAccessException.class);
        }
    }

    private ApiFootballCatalogImporter.ImportResult run(int year, long match, Instant time, String label) {
        return importer.importSnapshots(leagues(year, time, label), fixtures(year, match, time, label));
    }

    private List<Integer> statisticShotsBySide() {
        return owner.queryForList("SELECT shots_total FROM lmuml.match_statistics ORDER BY side", Integer.class);
    }

    private List<String> eventKinds() {
        return owner.queryForList("SELECT kind FROM lmuml.match_events ORDER BY position", String.class);
    }

    private List<String> lineupPlayers() {
        return owner.queryForList("""
                SELECT player_name FROM lmuml.match_lineup_players
                ORDER BY side DESC, starter DESC, position_index
                """, String.class);
    }

    private static ApiFootballFixtureLineupsSample lineups(Instant capturedAt, long awayTeam,
            String homeKeeper, String awayKeeper) {
        var visitor = new TeamLineup(awayTeam, null, null,
                List.of(new Player(awayKeeper, 1, GOALKEEPER, 1, 1, 31L)), List.of());
        var home = new TeamLineup(201, "4-3-3", "Coach",
                List.of(keeper(homeKeeper), new Player("Starter", 7, MIDFIELDER, 3, 2, 12L)),
                List.of(new Player("Substitute", 12, MIDFIELDER, null, null, null)));
        return new ApiFootballFixtureLineupsSample(7001, capturedAt, List.of(visitor, home));
    }

    private static Player keeper(String name) {
        return new Player(name, 1, GOALKEEPER, 1, 1, 11L);
    }

    private List<String> statisticPlayers() {
        return owner.queryForList("""
                SELECT name FROM lmuml.match_player_statistics ORDER BY side DESC, position_index
                """, String.class);
    }

    private static ApiFootballFixturePlayersSample playerStatistics(Instant capturedAt, long awayTeam,
            String homeKeeper, String awayKeeper) {
        var visitor = new TeamPlayers(awayTeam, List.of(keeperStatistics(15, awayKeeper)));
        var home = new TeamPlayers(201, List.of(keeperStatistics(18, homeKeeper), new ApiFootballFixturePlayersSample.Player(
                12, "Second home player", 22, MIDFIELDER,
                new ApiFootballFixturePlayersSample.Statistics(45, null, null, null, null, null, 15, null, 1, null))));
        return new ApiFootballFixturePlayersSample(7001, capturedAt, List.of(visitor, home));
    }

    private static ApiFootballFixturePlayersSample.Player keeperStatistics(long id, String name) {
        return new ApiFootballFixturePlayersSample.Player(id, name, 1, GOALKEEPER,
                new ApiFootballFixturePlayersSample.Statistics(90, new BigDecimal("7.2"), 0, null,
                        null, null, 16, 0, null, 4));
    }

    private static ApiFootballFixtureEventsSample events(Instant capturedAt, Event... events) {
        return new ApiFootballFixtureEventsSample(7001, capturedAt, List.of(events));
    }

    private static ApiFootballFixtureDetailsSample details(Instant capturedAt, Event event, String homeKeeper,
            int homeShots, String awayKeeper) {
        return new ApiFootballFixtureDetailsSample(7001, 201, 202,
                Optional.of(events(capturedAt, event)),
                Optional.of(lineups(capturedAt, 202, homeKeeper, "Visiting keeper")),
                Optional.of(statistics(7001, capturedAt, 202, homeShots, 3)),
                Optional.of(playerStatistics(capturedAt, 202, homeKeeper, awayKeeper)));
    }

    private static ApiFootballFixtureStatisticsSample statistics(long fixture, Instant capturedAt, long awayTeam,
            int homeShots, int awayShots) {
        return new ApiFootballFixtureStatisticsSample(fixture, capturedAt, List.of(
                new TeamStatistics(awayTeam, new Statistics(awayShots, null, null, null, null, null)),
                new TeamStatistics(201, new Statistics(homeShots, null, null, null, null, null))));
    }

    private static ApiFootballSnapshot leagues(int year, Instant time, String label) {
        return new ApiFootballSnapshot(LEAGUES, 2, year, time, JSON.readTree("""
                {"get":"leagues","parameters":{"id":"2","season":"%d"},"errors":[],"results":1,
                 "paging":{"current":1,"total":1},"response":[{"league":{"id":2,"name":"%s cup","type":"Cup",
                 "logo":"https://example.test/cup.png"},"country":{"name":"World"},
                 "seasons":[{"year":%d,"coverage":{"future_flag":true}}]}]}
                """.formatted(year, label, year)));
    }

    private static ApiFootballSnapshot fixtures(int year, long match, Instant time, String label) {
        return fixtures(year, match, time, label, 202);
    }

    private static ApiFootballSnapshot fixtures(int year, long match, Instant time, String label, long awayTeam) {
        return new ApiFootballSnapshot(FIXTURES, 2, year, time, JSON.readTree("""
                {"get":"fixtures","parameters":{"league":"2","season":"%d"},"errors":[],"results":1,
                 "paging":{"current":1,"total":1},"future_root":"preserved","response":[{
                 "fixture":{"id":%d,"status":{"short":"PEN","elapsed":120},"referee":"Example referee",
                 "venue":{"name":"Example Ground","city":"Example city"}},"league":{"id":2,"season":%d},
                 "teams":{"home":{"id":201,"name":"%s home","logo":"https://example.test/home.png","winner":true},
                          "away":{"id":%d,"name":"%s away","logo":"https://example.test/away.png","winner":false}},
                 "goals":{"home":1,"away":1},"score":{"fulltime":{"home":1,"away":0},"extratime":{"home":0,"away":1}}}]}
                """.formatted(year, match, year, label, awayTeam, label)));
    }

    private static ApiFootballSnapshot standings(Instant time, long winningTeam) {
        return new ApiFootballSnapshot(STANDINGS, 2, 2024, time, JSON.readTree("""
                {"get":"standings","parameters":{"league":"2","season":"2024"},"errors":[],"results":1,
                 "paging":{"current":1,"total":1},"future_root":"preserved","response":[{"league":{
                 "id":2,"season":2024,"standings":[[
                   {"rank":1,"team":{"id":%d},"points":3,"goalsDiff":1,"form":"W",
                    "all":{"played":1,"win":1,"draw":0,"lose":0,"goals":{"for":1,"against":0}}},
                   {"rank":2,"team":{"id":201},"points":0,"goalsDiff":-1,"form":"L",
                    "all":{"played":1,"win":0,"draw":0,"lose":1,"goals":{"for":0,"against":1}}}
                 ]]}}]}
                """.formatted(winningTeam)));
    }

    private Object identities() {
        return owner.queryForList("""
                SELECT 'competition' AS kind, api_football_id::text AS provider, id FROM lmuml.competitions
                UNION ALL SELECT 'team', api_football_id::text, id FROM lmuml.teams
                UNION ALL SELECT 'match', api_football_id::text, id FROM lmuml.matches
                UNION ALL SELECT 'season', start_year::text, id FROM lmuml.seasons ORDER BY kind, provider
                """);
    }

    private void assertCounts(int competitions, int seasons, int teams, int matches, int snapshots) {
        String[] tables = {"competitions", "seasons", "teams", "matches", "api_football_snapshots"};
        int[] expected = {competitions, seasons, teams, matches, snapshots};
        for (int i = 0; i < tables.length; i++) {
            assertThat(owner.queryForObject("SELECT count(*) FROM lmuml." + tables[i], Integer.class)).isEqualTo(expected[i]);
        }
    }
}
