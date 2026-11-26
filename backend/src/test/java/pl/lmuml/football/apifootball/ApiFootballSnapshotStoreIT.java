package pl.lmuml.football.apifootball;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Stream;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.support.JdbcTransactionManager;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.UnexpectedRollbackException;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static pl.lmuml.football.apifootball.ApiFootballSnapshot.Endpoint.FIXTURES;
import static pl.lmuml.football.apifootball.ApiFootballSnapshot.Endpoint.LEAGUES;

@Testcontainers
class ApiFootballSnapshotStoreIT {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final UUID TEAM = UUID.fromString("20000000-0000-0000-0000-000000000001");
    private static final Instant FIRST_CAPTURE = Instant.parse("2026-11-02T10:00:00Z");
    private static final Instant LATER_CAPTURE = FIRST_CAPTURE.plusSeconds(60);

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(
            DockerImageName.parse("postgres:18.6-trixie@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6")
                    .asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("lmuml_test")
            .withUsername("test_admin")
            .withPassword("test-only-admin-password")
            .withInitScript("db/test-app-role.sql");

    private JdbcTemplate jdbc;
    private TransactionTemplate transaction;
    private ApiFootballSnapshotStore store;

    @BeforeEach
    void prepareIsolatedDatabase() {
        var dataSource = new DriverManagerDataSource(POSTGRES.getJdbcUrl(),
                "lmuml_migrator_test", "test-only-migrator-password");
        Flyway.configure().dataSource(dataSource)
                .defaultSchema("lmuml").schemas("lmuml").createSchemas(false)
                .cleanDisabled(true).baselineOnMigrate(false).locations("classpath:db/migration")
                .placeholders(Map.of("runtime", "lmuml_app_test", "importer", "lmuml_importer_test")).load().migrate();
        jdbc = new JdbcTemplate(dataSource);
        // This container belongs only to this test class, never to the local development database.
        jdbc.update("DELETE FROM lmuml.api_football_snapshots");
        jdbc.update("DELETE FROM lmuml.teams");
        jdbc.update("INSERT INTO lmuml.teams (id, name, api_football_id) VALUES (?, 'Original team', 201)", TEAM);
        var transactions = new JdbcTransactionManager(dataSource);
        transaction = new TransactionTemplate(transactions);
        store = new ApiFootballSnapshotStore(dataSource, transactions, JSON);
    }

    @Test
    void replacesLastResponseAndCatalogTogetherWhileKeepingUnknownFields() {
        save(snapshot(FIXTURES, 2, 2024, FIRST_CAPTURE, "first"));
        var newer = snapshot(FIXTURES, 2, 2024, LATER_CAPTURE, "newer");

        transaction.executeWithoutResult(status -> {
            store.save(newer);
            renameTeam("Updated team");
        });

        assertThat(snapshotCount()).isEqualTo(1);
        assertThat(teamName()).isEqualTo("Updated team");
        assertThat(storedPayload(FIXTURES, 2, 2024)).isEqualTo(newer.payload());
        assertThat(storedPayload(FIXTURES, 2, 2024).at("/future_field/marker").asString()).isEqualTo("newer");
        assertThat(jdbc.queryForObject("SELECT captured_at FROM lmuml.api_football_snapshots", OffsetDateTime.class)
                .toInstant()).isEqualTo(LATER_CAPTURE);
    }

    @Test
    void keepsEndpointsLeaguesAndSeasonsInSeparateRows() {
        List<ApiFootballSnapshot> snapshots = List.of(
                snapshot(LEAGUES, 2, 2024, FIRST_CAPTURE, "league metadata"),
                snapshot(FIXTURES, 2, 2024, FIRST_CAPTURE, "first season"),
                snapshot(FIXTURES, 2, 2025, FIRST_CAPTURE, "second season"),
                snapshot(FIXTURES, 3, 2024, FIRST_CAPTURE, "other league"));
        transaction.executeWithoutResult(status -> snapshots.forEach(store::save));

        assertThat(snapshotCount()).isEqualTo(4);
        for (var snapshot : snapshots) {
            assertThat(storedPayload(snapshot.endpoint(), snapshot.leagueId(), snapshot.season()))
                    .isEqualTo(snapshot.payload());
        }
    }

    @Test
    void acceptsIdenticalReplayButRejectsConflictingPayloadAtTheSameCaptureTime() {
        var original = snapshot(FIXTURES, 2, 2024, FIRST_CAPTURE, "original");
        save(original);
        save(snapshot(FIXTURES, 2, 2024, FIRST_CAPTURE, "original"));

        assertThatThrownBy(() -> save(snapshot(FIXTURES, 2, 2024, FIRST_CAPTURE, "conflict")))
                .isInstanceOf(IllegalStateException.class);

        assertThat(snapshotCount()).isEqualTo(1);
        assertThat(storedPayload(FIXTURES, 2, 2024)).isEqualTo(original.payload());
    }

    @Test
    void staleResponseRollsBackCatalogChangesMadeBeforeCallingTheStore() {
        var current = snapshot(FIXTURES, 2, 2024, LATER_CAPTURE, "current");
        save(current);

        assertThatThrownBy(() -> transaction.executeWithoutResult(status -> {
            renameTeam("Stale catalog write");
            store.save(snapshot(FIXTURES, 2, 2024, FIRST_CAPTURE, "stale"));
        })).isInstanceOf(IllegalStateException.class);

        assertThat(teamName()).isEqualTo("Original team");
        assertThat(storedPayload(FIXTURES, 2, 2024)).isEqualTo(current.payload());
    }

    @Test
    void catalogConstraintFailureRollsBackAnAlreadyUpdatedSnapshot() {
        var original = snapshot(FIXTURES, 2, 2024, FIRST_CAPTURE, "original");
        save(original);

        assertThatThrownBy(() -> transaction.executeWithoutResult(status -> {
            store.save(snapshot(FIXTURES, 2, 2024, LATER_CAPTURE, "must roll back"));
            renameTeam("   ");
        })).isInstanceOf(DataIntegrityViolationException.class);

        assertThat(teamName()).isEqualTo("Original team");
        assertThat(storedPayload(FIXTURES, 2, 2024)).isEqualTo(original.payload());
        assertThat(jdbc.queryForObject("SELECT captured_at FROM lmuml.api_football_snapshots", OffsetDateTime.class)
                .toInstant()).isEqualTo(FIRST_CAPTURE);
    }

    @Test
    void catchingStaleResponseCannotCommitOnlyTheCatalogChanges() {
        var current = snapshot(FIXTURES, 2, 2024, LATER_CAPTURE, "current");
        save(current);

        assertThatThrownBy(() -> transaction.executeWithoutResult(status -> {
            renameTeam("Must not commit");
            try {
                store.save(snapshot(FIXTURES, 2, 2024, FIRST_CAPTURE, "stale"));
            } catch (IllegalStateException expected) {
                // Simulate a caller trying to suppress a stale-generation failure.
            }
        })).isInstanceOf(UnexpectedRollbackException.class);

        assertThat(teamName()).isEqualTo("Original team");
        assertThat(storedPayload(FIXTURES, 2, 2024)).isEqualTo(current.payload());
    }

    @Test
    void refusesToCommitAResponseOutsideTheCallersTransaction() {
        assertThatThrownBy(() -> store.save(snapshot(FIXTURES, 2, 2024, FIRST_CAPTURE, "standalone")))
                .isInstanceOf(IllegalTransactionStateException.class);
        assertThat(snapshotCount()).isZero();
    }

    @Test
    void storesAnExplicitEmptyFixtureResponseWithoutInventingCatalogRows() {
        JsonNode payload = JSON.readTree("""
                {"get":"fixtures","parameters":{"league":"2","season":"2024"},
                 "errors":[],"results":0,"paging":{"current":1,"total":1},"response":[]}
                """);
        var empty = new ApiFootballSnapshot(FIXTURES, 2, 2024, FIRST_CAPTURE, payload);

        save(empty);

        assertThat(snapshotCount()).isEqualTo(1);
        assertThat(storedPayload(FIXTURES, 2, 2024)).isEqualTo(payload);
        assertThat(jdbc.queryForObject("SELECT count(*) FROM lmuml.matches", Integer.class)).isZero();
        assertThat(jdbc.queryForObject("SELECT count(*) FROM lmuml.teams", Integer.class)).isEqualTo(1);
        assertThat(teamName()).isEqualTo("Original team");
    }

    @ParameterizedTest
    @MethodSource("unusableResponses")
    void unusableResponseLeavesTheLastGoodSnapshotAndCatalogUnchanged(JsonNode payload) {
        var original = snapshot(FIXTURES, 2, 2024, FIRST_CAPTURE, "original");
        save(original);

        assertThatThrownBy(() -> transaction.executeWithoutResult(status -> {
            renameTeam("Unusable response");
            store.save(new ApiFootballSnapshot(FIXTURES, 2, 2024, LATER_CAPTURE, payload));
        })).isInstanceOf(IllegalArgumentException.class);

        assertThat(snapshotCount()).isEqualTo(1);
        assertThat(teamName()).isEqualTo("Original team");
        assertThat(storedPayload(FIXTURES, 2, 2024)).isEqualTo(original.payload());
    }

    private static Stream<JsonNode> unusableResponses() {
        String valid = envelope(FIXTURES, 2, 2024, "invalid candidate");
        return Stream.of(
                valid.replace("\"errors\":[]", "\"errors\":{\"plan\":\"synthetic failure\"}"),
                valid.replace("\"total\":1", "\"total\":2"),
                valid.replace("\"id\":2", "\"id\":3"),
                valid.replace("\"season\":2024", "\"season\":2025"),
                valid.replace("\"league\":\"2\"", "\"league\":\"3\""),
                valid.replace("\"parameters\":{", "\"parameters\":{\"date\":\"2026-11-02\","))
                .map(JSON::readTree);
    }

    private ApiFootballSnapshot snapshot(ApiFootballSnapshot.Endpoint endpoint, long leagueId, int season,
                                         Instant capturedAt, String marker) {
        return new ApiFootballSnapshot(endpoint, leagueId, season, capturedAt,
                JSON.readTree(envelope(endpoint, leagueId, season, marker)));
    }

    private static String envelope(ApiFootballSnapshot.Endpoint endpoint, long leagueId, int season, String marker) {
        String parameter = endpoint == LEAGUES ? "id" : "league";
        String response = endpoint == LEAGUES
                ? "[{\"league\":{\"id\":" + leagueId + "},\"seasons\":[{\"year\":" + season + "}]}]"
                : "[{\"fixture\":{\"id\":7001},\"league\":{\"id\":" + leagueId + ",\"season\":" + season + "}}]";
        return "{\"get\":\"" + endpoint.path() + "\",\"parameters\":{\"" + parameter + "\":\"" + leagueId
                + "\",\"season\":\"" + season + "\"},\"errors\":[],\"results\":1,"
                + "\"paging\":{\"current\":1,\"total\":1},\"response\":" + response
                + ",\"future_field\":{\"marker\":\"" + marker + "\"}}";
    }

    private void save(ApiFootballSnapshot snapshot) {
        transaction.executeWithoutResult(status -> store.save(snapshot));
    }

    private void renameTeam(String name) {
        jdbc.update("UPDATE lmuml.teams SET name = ? WHERE id = ?", name, TEAM);
    }

    private String teamName() {
        return jdbc.queryForObject("SELECT name FROM lmuml.teams WHERE id = ?", String.class, TEAM);
    }

    private int snapshotCount() {
        return jdbc.queryForObject("SELECT count(*) FROM lmuml.api_football_snapshots", Integer.class);
    }

    private JsonNode storedPayload(ApiFootballSnapshot.Endpoint endpoint, long leagueId, int season) {
        String value = jdbc.queryForObject("""
                SELECT payload::text FROM lmuml.api_football_snapshots
                WHERE endpoint = ? AND league_id = ? AND season = ?
                """, String.class, endpoint.path(), leagueId, season);
        return JSON.readTree(value);
    }
}
