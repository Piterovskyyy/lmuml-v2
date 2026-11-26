package pl.lmuml.football.matches;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.net.http.WebSocket;
import java.net.http.WebSocketHandshakeException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.CompletionStage;
import java.util.concurrent.LinkedBlockingQueue;
import java.util.concurrent.TimeUnit;

import jakarta.servlet.Filter;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.Timeout;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import pl.lmuml.LmumlApplication;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "logging.level.com.zaxxer.hikari.pool.ProxyConnection=OFF"
})
@Testcontainers
class SeasonMatchesIT {

    private static final String PATH = "/api/v1/seasons/";
    private static final String FIRST_MATCH = "30000000-0000-0000-0000-000000000001";
    private static final String SECOND_MATCH = "30000000-0000-0000-0000-000000000002";
    private static final String TEST_ADMIN_PASSWORD = "test-only-active-season-password";
    private static final String ADMIN_ACTIVE_SEASON = "/api/admin/seasons/active";

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(
            DockerImageName.parse("postgres:18.6-trixie@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6")
                    .asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("lmuml_test").withUsername("test_admin")
            .withPassword("test-only-admin-password").withInitScript("db/test-app-role.sql");

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(3)).build();
    private final JsonMapper json = JsonMapper.builder().build();

    @LocalServerPort
    private int port;

    @Autowired
    private JdbcTemplate runtime;

    @Autowired
    private WebApplicationContext webContext;

    private JdbcTemplate owner;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry properties) {
        Flyway.configure().dataSource(migrationDataSource()).schemas("lmuml").defaultSchema("lmuml")
                .createSchemas(false).cleanDisabled(true).locations("classpath:db/migration")
                .placeholders(Map.of("runtime", "lmuml_app_test", "importer", "lmuml_importer_test"))
                .load().migrate();
        properties.add("spring.datasource.url", () -> POSTGRES.getJdbcUrl()
                + (POSTGRES.getJdbcUrl().contains("?") ? "&" : "?") + "connectTimeout=3&socketTimeout=3");
        properties.add("spring.datasource.username", () -> "lmuml_app_test");
        properties.add("spring.datasource.password", () -> "test-only-app-password");
        var adminHash = Pbkdf2PasswordEncoder.defaultsForSpringSecurity_v5_8().encode(TEST_ADMIN_PASSWORD);
        properties.add("lmuml.admin.password-hash", () -> adminHash);
    }

    @BeforeEach
    void loadSyntheticCatalog() {
        var dataSource = migrationDataSource();
        owner = new JdbcTemplate(dataSource);
        for (String table : new String[] {"active_season", "betting_round_matches", "betting_round_groups", "betting_rounds",
                "season_standings", "matches", "seasons", "teams", "competitions", "api_football_snapshots"}) {
            owner.update("DELETE FROM lmuml." + table);
        }
        new ResourceDatabasePopulator(new ClassPathResource("db/fixtures/match-schedule.sql"))
                .execute(dataSource);
    }

    @Test
    void readsAndChangesTheActiveSeasonThroughTheAdminSession() throws Exception {
        MockMvc mvc = MockMvcBuilders.webAppContextSetup(webContext)
                .addFilters(webContext.getBean("springSecurityFilterChain", Filter.class))
                .build();
        mvc.perform(MockMvcRequestBuilders.get(PATH + "active")).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(content().json("{\"seasonCode\":null}"));

        var browser = new MockHttpSession();
        String originalToken = adminCsrf(mvc, browser);
        String first = "{\"seasonCode\":\"demo-2026\"}";
        mvc.perform(put(ADMIN_ACTIVE_SEASON).session(browser).contentType(MediaType.APPLICATION_JSON)
                .header("X-CSRF-TOKEN", originalToken).content(first)).andExpect(status().isUnauthorized());
        mvc.perform(post("/api/admin/login").session(browser).contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .header("X-CSRF-TOKEN", originalToken).param("username", "admin").param("password", TEST_ADMIN_PASSWORD))
                .andExpect(status().isNoContent());
        mvc.perform(put(ADMIN_ACTIVE_SEASON).session(browser).contentType(MediaType.APPLICATION_JSON)
                .content(first)).andExpect(status().isForbidden());

        String token = adminCsrf(mvc, browser);
        mvc.perform(put(ADMIN_ACTIVE_SEASON).session(browser).contentType(MediaType.APPLICATION_JSON)
                .header("X-CSRF-TOKEN", token).content("{\"seasonCode\":42}")).andExpect(status().isBadRequest());
        mvc.perform(put(ADMIN_ACTIVE_SEASON).session(browser).contentType(MediaType.APPLICATION_JSON)
                .header("X-CSRF-TOKEN", token).content("{\"seasonCode\":\"missing-season\"}"))
                .andExpect(status().isNotFound());
        mvc.perform(put(ADMIN_ACTIVE_SEASON).session(browser).contentType(MediaType.APPLICATION_JSON)
                .header("X-CSRF-TOKEN", token).content(first)).andExpect(status().isOk()).andExpect(content().json(first));
        mvc.perform(MockMvcRequestBuilders.get(PATH + "active")).andExpect(status().isOk()).andExpect(content().json(first));

        String second = "{\"seasonCode\":\"demo-2027\"}";
        mvc.perform(put(ADMIN_ACTIVE_SEASON).session(browser).contentType(MediaType.APPLICATION_JSON)
                .header("X-CSRF-TOKEN", token).content(second)).andExpect(status().isOk()).andExpect(content().json(second));
        mvc.perform(MockMvcRequestBuilders.get(PATH + "active")).andExpect(status().isOk()).andExpect(content().json(second));
        assertThat(owner.queryForObject("SELECT count(*) FROM lmuml.active_season", Integer.class)).isEqualTo(1);
    }

    private String adminCsrf(MockMvc mvc, MockHttpSession browser) throws Exception {
        var response = mvc.perform(MockMvcRequestBuilders.get("/api/admin/session").session(browser)).andExpect(status().isOk())
                .andReturn().getResponse();
        return json.readTree(response.getContentAsByteArray()).path("csrfToken").asString();
    }

    @Test
    void reportsFixtureFreshnessAndTheLatestCompletedAttemptOnlyToTheAdmin() throws Exception {
        String seasonCode = "api-football-9001-2026";
        String path = "/api/admin/seasons/" + seasonCode + "/sync-status";
        owner.update("UPDATE lmuml.seasons SET code = ? WHERE code = 'demo-2026'", seasonCode);
        MockMvc mvc = MockMvcBuilders.webAppContextSetup(webContext)
                .addFilters(webContext.getBean("springSecurityFilterChain", Filter.class))
                .build();
        mvc.perform(MockMvcRequestBuilders.get(path)).andExpect(status().isUnauthorized());

        var browser = new MockHttpSession();
        mvc.perform(post("/api/admin/login").session(browser).contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .header("X-CSRF-TOKEN", adminCsrf(mvc, browser))
                .param("username", "admin").param("password", TEST_ADMIN_PASSWORD)).andExpect(status().isNoContent());
        mvc.perform(MockMvcRequestBuilders.get(path).session(browser)).andExpect(status().isOk())
                .andExpect(header().string("Cache-Control", "no-store"))
                .andExpect(content().json("{\"lastSuccessfulAt\":null,\"lastAttempt\":null}"));

        owner.update("""
                INSERT INTO lmuml.api_football_snapshots (endpoint, league_id, season, captured_at, payload)
                VALUES ('fixtures', 9001, 2026, '2026-11-20T19:15:00Z', '{"get":"fixtures","errors":[],"private":true}')
                """);
        recordSeasonAttempt(seasonCode, "2026-11-20T21:15:00Z", "2026-11-20T21:15:11Z", "FAILED");
        recordSeasonAttempt(seasonCode, "2026-11-20T21:00:00Z", "2026-11-20T21:15:30Z", "SUCCEEDED");
        recordSeasonAttempt(seasonCode, "2026-11-20T21:15:00Z", "2026-11-20T21:15:11Z", "FAILED");

        var response = mvc.perform(MockMvcRequestBuilders.get(path).session(browser)).andExpect(status().isOk())
                .andExpect(content().json("""
                        {"lastSuccessfulAt":"2026-11-20T19:15:00Z","lastAttempt":{
                          "startedAt":"2026-11-20T21:15:00Z","finishedAt":"2026-11-20T21:15:11Z","outcome":"FAILED"
                        }}
                        """)).andReturn().getResponse();
        assertThat(response.getContentAsString()).doesNotContain("private");
        mvc.perform(MockMvcRequestBuilders.get("/api/admin/seasons/demo-2027/sync-status").session(browser))
                .andExpect(status().isOk()).andExpect(content().json("{\"lastSuccessfulAt\":null,\"lastAttempt\":null}"));
        mvc.perform(MockMvcRequestBuilders.get("/api/admin/seasons/missing/sync-status").session(browser))
                .andExpect(status().isNotFound());
        assertThatThrownBy(() -> runtime.update("UPDATE lmuml.season_sync_attempts SET outcome = 'SUCCEEDED'"))
                .isInstanceOf(DataAccessException.class);
    }

    private static void recordSeasonAttempt(String seasonCode, String startedAt, String finishedAt, String outcome) {
        new SpringApplicationBuilder(LmumlApplication.class).profiles("api-football-sync-status")
                .run("--spring.datasource.url=" + POSTGRES.getJdbcUrl(),
                        "--spring.datasource.username=lmuml_importer_test",
                        "--spring.datasource.password=test-only-importer-password",
                        "--lmuml.api-football.sync-status.season-code=" + seasonCode,
                        "--lmuml.api-football.sync-status.started-at=" + startedAt,
                        "--lmuml.api-football.sync-status.finished-at=" + finishedAt,
                        "--lmuml.api-football.sync-status.outcome=" + outcome).close();
    }

    @Test
    void readsOneSeasonWithOwnIdentifiersLogosAndUtcTimesUsingReadOnlyRole() throws Exception {
        owner.update("UPDATE lmuml.teams SET logo_url = 'https://assets.example.test/home.png' WHERE api_football_id = 201");
        owner.update("UPDATE lmuml.competitions SET logo_url = 'https://assets.example.test/cup.png' WHERE code = 'demo-cup'");

        HttpResponse<String> response = get("demo-2026");
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("content-type").orElseThrow()).startsWith("application/json");
        JsonNode body = json.readTree(response.body());
        assertThat(body.path("season").path("code").asString()).isEqualTo("demo-2026");
        assertThat(body.path("season").path("startYear").asInt()).isEqualTo(2026);
        assertThat(body.path("competition").path("logoUrl").asString()).isEqualTo("https://assets.example.test/cup.png");
        assertThat(body.path("fixturesCapturedAt").isNull()).isTrue();
        assertThat(body.path("standings").isNull()).isTrue();
        JsonNode matches = body.path("matches");
        assertThat(matches.size()).isEqualTo(2);
        assertThat(matches.get(0).path("id").asString()).isEqualTo(FIRST_MATCH);
        assertThat(matches.get(1).path("id").asString()).isEqualTo(SECOND_MATCH);
        // Same Polish wall-clock time on either side of the daylight-saving transition.
        assertThat(matches.get(0).path("kickoffAt").asString()).isEqualTo("2026-10-25T00:30:00Z");
        assertThat(matches.get(1).path("kickoffAt").asString()).isEqualTo("2026-10-25T01:30:00Z");
        assertThat(matches.get(0).path("homeTeam").path("name").asString()).isEqualTo("FC Północ");
        assertThat(matches.get(0).path("homeTeam").path("logoUrl").asString()).isEqualTo("https://assets.example.test/home.png");
        assertThat(matches.get(0).path("awayTeam").path("logoUrl").isNull()).isTrue();
        assertThat(matches.get(0).path("status").path("state").asString()).isEqualTo("SCHEDULED");
        assertThat(matches.get(0).path("tournamentRound").asString()).isEqualTo("League Stage - 1");
        assertThat(response.body()).doesNotContain("provider_status", "providerStatus", "api_football_id", "apiFootballId",
                "capturedAt", "payload", "coverage", "canBet", "jdbc:", "test-only-", "demo-2027");
        assertThat(runtime.queryForObject("SELECT current_user", String.class)).isEqualTo("lmuml_app_test");
        assertThatThrownBy(() -> runtime.update("UPDATE lmuml.teams SET name = name"))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> runtime.queryForObject("SELECT count(*) FROM lmuml.api_football_snapshots", Integer.class))
                .isInstanceOf(DataAccessException.class);
    }

    @Test
    void readsOnlyPairedStatisticsAndPreservesNullValues() throws Exception {
        UUID matchId = UUID.fromString(FIRST_MATCH);
        var importer = new JdbcTemplate(new DriverManagerDataSource(POSTGRES.getJdbcUrl(),
                "lmuml_importer_test", "test-only-importer-password"));
        owner.update("UPDATE lmuml.matches SET provider_status = 'FT' WHERE id = ?", matchId);

        assertProblem(getStatistics(FIRST_MATCH), 404, "Match statistics not found");
        importer.update("""
                INSERT INTO lmuml.match_statistics (match_id, team_id, side, captured_at,
                    shots_total, shots_on_target, possession_percent, corners, fouls, saves)
                SELECT id, home_team_id, 'HOME', TIMESTAMPTZ '2026-10-25 04:43:00+01', 14, 5, 57.25, 6, NULL, 2
                FROM lmuml.matches WHERE id = ?
                """, matchId);
        assertProblem(getStatistics(FIRST_MATCH), 404, "Match statistics not found");
        importer.update("""
                INSERT INTO lmuml.match_statistics (match_id, team_id, side, captured_at,
                    shots_total, shots_on_target, possession_percent, corners, fouls, saves)
                SELECT id, away_team_id, 'AWAY', TIMESTAMPTZ '2026-10-25 04:48:00+01', 8, 2, 42.75, 0, 9, NULL
                FROM lmuml.matches WHERE id = ?
                """, matchId);
        assertProblem(getStatistics(FIRST_MATCH), 404, "Match statistics not found");
        importer.update("""
                UPDATE lmuml.match_statistics SET captured_at = '2026-10-25 04:43:00+01'
                WHERE match_id = ? AND side = 'AWAY'
                """, matchId);

        var response = getStatistics(FIRST_MATCH);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("cache-control")).contains("no-store");
        assertThat(json.readTree(response.body())).isEqualTo(json.readTree("""
                {
                  "matchId":"%s", "capturedAt":"2026-10-25T03:43:00Z",
                  "home":{"shotsTotal":14,"shotsOnTarget":5,"possessionPercent":57.25,"corners":6,"fouls":null,"saves":2},
                  "away":{"shotsTotal":8,"shotsOnTarget":2,"possessionPercent":42.75,"corners":0,"fouls":9,"saves":null}
                }
                """.formatted(FIRST_MATCH)));
        assertThatThrownBy(() -> runtime.update("UPDATE lmuml.match_statistics SET shots_total = 99 WHERE match_id = ?",
                matchId)).isInstanceOf(DataAccessException.class);
        owner.update("""
                UPDATE lmuml.matches
                SET away_team_id = (SELECT away_team_id FROM lmuml.matches WHERE id = ?)
                WHERE id = ?
                """, UUID.fromString(SECOND_MATCH), matchId);
        assertProblem(getStatistics(FIRST_MATCH), 404, "Match statistics not found");
        assertProblem(getStatistics(SECOND_MATCH), 404, "Match statistics not found");
        assertProblem(getStatistics("30000000-0000-0000-0000-000000000099"), 404, "Match statistics not found");
        assertProblem(getStatistics("1-2-3-4-5"), 400, "Invalid match ID");
    }

    @Test
    void readsMatchEventsInSavedOrderAndHidesTimelineAfterParticipantCorrection() throws Exception {
        UUID matchId = UUID.fromString(FIRST_MATCH);
        var importer = new JdbcTemplate(new DriverManagerDataSource(POSTGRES.getJdbcUrl(),
                "lmuml_importer_test", "test-only-importer-password"));
        assertProblem(getEvents(FIRST_MATCH), 404, "Match events not found");
        importer.update("""
                INSERT INTO lmuml.match_event_snapshots (match_id, captured_at, home_team_id, away_team_id)
                SELECT id, TIMESTAMPTZ '2026-10-25 04:43:00+01', home_team_id, away_team_id
                FROM lmuml.matches WHERE id = ?
                """, matchId);
        importer.update("""
                INSERT INTO lmuml.match_events (match_id, position, minute, added_time,
                    side, kind, player_name, related_player_name)
                VALUES (?, 2, 90, 3, NULL, 'VAR', NULL, NULL),
                       (?, 0, 38, NULL, 'AWAY', 'GOAL', 'Iga Nowak', 'Klara Wójcik'),
                       (?, 1, 90, 3, 'HOME', 'SUBSTITUTION', 'Maria Adams', 'Maja Kowal')
                """, matchId, matchId, matchId);

        var response = getEvents(FIRST_MATCH);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("cache-control")).contains("no-store");
        assertThat(json.readTree(response.body())).isEqualTo(json.readTree("""
                {
                  "matchId":"%s", "capturedAt":"2026-10-25T03:43:00Z",
                  "events":[
                    {"minute":38,"addedTime":null,"side":"AWAY","kind":"GOAL",
                     "playerName":"Iga Nowak","relatedPlayerName":"Klara Wójcik"},
                    {"minute":90,"addedTime":3,"side":"HOME","kind":"SUBSTITUTION",
                     "playerName":"Maria Adams","relatedPlayerName":"Maja Kowal"},
                    {"minute":90,"addedTime":3,"side":null,"kind":"VAR",
                     "playerName":null,"relatedPlayerName":null}
                  ]
                }
                """.formatted(FIRST_MATCH)));
        assertThatThrownBy(() -> runtime.update("DELETE FROM lmuml.match_events WHERE match_id = ?", matchId))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> importer.update("""
                DELETE FROM lmuml.match_event_snapshots WHERE match_id = ?
                """, matchId)).isInstanceOf(DataAccessException.class);

        owner.update("""
                UPDATE lmuml.matches
                SET away_team_id = (SELECT away_team_id FROM lmuml.matches WHERE id = ?)
                WHERE id = ?
                """, UUID.fromString(SECOND_MATCH), matchId);
        assertProblem(getEvents(FIRST_MATCH), 404, "Match events not found");
    }

    @Test
    void distinguishesAnEmptyMatchTimelineFromMissingOrInvalidMatchIds() throws Exception {
        owner.update("""
                INSERT INTO lmuml.match_event_snapshots (match_id, captured_at, home_team_id, away_team_id)
                SELECT id, TIMESTAMPTZ '2026-10-25 04:43:00+01', home_team_id, away_team_id
                FROM lmuml.matches WHERE id = ?
                """, UUID.fromString(SECOND_MATCH));

        var response = getEvents(SECOND_MATCH);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(json.readTree(response.body())).isEqualTo(json.readTree("""
                {"matchId":"%s","capturedAt":"2026-10-25T03:43:00Z","events":[]}
                """.formatted(SECOND_MATCH)));
        assertProblem(getEvents(FIRST_MATCH), 404, "Match events not found");
        assertProblem(getEvents("30000000-0000-0000-0000-000000000099"), 404, "Match events not found");
        assertProblem(getEvents("1-2-3-4-5"), 400, "Invalid match ID");
    }

    @Test
    void readsOneLineupSnapshotWithOrderedPlayersForTheCurrentPairOfTeams() throws Exception {
        UUID matchId = UUID.fromString(FIRST_MATCH);
        var importer = new JdbcTemplate(new DriverManagerDataSource(POSTGRES.getJdbcUrl(),
                "lmuml_importer_test", "test-only-importer-password"));
        assertProblem(getLineups(FIRST_MATCH), 404, "Match lineups not found");
        assertProblem(getLineups("1-2-3-4-5"), 400, "Invalid match ID");

        importer.update("""
                INSERT INTO lmuml.match_lineups (match_id, side, team_id, captured_at, formation, coach_name)
                SELECT id, 'HOME', home_team_id, TIMESTAMPTZ '2026-10-25 04:43:00+01', '4-3-3', 'Jan Nowak'
                FROM lmuml.matches WHERE id = ?
                UNION ALL
                SELECT id, 'AWAY', away_team_id, TIMESTAMPTZ '2026-10-25 04:46:00+01', NULL, NULL
                FROM lmuml.matches WHERE id = ?
                """, matchId, matchId);
        importer.update("""
                INSERT INTO lmuml.match_lineup_players (match_id, side, starter, position_index,
                    player_name, shirt_number, position, grid_row, grid_column)
                VALUES (?, 'HOME', FALSE, 0, 'Wojtek Sowa', 15, 'MIDFIELDER', NULL, NULL),
                       (?, 'HOME', TRUE, 1, 'Jakub Kowal', 28, 'DEFENDER', 2, 1),
                       (?, 'HOME', TRUE, 0, 'Adrian Lis', 1, 'GOALKEEPER', 1, 1),
                       (?, 'AWAY', TRUE, 0, 'Adam Pawlak', NULL, 'UNKNOWN', NULL, NULL)
                """, matchId, matchId, matchId, matchId);
        assertProblem(getLineups(FIRST_MATCH), 404, "Match lineups not found");

        importer.update("""
                UPDATE lmuml.match_lineups SET captured_at = '2026-10-25 04:43:00+01'
                WHERE match_id = ? AND side = 'AWAY'
                """, matchId);
        var response = getLineups(FIRST_MATCH);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("cache-control")).contains("no-store");
        assertThat(json.readTree(response.body())).isEqualTo(json.readTree("""
                {
                  "matchId":"%s", "capturedAt":"2026-10-25T03:43:00Z",
                  "home":{
                    "formation":"4-3-3","coachName":"Jan Nowak",
                    "starters":[
                      {"name":"Adrian Lis","number":1,"position":"GOALKEEPER","gridRow":1,"gridColumn":1,
                       "rating":null,"goals":null,"assists":null,"substitutedOn":null,"substitutedOff":null},
                      {"name":"Jakub Kowal","number":28,"position":"DEFENDER","gridRow":2,"gridColumn":1,
                       "rating":null,"goals":null,"assists":null,"substitutedOn":null,"substitutedOff":null}
                    ],
                    "substitutes":[
                      {"name":"Wojtek Sowa","number":15,"position":"MIDFIELDER","gridRow":null,"gridColumn":null,
                       "rating":null,"goals":null,"assists":null,"substitutedOn":null,"substitutedOff":null}
                    ]
                  },
                  "away":{
                    "formation":null,"coachName":null,
                    "starters":[
                      {"name":"Adam Pawlak","number":null,"position":"UNKNOWN","gridRow":null,"gridColumn":null,
                       "rating":null,"goals":null,"assists":null,"substitutedOn":null,"substitutedOff":null}
                    ],
                    "substitutes":[]
                  }
                }
                """.formatted(FIRST_MATCH)));
        assertThatThrownBy(() -> runtime.update("DELETE FROM lmuml.match_lineup_players WHERE match_id = ?", matchId))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> importer.update("DELETE FROM lmuml.match_lineups WHERE match_id = ?", matchId))
                .isInstanceOf(DataAccessException.class);

        owner.update("""
                UPDATE lmuml.matches
                SET away_team_id = (SELECT away_team_id FROM lmuml.matches WHERE id = ?)
                WHERE id = ?
                """, UUID.fromString(SECOND_MATCH), matchId);
        assertProblem(getLineups(FIRST_MATCH), 404, "Match lineups not found");
    }

    @Test
    void enrichesLineupsOnlyForMatchingPlayerIdsAndCurrentTeams() throws Exception {
        UUID matchId = UUID.fromString(FIRST_MATCH);
        owner.update("""
                INSERT INTO lmuml.match_lineups (match_id, side, team_id, captured_at)
                SELECT m.id, lineup.side, lineup.team_id, TIMESTAMPTZ '2026-10-25 02:10:00+02'
                FROM lmuml.matches m
                CROSS JOIN LATERAL (VALUES ('HOME', m.home_team_id), ('AWAY', m.away_team_id)) lineup(side, team_id)
                WHERE m.id = ?
                """, matchId);
        owner.update("""
                INSERT INTO lmuml.match_lineup_players (match_id, side, starter, position_index,
                    player_name, shirt_number, position, provider_player_id)
                VALUES (?, 'HOME', TRUE, 0, 'T. Lis', 9, 'FORWARD', 901),
                       (?, 'HOME', TRUE, 1, 'J. Sowa', 18, 'DEFENDER', NULL),
                       (?, 'AWAY', TRUE, 0, 'P. Wrona', 8, 'MIDFIELDER', 903),
                       (?, 'HOME', FALSE, 0, 'P. Kot', 12, 'FORWARD', 902)
                """, matchId, matchId, matchId, matchId);
        owner.update("""
                INSERT INTO lmuml.match_player_stat_snapshots (match_id, captured_at, home_team_id, away_team_id)
                SELECT id, TIMESTAMPTZ '2026-10-25 04:43:00+01', home_team_id, away_team_id
                FROM lmuml.matches WHERE id = ?
                """, matchId);
        owner.update("""
                INSERT INTO lmuml.match_player_statistics (match_id, side, position_index, provider_player_id,
                    name, shirt_number, position, rating, goals, assists)
                VALUES (?, 'HOME', 0, 901, 'Tomasz Lis', 19, 'FORWARD', 8.50, 2, NULL),
                       (?, 'HOME', 1, 902, 'Paweł Kot', 12, 'FORWARD', 7.10, 0, 1),
                       (?, 'HOME', 2, 903, 'Decoy with the other side', 90, 'MIDFIELDER', 9.00, 3, 1),
                       (?, 'HOME', 3, 904, 'J. Sowa', 18, 'DEFENDER', 9.50, 1, 2),
                       (?, 'AWAY', 0, 905, 'Piotr Żak', 8, 'MIDFIELDER', 6.20, 0, 0)
                """, matchId, matchId, matchId, matchId, matchId);
        owner.update("""
                INSERT INTO lmuml.match_event_snapshots (match_id, captured_at, home_team_id, away_team_id)
                SELECT id, TIMESTAMPTZ '2026-10-25 04:44:00+01', home_team_id, away_team_id
                FROM lmuml.matches WHERE id = ?
                """, matchId);
        owner.update("""
                INSERT INTO lmuml.match_events (match_id, position, minute, added_time, side, kind,
                    player_name, related_player_name, provider_player_id, related_provider_player_id)
                VALUES (?, 0, 15, NULL, 'HOME', 'GOAL', 'Tomasz Lis', 'Paweł Kot', 901, 902),
                       (?, 1, 50, NULL, 'AWAY', 'SUBSTITUTION', 'T. Lis', 'P. Kot', 901, 902),
                       (?, 2, 90, 5, 'HOME', 'SUBSTITUTION', 'Tomasz Lis', 'Paweł Kot', 901, 902),
                       (?, 3, 90, 2, 'HOME', 'SUBSTITUTION', 'Tomasz Lis', 'Paweł Kot', 901, 902)
                """, matchId, matchId, matchId, matchId);

        var response = getLineups(FIRST_MATCH);
        assertThat(response.statusCode()).isEqualTo(200);
        var lineup = json.readTree(response.body());
        var starter = lineup.path("home").path("starters").get(0);
        var substitute = lineup.path("home").path("substitutes").get(0);
        assertThat(starter.path("name").asString()).isEqualTo("T. Lis");
        assertThat(starter.path("rating").decimalValue()).isEqualByComparingTo("8.50");
        assertThat(starter.path("goals").asInt()).isEqualTo(2);
        assertThat(starter.path("assists").isNull()).isTrue();
        assertThat(starter.path("substitutedOn").isNull()).isTrue();
        var substitution = json.readTree("""
                {"minute":90,"addedTime":2}
                """);
        assertThat(starter.path("substitutedOff")).isEqualTo(substitution);
        assertThat(substitute.path("goals")).isEqualTo(json.readTree("0"));
        assertThat(substitute.path("assists").asInt()).isEqualTo(1);
        assertThat(substitute.path("substitutedOn")).isEqualTo(substitution);
        assertThat(substitute.path("substitutedOff").isNull()).isTrue();
        assertThat(lineup.path("home").path("starters").get(1).path("rating").isNull()).isTrue();
        assertThat(lineup.path("away").path("starters").get(0).path("rating").isNull()).isTrue();

        UUID otherMatchId = UUID.fromString(SECOND_MATCH);
        owner.update("""
                UPDATE lmuml.match_player_stat_snapshots
                SET away_team_id = (SELECT away_team_id FROM lmuml.matches WHERE id = ?)
                WHERE match_id = ?
                """, otherMatchId, matchId);
        owner.update("""
                UPDATE lmuml.match_event_snapshots
                SET away_team_id = (SELECT away_team_id FROM lmuml.matches WHERE id = ?)
                WHERE match_id = ?
                """, otherMatchId, matchId);

        var guardedResponse = getLineups(FIRST_MATCH);
        assertThat(guardedResponse.statusCode()).isEqualTo(200);
        var guarded = json.readTree(guardedResponse.body()).path("home").path("starters").get(0);
        for (String field : new String[] {"rating", "goals", "assists", "substitutedOn", "substitutedOff"}) {
            assertThat(guarded.path(field).isNull()).as(field).isTrue();
        }
    }

    @Test
    void readsPlayerStatisticsWithOrderedPlayersForBothCurrentTeams() throws Exception {
        UUID matchId = UUID.fromString(FIRST_MATCH);
        var importer = new JdbcTemplate(new DriverManagerDataSource(POSTGRES.getJdbcUrl(),
                "lmuml_importer_test", "test-only-importer-password"));
        var missing = getPlayerStatistics(FIRST_MATCH);
        assertProblem(missing, 404, "Match player statistics not found");
        assertThat(missing.headers().firstValue("cache-control")).contains("no-store");
        assertProblem(getPlayerStatistics("1-2-3-4-5"), 400, "Invalid match ID");

        importer.update("""
                INSERT INTO lmuml.match_player_stat_snapshots (match_id, captured_at, home_team_id, away_team_id)
                SELECT id, TIMESTAMPTZ '2026-10-25 04:43:00+01', home_team_id, away_team_id
                FROM lmuml.matches WHERE id = ?
                """, matchId);
        importer.update("""
                INSERT INTO lmuml.match_player_statistics (match_id, side, position_index, provider_player_id,
                    name, shirt_number, position, minutes, rating, goals, assists, shots_total, shots_on_target,
                    passes_total, key_passes, tackles, saves)
                VALUES (?, 'HOME', 1, 901, 'Jakub Kowal', 28, 'DEFENDER', 79, 6.75, 0, 0, 0, 0, 33, 2, 7, NULL),
                       (?, 'HOME', 0, 902, 'Adrian Lis', 1, 'GOALKEEPER', 90, 8.50, NULL, 0, 0, 0, 28, 0, 0, 3)
                """, matchId, matchId);
        assertProblem(getPlayerStatistics(FIRST_MATCH), 404, "Match player statistics not found");

        importer.update("""
                INSERT INTO lmuml.match_player_statistics (match_id, side, position_index, provider_player_id,
                    name, position, goals)
                VALUES (?, 'AWAY', 0, 903, 'Adam Pawlak', 'UNKNOWN', 1)
                """, matchId);
        var response = getPlayerStatistics(FIRST_MATCH);
        assertThat(response.statusCode()).isEqualTo(200);
        assertThat(response.headers().firstValue("cache-control")).contains("no-store");
        assertThat(json.readTree(response.body())).isEqualTo(json.readTree("""
                {"matchId":"%s","capturedAt":"2026-10-25T03:43:00Z","home":[
                    {"name":"Adrian Lis","number":1,"position":"GOALKEEPER","minutes":90,"rating":8.50,
                     "goals":null,"assists":0,"shotsTotal":0,"shotsOnTarget":0,"passesTotal":28,"keyPasses":0,
                     "tackles":0,"saves":3},
                    {"name":"Jakub Kowal","number":28,"position":"DEFENDER","minutes":79,"rating":6.75,
                     "goals":0,"assists":0,"shotsTotal":0,"shotsOnTarget":0,"passesTotal":33,"keyPasses":2,
                     "tackles":7,"saves":null}
                  ],"away":[
                    {"name":"Adam Pawlak","number":null,"position":"UNKNOWN","minutes":null,"rating":null,
                     "goals":1,"assists":null,"shotsTotal":null,"shotsOnTarget":null,"passesTotal":null,
                     "keyPasses":null,"tackles":null,"saves":null}
                  ]}
                """.formatted(FIRST_MATCH)));
        assertThatThrownBy(() -> runtime.update("DELETE FROM lmuml.match_player_statistics WHERE match_id = ?", matchId))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> importer.update("DELETE FROM lmuml.match_player_stat_snapshots WHERE match_id = ?", matchId))
                .isInstanceOf(DataAccessException.class);

        owner.update("""
                UPDATE lmuml.matches
                SET away_team_id = (SELECT away_team_id FROM lmuml.matches WHERE id = ?)
                WHERE id = ?
                """, UUID.fromString(SECOND_MATCH), matchId);
        assertProblem(getPlayerStatistics(FIRST_MATCH), 404, "Match player statistics not found");
    }

    @Test
    void returnsFixtureCaptureTimeOnlyForTheRequestedCompetitionAndSeason() throws Exception {
        owner.update("""
                INSERT INTO lmuml.api_football_snapshots (endpoint, league_id, season, captured_at, payload)
                SELECT endpoint, league_id, season, captured_at::timestamptz,
                    jsonb_build_object('get', endpoint, 'errors', '[]'::jsonb, 'privateMarker', true)
                FROM (VALUES ('fixtures', 9001, 2026, '2026-10-26T21:15:00+01:00'),
                             ('fixtures', 9001, 2028, '2028-10-26T21:30:00Z'),
                             ('fixtures', 9003, 2026, '2026-10-26T21:30:00Z'),
                             ('standings', 9001, 2026, '2026-10-26T21:40:00Z'),
                             ('leagues', 9001, 2026, '2026-10-26T21:50:00Z'))
                    AS snapshots(endpoint, league_id, season, captured_at)
                """);

        var response = get("demo-2026");
        assertThat(response.statusCode()).isEqualTo(200);
        var body = json.readTree(response.body());
        assertThat(body.path("fixturesCapturedAt").asString()).isEqualTo("2026-10-26T20:15:00Z");
        assertThat(body.path("matches").size()).isEqualTo(2);
        assertThat(response.body()).doesNotContain("privateMarker");
        assertThat(json.readTree(get("demo-2027").body()).path("fixturesCapturedAt").isNull()).isTrue();
        assertThat(json.readTree(get("other-demo-2026").body()).path("fixturesCapturedAt").isNull()).isTrue();
    }

    @Test
    @Timeout(30)
    void streamsOnlyTheSelectedSeasonsFixtureRevisionAndRestoresItOnReconnect() throws Exception {
        var updates = new UpdateListener();
        var socket = connectToUpdates(updates);
        var currentRevision = json.readTree("""
                {"type":"fixtures","fixturesCapturedAt":"2026-10-26T20:15:00.123456Z"}
                """);
        try {
            subscribe(socket, "demo-2026");
            assertThat(readUpdate(updates)).isEqualTo(json.readTree("""
                    {"type":"fixtures","fixturesCapturedAt":null}
                    """));

            owner.update("""
                    INSERT INTO lmuml.api_football_snapshots (endpoint, league_id, season, captured_at, payload)
                    SELECT endpoint, league_id, season, captured_at::timestamptz,
                        jsonb_build_object('get', endpoint, 'errors', '[]'::jsonb, 'privateMarker', true)
                    FROM (VALUES ('fixtures', 9001, 2026, '2026-10-26T21:15:00.123456+01:00'),
                                 ('fixtures', 9001, 2027, '2026-10-26T21:30:00Z'),
                                 ('fixtures', 9003, 2026, '2026-10-26T21:45:00Z'),
                                 ('standings', 9001, 2026, '2026-10-26T22:00:00Z'))
                        AS snapshots(endpoint, league_id, season, captured_at)
                    """);
            assertThat(readUpdate(updates)).isEqualTo(currentRevision);
        } finally {
            socket.abort();
        }

        var reconnected = new UpdateListener();
        var newSocket = connectToUpdates(reconnected);
        try {
            subscribe(newSocket, "demo-2026");
            assertThat(readUpdate(reconnected)).isEqualTo(currentRevision);
            subscribe(newSocket, "demo-2027");
            assertThat(readUpdate(reconnected)).isEqualTo(json.readTree("""
                    {"type":"fixtures","fixturesCapturedAt":"2026-10-26T21:30:00Z"}
                    """));
        } finally {
            newSocket.abort();
        }
    }

    @ParameterizedTest
    @ValueSource(strings = {"not-json", "{\"type\":\"subscribe\",\"seasonCode\":\"missing\"}"})
    void closesInvalidSeasonSubscriptions(String message) throws Exception {
        var updates = new UpdateListener();
        var socket = connectToUpdates(updates);
        try {
            socket.sendText(message, true).get(5, TimeUnit.SECONDS);
            assertThat(updates.closeCode.get(5, TimeUnit.SECONDS)).isEqualTo(1008);
            assertThat(updates.messages).isEmpty();
        } finally {
            socket.abort();
        }
    }

    @Test
    void rejectsWebSocketHandshakesFromOtherOrigins() {
        assertThatThrownBy(() -> http.newWebSocketBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .header("Origin", "https://example.org")
                .buildAsync(updatesUri(), new UpdateListener())
                .get(5, TimeUnit.SECONDS))
                .hasCauseInstanceOf(WebSocketHandshakeException.class)
                .satisfies(failure -> assertThat(((WebSocketHandshakeException) failure.getCause())
                        .getResponse().statusCode()).isEqualTo(403));
    }

    private WebSocket connectToUpdates(UpdateListener listener) throws Exception {
        return http.newWebSocketBuilder()
                .connectTimeout(Duration.ofSeconds(5))
                .header("Origin", "http://127.0.0.1:" + port)
                .buildAsync(updatesUri(), listener)
                .get(5, TimeUnit.SECONDS);
    }

    private URI updatesUri() {
        return URI.create("ws://127.0.0.1:" + port + "/api/v1/season-updates");
    }

    private void subscribe(WebSocket socket, String seasonCode) throws Exception {
        socket.sendText(json.writeValueAsString(Map.of("type", "subscribe", "seasonCode", seasonCode)), true)
                .get(5, TimeUnit.SECONDS);
    }

    private JsonNode readUpdate(UpdateListener listener) throws InterruptedException {
        String message = listener.messages.poll(8, TimeUnit.SECONDS);
        assertThat(message).as("fixture revision received over WebSocket").isNotNull();
        return json.readTree(message);
    }

    private static final class UpdateListener implements WebSocket.Listener {
        private final BlockingQueue<String> messages = new LinkedBlockingQueue<>();
        private final CompletableFuture<Integer> closeCode = new CompletableFuture<>();
        private final StringBuilder text = new StringBuilder();

        @Override
        public CompletionStage<?> onText(WebSocket socket, CharSequence data, boolean last) {
            text.append(data);
            if (last) {
                messages.add(text.toString());
                text.setLength(0);
            }
            socket.request(1);
            return null;
        }

        @Override
        public CompletionStage<?> onClose(WebSocket socket, int statusCode, String reason) {
            closeCode.complete(statusCode);
            return null;
        }
    }

    @Test
    void returnsImportedStandingsInProviderOrderWithoutRecalculatingPoints() throws Exception {
        owner.update("""
                INSERT INTO lmuml.season_standings
                    (season_id, team_id, position, played, won, drawn, lost, goals_for, goals_against,
                     goal_difference, points, form, captured_at)
                SELECT s.id, t.id, row.position, 2, row.won, 1, row.lost, row.goals_for, row.goals_against,
                    row.goal_difference, row.points, row.form, '2026-10-30T15:00:00Z'
                FROM lmuml.seasons s
                JOIN (VALUES (201, 2, 0, 1, 1, 3, -2, -1, NULL),
                             (202, 1, 1, 0, 3, 1, 2, 4, 'WD'))
                    AS row(provider_id, position, won, lost, goals_for, goals_against, goal_difference, points, form)
                    ON TRUE
                JOIN lmuml.teams t ON t.api_football_id = row.provider_id
                WHERE s.code = 'demo-2026'
                """);
        HttpResponse<String> response = get("demo-2026");
        assertThat(response.statusCode()).isEqualTo(200);
        JsonNode standings = json.readTree(response.body()).path("standings");
        assertThat(standings.path("capturedAt").asString()).isEqualTo("2026-10-30T15:00:00Z");
        JsonNode rows = standings.path("rows");
        assertThat(rows.size()).isEqualTo(2);
        assertThat(rows.get(0).path("position").asInt()).isEqualTo(1);
        assertThat(rows.get(0).path("team").path("name").asString()).isEqualTo("KS Południe");
        assertThat(rows.get(0).path("form").asString()).isEqualTo("WD");
        assertThat(rows.get(0).path("goalsFor").asInt()).isEqualTo(3);
        assertThat(rows.get(1).path("position").asInt()).isEqualTo(2);
        assertThat(rows.get(1).path("points").asInt()).isEqualTo(-1);
        assertThat(rows.get(1).path("goalDifference").asInt()).isEqualTo(-2);
        assertThat(rows.get(1).path("form").isNull()).isTrue();
        assertThat(json.readTree(get("demo-2027").body()).path("standings").isNull()).isTrue();
        assertThatThrownBy(() -> runtime.update("DELETE FROM lmuml.season_standings"))
                .isInstanceOf(DataAccessException.class);
    }

    @Test
    void distinguishesEmptySeasonFromUnknownSeason() throws Exception {
        HttpResponse<String> empty = get("other-demo-2026");
        assertThat(empty.statusCode()).isEqualTo(200);
        JsonNode body = json.readTree(empty.body());
        assertThat(body.path("season").path("code").asString()).isEqualTo("other-demo-2026");
        assertThat(body.path("competition").path("code").asString()).isEqualTo("demo-league");
        assertThat(body.path("matches").isArray()).isTrue();
        assertThat(body.path("matches").size()).isZero();
        assertProblem(get("missing-2026"), 404, "Season not found");
    }

    @Test
    void returnsOnlyPublishedRoundsWithTheirSavedMatchesAndFinalReservation() throws Exception {
        String firstRound = "50000000-0000-0000-0000-000000000001";
        String latestRound = "50000000-0000-0000-0000-000000000002";
        String draftRound = "50000000-0000-0000-0000-000000000003";
        String draftMatch = "30000000-0000-0000-0000-000000000004";
        owner.update("""
                INSERT INTO lmuml.matches (id, season_id, api_football_id, api_round, provider_status, home_team_id, away_team_id)
                SELECT ?, season_id, 7004, 'League Stage - 2', 'TBD', home_team_id, away_team_id
                FROM lmuml.matches WHERE id = ?
                """, UUID.fromString(draftMatch), UUID.fromString(FIRST_MATCH));
        owner.update("""
                INSERT INTO lmuml.betting_rounds (id, season_id, number, published_at)
                VALUES (?, '10000000-0000-0000-0000-000000000001', 1, '2026-10-10T12:00:00Z'),
                       (?, '10000000-0000-0000-0000-000000000001', 2, '2026-10-20T12:00:00Z'),
                       (?, '10000000-0000-0000-0000-000000000001', 3, NULL)
                """, UUID.fromString(firstRound), UUID.fromString(latestRound), UUID.fromString(draftRound));
        owner.update("""
                INSERT INTO lmuml.betting_round_groups (season_id, group_key, tournament_round, betting_round_id)
                VALUES ('10000000-0000-0000-0000-000000000001', 'round:League Stage - 1', 'League Stage - 1', ?),
                       ('10000000-0000-0000-0000-000000000001', 'quarter-final:first-leg', 'Quarter-finals', ?),
                       ('10000000-0000-0000-0000-000000000001', 'final', 'Final', ?),
                       ('10000000-0000-0000-0000-000000000001', 'round:League Stage - 2', 'League Stage - 2', ?)
                """, UUID.fromString(firstRound), UUID.fromString(latestRound), UUID.fromString(latestRound),
                UUID.fromString(draftRound));
        owner.update("""
                INSERT INTO lmuml.betting_round_matches (match_id, season_id, group_key)
                VALUES (?, '10000000-0000-0000-0000-000000000001', 'round:League Stage - 1'),
                       (?, '10000000-0000-0000-0000-000000000001', 'quarter-final:first-leg'),
                       (?, '10000000-0000-0000-0000-000000000001', 'round:League Stage - 2')
                """, UUID.fromString(FIRST_MATCH), UUID.fromString(SECOND_MATCH), UUID.fromString(draftMatch));

        var response = get("demo-2026", "betting-rounds");
        assertThat(response.statusCode()).isEqualTo(200);
        var body = json.readTree(response.body());
        var catalog = json.readTree(get("demo-2026").body());
        assertThat(body.path("season")).isEqualTo(catalog.path("season"));
        assertThat(body.path("competition")).isEqualTo(catalog.path("competition"));
        var rounds = body.path("rounds");
        assertThat(rounds.size()).isEqualTo(2);
        assertThat(rounds.get(0).path("id").asString()).isEqualTo(latestRound);
        assertThat(rounds.get(0).path("number").asInt()).isEqualTo(2);
        assertThat(rounds.get(0).path("name").asString()).isEqualTo("Runda 2");
        assertThat(rounds.get(0).path("publishedAt").asString()).isEqualTo("2026-10-20T12:00:00Z");
        assertThat(rounds.get(0).path("awaitingFinal").asBoolean()).isTrue();
        assertThat(rounds.get(0).path("matches").size()).isEqualTo(1);
        assertThat(rounds.get(0).path("matches").get(0)).isEqualTo(catalog.path("matches").get(1));
        assertThat(rounds.get(1).path("id").asString()).isEqualTo(firstRound);
        assertThat(rounds.get(1).path("awaitingFinal").asBoolean()).isFalse();
        assertThat(rounds.get(1).path("matches").size()).isEqualTo(1);
        assertThat(rounds.get(1).path("matches").get(0)).isEqualTo(catalog.path("matches").get(0));
        assertThat(response.body()).doesNotContain(draftRound, draftMatch, "Runda 3", "groupKey");
    }

    @Test
    void distinguishesSeasonWithoutPublishedRoundsFromUnknownOrMalformedSeason() throws Exception {
        var empty = get("demo-2027", "betting-rounds");
        assertThat(empty.statusCode()).isEqualTo(200);
        var body = json.readTree(empty.body());
        assertThat(body.path("season").path("code").asString()).isEqualTo("demo-2027");
        assertThat(body.path("rounds").isArray()).isTrue();
        assertThat(body.path("rounds").size()).isZero();
        assertProblem(get("missing-2026", "betting-rounds"), 404, "Season not found");
        assertProblem(get("INVALID", "betting-rounds"), 400, "Invalid season code");
    }

    @Test
    void rejectsMalformedSeasonCodesBeforeQuerying() throws Exception {
        for (String code : new String[] {"DEMO", "demo_2026", "demo--2026", "-demo", "a".repeat(65), "demo%27"}) {
            assertProblem(get(code), 400, "Invalid season code");
        }
        assertProblem(get("a".repeat(64)), 404, "Season not found");
    }

    @Test
    void sortsEqualKickoffsByUuidAndUnknownKickoffsLast() throws Exception {
        owner.update("UPDATE lmuml.matches SET kickoff_at = '2026-10-25T00:30:00Z' WHERE id = ?", UUID.fromString(SECOND_MATCH));
        owner.update("""
                INSERT INTO lmuml.matches (id, season_id, api_football_id, provider_status, home_team_id, away_team_id, kickoff_at)
                SELECT '30000000-0000-0000-0000-000000000005', season_id, 7005, 'NS', home_team_id, away_team_id, kickoff_at
                FROM lmuml.matches WHERE id = ?
                """, UUID.fromString(FIRST_MATCH));
        owner.update("""
                INSERT INTO lmuml.matches (id, season_id, api_football_id, provider_status, home_team_id, away_team_id)
                SELECT '30000000-0000-0000-0000-000000000004', season_id, 7004, 'TBD', home_team_id, away_team_id
                FROM lmuml.matches WHERE id = ?
                """, UUID.fromString(FIRST_MATCH));
        JsonNode matches = json.readTree(get("demo-2026").body()).path("matches");
        assertThat(matches.size()).isEqualTo(4);
        assertThat(matches.get(0).path("id").asString()).isEqualTo(FIRST_MATCH);
        assertThat(matches.get(1).path("id").asString()).isEqualTo(SECOND_MATCH);
        assertThat(matches.get(2).path("id").asString()).endsWith("000005");
        assertThat(matches.get(3).path("id").asString()).endsWith("000004");
        assertThat(matches.get(3).path("kickoffAt").isNull()).isTrue();
        assertThat(matches.get(3).path("status").path("state").asString()).isEqualTo("TIME_UNCONFIRMED");
    }

    @Test
    void preservesUnknownStatusNullableTimeAndPartialScoreWithoutInventingZeros() throws Exception {
        owner.update("""
                UPDATE lmuml.matches SET kickoff_at = NULL, api_round = NULL,
                    provider_status = 'FUTURE_PROVIDER_STATE', fulltime_home = 1, fulltime_away = NULL
                WHERE id = ?
                """, UUID.fromString(FIRST_MATCH));
        JsonNode match = json.readTree(get("demo-2026").body()).path("matches").get(1);
        assertThat(match.path("id").asString()).isEqualTo(FIRST_MATCH);
        assertThat(match.path("kickoffAt").isNull()).isTrue();
        assertThat(match.path("tournamentRound").isNull()).isTrue();
        assertThat(match.path("status").path("state").asString()).isEqualTo("UNKNOWN");
        assertThat(match.path("status").path("finishType").isNull()).isTrue();
        assertThat(match.path("status").path("elapsedMinutes").isNull()).isTrue();
        assertThat(match.path("homeWinner").isNull()).isTrue();
        assertThat(match.path("scores").path("regulationTime").path("home").asInt()).isEqualTo(1);
        assertThat(match.path("scores").path("regulationTime").path("away").isNull()).isTrue();
        assertThat(match.path("scores").path("total").path("home").isNull()).isTrue();
    }

    @Test
    void distinguishesRealScorelessDrawFromMissingScore() throws Exception {
        owner.update("""
                UPDATE lmuml.matches SET provider_status = 'FT', home_goals = 0, away_goals = 0,
                    fulltime_home = 0, fulltime_away = 0 WHERE id = ?
                """, UUID.fromString(FIRST_MATCH));
        JsonNode matches = json.readTree(get("demo-2026").body()).path("matches");
        assertThat(matches.get(0).path("scores").path("total").path("home").isInt()).isTrue();
        assertThat(matches.get(0).path("scores").path("total").path("home").asInt()).isZero();
        assertThat(matches.get(0).path("scores").path("total").path("away").asInt()).isZero();
        assertThat(matches.get(0).path("status").path("finishType").asString()).isEqualTo("REGULATION_TIME");
        assertThat(matches.get(1).path("scores").path("total").path("home").isNull()).isTrue();
    }

    @ParameterizedTest
    @ValueSource(strings = {"AET", "PEN"})
    void keepsRegulationTimeExtraTimePenaltiesAndReportedWinnerSeparate(String providerStatus) throws Exception {
        owner.update("""
                UPDATE lmuml.matches SET provider_status = ?, home_goals = 1, away_goals = 1,
                    halftime_home = 0, halftime_away = 0, fulltime_home = 1, fulltime_away = 0,
                    extratime_home = 0, extratime_away = 1, penalty_home = 5, penalty_away = 4,
                    elapsed_minutes = 120, extra_minutes = 7, home_winner = true, away_winner = false
                WHERE id = ?
                """, providerStatus, UUID.fromString(FIRST_MATCH));
        JsonNode match = json.readTree(get("demo-2026").body()).path("matches").get(0);
        JsonNode scores = match.path("scores");
        assertThat(scores.path("total").path("home").asInt()).isEqualTo(1);
        assertThat(scores.path("total").path("away").asInt()).isEqualTo(1);
        assertThat(scores.path("halfTime").path("home").asInt()).isZero();
        assertThat(scores.path("regulationTime").path("home").asInt()).isEqualTo(1);
        assertThat(scores.path("regulationTime").path("away").asInt()).isZero();
        assertThat(scores.path("extraTime").path("home").asInt()).isZero();
        assertThat(scores.path("extraTime").path("away").asInt()).isEqualTo(1);
        assertThat(scores.path("penalties").path("home").asInt()).isEqualTo(5);
        assertThat(scores.path("penalties").path("away").asInt()).isEqualTo(4);
        assertThat(match.path("homeWinner").asBoolean()).isTrue();
        assertThat(match.path("awayWinner").asBoolean()).isFalse();
        assertThat(match.path("status").path("state").asString()).isEqualTo("FINISHED");
        assertThat(match.path("status").path("finishType").asString())
                .isEqualTo(providerStatus.equals("AET") ? "EXTRA_TIME" : "PENALTIES");
        assertThat(match.path("status").path("elapsedMinutes").asInt()).isEqualTo(120);
        assertThat(match.path("status").path("extraMinutes").asInt()).isEqualTo(7);
    }

    @Test
    void returnsSafeServiceUnavailableDuringDatabaseOutageAndRecovers() throws Exception {
        assertThat(get("demo-2026").statusCode()).isEqualTo(200);
        POSTGRES.getDockerClient().pauseContainerCmd(POSTGRES.getContainerId()).exec();
        try {
            // Validation is independent of database availability.
            assertProblem(get("INVALID"), 400, "Invalid season code");
            assertProblem(get("demo-2026"), 503, "Match data unavailable");
        } finally {
            POSTGRES.getDockerClient().unpauseContainerCmd(POSTGRES.getContainerId()).exec();
            await().atMost(Duration.ofSeconds(30)).pollInterval(Duration.ofMillis(250))
                    .untilAsserted(() -> assertThat(get("demo-2026").statusCode()).isEqualTo(200));
        }
    }

    @Test
    void returnsSafeInternalErrorForBrokenSchemaInsteadOfClaimingTemporaryOutage() throws Exception {
        owner.execute("ALTER TABLE lmuml.matches RENAME COLUMN api_round TO temporarily_missing_round");
        try {
            assertProblem(get("demo-2026"), 500, "Match data could not be read");
        } finally {
            owner.execute("ALTER TABLE lmuml.matches RENAME COLUMN temporarily_missing_round TO api_round");
        }
    }

    private void assertProblem(HttpResponse<String> response, int status, String title) {
        assertThat(response.statusCode()).isEqualTo(status);
        assertThat(response.headers().firstValue("content-type").orElseThrow()).startsWith("application/problem+json");
        JsonNode problem = json.readTree(response.body());
        assertThat(problem.path("status").asInt()).isEqualTo(status);
        assertThat(problem.path("title").asString()).isEqualTo(title);
        assertThat(problem.path("detail").asString()).isNotBlank();
        assertThat(response.body()).doesNotContain("SELECT ", "lmuml_app", "jdbc:", "password", "PSQLException",
                "stackTrace", "test-only-", "api_round", "Connection refused");
    }

    private HttpResponse<String> get(String seasonCode) throws Exception {
        return get(seasonCode, "matches");
    }

    private HttpResponse<String> get(String seasonCode, String resource) throws Exception {
        return getPath(PATH + seasonCode + "/" + resource);
    }

    private HttpResponse<String> getStatistics(String matchId) throws Exception {
        return getPath("/api/v1/matches/" + matchId + "/statistics");
    }

    private HttpResponse<String> getEvents(String matchId) throws Exception {
        return getPath("/api/v1/matches/" + matchId + "/events");
    }

    private HttpResponse<String> getLineups(String matchId) throws Exception {
        return getPath("/api/v1/matches/" + matchId + "/lineups");
    }

    private HttpResponse<String> getPlayerStatistics(String matchId) throws Exception {
        return getPath("/api/v1/matches/" + matchId + "/player-statistics");
    }

    private HttpResponse<String> getPath(String path) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(8)).GET().build();
        return http.send(request, HttpResponse.BodyHandlers.ofString());
    }

    private static DriverManagerDataSource migrationDataSource() {
        return new DriverManagerDataSource(POSTGRES.getJdbcUrl(), "lmuml_migrator_test", "test-only-migrator-password");
    }
}
