package pl.lmuml.player;

import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import jakarta.servlet.Filter;
import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessException;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.WebApplicationContext;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.timeout;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@Testcontainers
@SpringBootTest(properties = {
        "lmuml.player.enabled=true",
        "lmuml.player.password-reset.enabled=true",
        "lmuml.player.password-reset.public-url=https://example.test"
})
class PlayerAccountsIT {

    private static final String PLAYER = "/api/v1/player";
    private static final String REGISTER = PLAYER + "/register";
    private static final String PASSWORD_RESET = PLAYER + "/password-reset";
    private static final String PLAYER_ROUNDS = PLAYER + "/betting-rounds/";
    private static final String RANKING = PLAYER + "/seasons/ranking-2026/ranking";
    private static final String PUBLISHED_ROUND = "50000000-0000-0000-0000-000000000001";
    private static final String DRAFT_ROUND = "50000000-0000-0000-0000-000000000002";
    private static final UUID FIRST_MATCH = UUID.fromString("30000000-0000-0000-0000-000000000001");
    private static final UUID SECOND_MATCH = UUID.fromString("30000000-0000-0000-0000-000000000002");
    private static final UUID DRAFT_MATCH = UUID.fromString("30000000-0000-0000-0000-000000000004");
    private static final UUID UNCONFIRMED_MATCH = UUID.fromString("30000000-0000-0000-0000-000000000005");
    private static final UUID UNKNOWN_KICKOFF_MATCH = UUID.fromString("30000000-0000-0000-0000-000000000006");
    private static final String RESET_LINK = "https://example.test/#konto?reset=";
    private static final String PASSWORD = "test 8xy";
    private static final JsonMapper JSON = JsonMapper.builder().build();

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(
            DockerImageName.parse("postgres:18.6-trixie@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6")
                    .asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("lmuml_test").withUsername("test_admin")
            .withPassword("test-only-admin-password").withInitScript("db/test-app-role.sql");

    @Autowired
    private WebApplicationContext context;

    @MockitoBean
    private PlayerPasswordResetMail resetMail;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry properties) {
        var owner = connection("lmuml_migrator_test", "test-only-migrator-password");
        Flyway.configure().dataSource(owner).defaultSchema("lmuml").schemas("lmuml").createSchemas(false)
                .locations("classpath:db/migration")
                .placeholders(Map.of("runtime", "lmuml_app_test", "importer", "lmuml_importer_test"))
                .load().migrate();
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", () -> "lmuml_app_test");
        properties.add("spring.datasource.password", () -> "test-only-app-password");
    }

    @Test
    void registersWithRuntimePrivilegesAndLoadsTheSamePlayerForNormalizedEmail() throws Exception {
        var source = connection("lmuml_app_test", "test-only-app-password");
        var players = new PlayerUserDetailsService(source);
        var mvc = MockMvcBuilders.standaloneSetup(new PlayerRegistrationController(players)).build();

        var created = mvc.perform(post(REGISTER).contentType(MediaType.APPLICATION_JSON)
                        .content(registration("  Ala@Example.Test  ", "  Ala Testowa  ", PASSWORD)))
                .andExpect(status().isCreated()).andExpect(content().string("")).andReturn();
        assertThat(created.getRequest().getSession(false)).isNull();

        var player = players.loadUserByUsername("aLA@example.test");
        assertThat(player.id()).isNotNull().isEqualTo(players.loadUserByUsername("ala@example.test").id());
        assertThat(player.email()).isEqualTo("ala@example.test");
        assertThat(player.displayName()).isEqualTo("Ala Testowa");
        assertThat(player.getAuthorities()).extracting(Object::toString).containsExactly("ROLE_PLAYER");
        var hash = player.getPassword();
        assertThat(hash).matches("[0-9a-f]{96}");
        assertThat(Pbkdf2PasswordEncoder.defaultsForSpringSecurity_v5_8().matches(PASSWORD, hash)).isTrue();
        assertThat(player.toString()).doesNotContain(hash, PASSWORD);
        player.eraseCredentials();
        assertThat(player.getPassword()).isNull();

        var duplicate = mvc.perform(post(REGISTER).contentType(MediaType.APPLICATION_JSON)
                        .content(registration("ALA@EXAMPLE.TEST", "Inna nazwa", PASSWORD)))
                .andExpect(status().isConflict()).andReturn();
        assertThat(duplicate.getResponse().getContentAsString()).doesNotContain(hash, PASSWORD, "ala@example.test");
        assertThat(players.loadUserByUsername("ala@example.test").displayName()).isEqualTo("Ala Testowa");

        mvc.perform(post(REGISTER).contentType(MediaType.APPLICATION_JSON)
                        .content(registration("beta@example.test", "Beta", PASSWORD)))
                .andExpect(status().isCreated());
        assertThat(players.loadUserByUsername("beta@example.test").getPassword()).isNotEqualTo(hash);

        mvc.perform(post(REGISTER).contentType(MediaType.APPLICATION_JSON)
                        .content(registration("invalid@example.test", "A", PASSWORD)))
                .andExpect(status().isBadRequest());
        mvc.perform(post(REGISTER).contentType(MediaType.APPLICATION_JSON)
                        .content(registration("invalid@example.test", "Nazwa", "short-7")))
                .andExpect(status().isBadRequest());
        mvc.perform(post(REGISTER).contentType(MediaType.APPLICATION_JSON)
                        .content(registration("invalid@example.test", "Nazwa", 1234567890123L)))
                .andExpect(status().isBadRequest());
        assertThatThrownBy(() -> players.loadUserByUsername("invalid@example.test"))
                .isInstanceOf(UsernameNotFoundException.class);

        var runtime = new JdbcTemplate(source);
        assertThatThrownBy(() -> runtime.update("UPDATE lmuml.players SET display_name = 'Other'"))
                .isInstanceOf(DataAccessException.class);
        assertThatThrownBy(() -> runtime.update("DELETE FROM lmuml.players"))
                .isInstanceOf(DataAccessException.class);
    }

    @Test
    void requiresCurrentPasswordAndRevokesBothSessionsAfterChangingCredentials() throws Exception {
        var mvc = MockMvcBuilders.webAppContextSetup(context)
                .addFilters(context.getBean("springSecurityFilterChain", Filter.class)).build();
        String email = "password-change@example.test";
        String newPassword = "new pass";
        var firstBrowser = new MockHttpSession(context.getServletContext());
        var secondBrowser = new MockHttpSession(context.getServletContext());
        String firstAnonymousToken = session(mvc, firstBrowser).path("csrfToken").asString();
        String secondAnonymousToken = session(mvc, secondBrowser).path("csrfToken").asString();

        mvc.perform(passwordChange(firstBrowser, PASSWORD, newPassword)
                        .header("X-CSRF-TOKEN", firstAnonymousToken))
                .andExpect(status().isUnauthorized());
        mvc.perform(post(REGISTER).session(firstBrowser).header("X-CSRF-TOKEN", firstAnonymousToken)
                        .contentType(MediaType.APPLICATION_JSON).content(registration(email, "Kibic", PASSWORD)))
                .andExpect(status().isCreated());
        mvc.perform(login(firstBrowser, firstAnonymousToken, email, PASSWORD)).andExpect(status().isNoContent());
        mvc.perform(login(secondBrowser, secondAnonymousToken, email, PASSWORD)).andExpect(status().isNoContent());
        var firstSession = session(mvc, firstBrowser);
        assertThat(firstSession.path("authenticated").asBoolean()).isTrue();
        assertThat(session(mvc, secondBrowser).path("authenticated").asBoolean()).isTrue();
        String firstToken = firstSession.path("csrfToken").asString();

        mvc.perform(passwordChange(firstBrowser, PASSWORD, newPassword)).andExpect(status().isForbidden());
        mvc.perform(passwordChange(firstBrowser, "incorrect", newPassword).header("X-CSRF-TOKEN", firstToken))
                .andExpect(status().isUnprocessableContent());
        mvc.perform(passwordChange(firstBrowser, PASSWORD, "short-7").header("X-CSRF-TOKEN", firstToken))
                .andExpect(status().isBadRequest());
        mvc.perform(passwordChange(firstBrowser, PASSWORD, 12345678).header("X-CSRF-TOKEN", firstToken))
                .andExpect(status().isBadRequest());

        mvc.perform(passwordChange(firstBrowser, PASSWORD, newPassword).header("X-CSRF-TOKEN", firstToken))
                .andExpect(status().isNoContent()).andExpect(content().string(""));
        var firstSignedOut = session(mvc, firstBrowser);
        var secondSignedOut = session(mvc, secondBrowser);
        assertThat(firstSignedOut.path("authenticated").asBoolean()).isFalse();
        assertThat(secondSignedOut.path("authenticated").asBoolean()).isFalse();
        assertThat(secondSignedOut.path("player").isNull()).isTrue();
        String newToken = firstSignedOut.path("csrfToken").asString();
        mvc.perform(login(firstBrowser, newToken, email, PASSWORD)).andExpect(status().isUnauthorized());
        mvc.perform(login(firstBrowser, newToken, email, newPassword)).andExpect(status().isNoContent());
        assertThat(session(mvc, firstBrowser).path("player").path("id").asString())
                .isEqualTo(firstSession.path("player").path("id").asString());
    }

    @Test
    void resetsPasswordUsingAnExpiringOneUseLinkWithoutSigningInAutomatically() throws Exception {
        var mvc = MockMvcBuilders.webAppContextSetup(context)
                .addFilters(context.getBean("springSecurityFilterChain", Filter.class)).build();
        String email = "password-reset@example.test";
        String newPassword = "reset pass";
        var signedInBrowser = new MockHttpSession(context.getServletContext());
        var recoveryBrowser = new MockHttpSession(context.getServletContext());
        String signInCsrf = session(mvc, signedInBrowser).path("csrfToken").asString();
        String recoveryCsrf = session(mvc, recoveryBrowser).path("csrfToken").asString();
        mvc.perform(post(REGISTER).session(signedInBrowser).header("X-CSRF-TOKEN", signInCsrf)
                        .contentType(MediaType.APPLICATION_JSON).content(registration(email, "Kibic", PASSWORD)))
                .andExpect(status().isCreated());
        mvc.perform(login(signedInBrowser, signInCsrf, email, PASSWORD)).andExpect(status().isNoContent());

        var resetEmail = Map.of("email", email);
        mvc.perform(reset(recoveryBrowser, "/request", resetEmail)).andExpect(status().isForbidden());
        mvc.perform(reset(recoveryBrowser, "/request", Map.of("email", "unknown@example.test"))
                        .header("X-CSRF-TOKEN", recoveryCsrf))
                .andExpect(status().isNoContent()).andExpect(content().string(""));
        mvc.perform(reset(recoveryBrowser, "/request", resetEmail).header("X-CSRF-TOKEN", recoveryCsrf))
                .andExpect(status().isNoContent()).andExpect(content().string(""));

        var link = ArgumentCaptor.forClass(String.class);
        verify(resetMail, timeout(5_000)).send(eq(email), link.capture());
        String expiredToken = resetToken(link.getValue());
        var migrator = new JdbcTemplate(connection("lmuml_migrator_test", "test-only-migrator-password"));
        assertThat(migrator.queryForObject("""
                SELECT octet_length(password_reset_token_digest) FROM lmuml.players WHERE email = ?
                """, Integer.class, email)).isEqualTo(32);
        migrator.update("""
                UPDATE lmuml.players SET password_reset_requested_at = now() - INTERVAL '31 minutes' WHERE email = ?
                """, email);
        mvc.perform(reset(recoveryBrowser, "/confirm", Map.of("token", expiredToken, "newPassword", newPassword))
                        .header("X-CSRF-TOKEN", recoveryCsrf))
                .andExpect(status().isBadRequest());

        mvc.perform(reset(recoveryBrowser, "/request", resetEmail).header("X-CSRF-TOKEN", recoveryCsrf))
                .andExpect(status().isNoContent());
        verify(resetMail, timeout(5_000).times(2)).send(eq(email), link.capture());
        String token = resetToken(link.getValue());
        assertThat(token).isNotEqualTo(expiredToken);

        var confirm = Map.of("token", token, "newPassword", newPassword);
        mvc.perform(reset(recoveryBrowser, "/confirm", confirm)).andExpect(status().isForbidden());
        mvc.perform(reset(recoveryBrowser, "/confirm", Map.of("token", token, "newPassword", "short-7"))
                        .header("X-CSRF-TOKEN", recoveryCsrf))
                .andExpect(status().isBadRequest());
        mvc.perform(reset(recoveryBrowser, "/confirm", confirm).header("X-CSRF-TOKEN", recoveryCsrf))
                .andExpect(status().isNoContent()).andExpect(content().string(""));
        mvc.perform(reset(recoveryBrowser, "/confirm", confirm).header("X-CSRF-TOKEN", recoveryCsrf))
                .andExpect(status().isBadRequest());

        assertThat(session(mvc, signedInBrowser).path("authenticated").asBoolean()).isFalse();
        var recoverySession = session(mvc, recoveryBrowser);
        assertThat(recoverySession.path("authenticated").asBoolean()).isFalse();
        String loginCsrf = recoverySession.path("csrfToken").asString();
        mvc.perform(login(recoveryBrowser, loginCsrf, email, PASSWORD)).andExpect(status().isUnauthorized());
        mvc.perform(login(recoveryBrowser, loginCsrf, email, newPassword)).andExpect(status().isNoContent());
    }

    @Test
    void savesAndOverwritesOwnPredictionsUntilEachMatchStarts() throws Exception {
        var ownerSource = connection("lmuml_migrator_test", "test-only-migrator-password");
        new ResourceDatabasePopulator(new ClassPathResource("db/fixtures/match-schedule.sql"),
                new ClassPathResource("db/fixtures/player-predictions.sql")).execute(ownerSource);
        var mvc = MockMvcBuilders.webAppContextSetup(context)
                .addFilters(context.getBean("springSecurityFilterChain", Filter.class)).build();
        var firstBrowser = new MockHttpSession(context.getServletContext());
        var otherBrowser = new MockHttpSession(context.getServletContext());
        var firstScore = new Score(FIRST_MATCH, 0, 0);
        var secondScore = new Score(SECOND_MATCH, 2, 1);
        var draftScore = new Score(DRAFT_MATCH, 1, 1);

        mvc.perform(get(predictionPath(PUBLISHED_ROUND)).session(firstBrowser)).andExpect(status().isUnauthorized());
        String anonymousCsrf = session(mvc, firstBrowser).path("csrfToken").asString();
        mvc.perform(writePredictions(firstBrowser, PUBLISHED_ROUND, firstScore).header("X-CSRF-TOKEN", anonymousCsrf))
                .andExpect(status().isUnauthorized());
        String firstCsrf = createPlayerSession(mvc, firstBrowser, "predictions-first@example.test");
        String otherCsrf = createPlayerSession(mvc, otherBrowser, "predictions-other@example.test");

        mvc.perform(get(predictionPath(DRAFT_ROUND)).session(firstBrowser)).andExpect(status().isNotFound());
        mvc.perform(get(predictionPath(UUID.randomUUID().toString())).session(firstBrowser)).andExpect(status().isNotFound());
        mvc.perform(writePredictions(firstBrowser, DRAFT_ROUND, draftScore).header("X-CSRF-TOKEN", firstCsrf))
                .andExpect(status().isNotFound());
        mvc.perform(writePredictions(firstBrowser, PUBLISHED_ROUND, firstScore)).andExpect(status().isForbidden());
        mvc.perform(writePredictions(firstBrowser, PUBLISHED_ROUND, firstScore, firstScore).header("X-CSRF-TOKEN", firstCsrf))
                .andExpect(status().isBadRequest());
        mvc.perform(writePredictions(firstBrowser, PUBLISHED_ROUND, firstScore, new Score(SECOND_MATCH, 100, 1))
                        .header("X-CSRF-TOKEN", firstCsrf)).andExpect(status().isBadRequest());
        mvc.perform(writePredictions(firstBrowser, PUBLISHED_ROUND,
                        Map.of("matchId", FIRST_MATCH, "homeGoals", "2", "awayGoals", 1))
                        .header("X-CSRF-TOKEN", firstCsrf)).andExpect(status().isBadRequest());
        mvc.perform(writePredictions(firstBrowser, PUBLISHED_ROUND,
                        Map.of("matchId", FIRST_MATCH, "homeGoals", 2.5, "awayGoals", 1))
                        .header("X-CSRF-TOKEN", firstCsrf)).andExpect(status().isBadRequest());
        mvc.perform(writePredictions(firstBrowser, PUBLISHED_ROUND, Map.of("matchId", FIRST_MATCH, "homeGoals", 2))
                        .header("X-CSRF-TOKEN", firstCsrf)).andExpect(status().isBadRequest());
        var before = readPredictions(mvc, firstBrowser);
        assertEntries(before.path("predictions"));
        assertThat(OffsetDateTime.parse(before.path("serverNow").asString())).isNotNull();

        var initial = savePredictions(mvc, firstBrowser, firstCsrf, firstScore, secondScore);
        assertEntries(initial.path("saved"), firstScore, secondScore);
        assertEntries(initial.path("rejected"));

        var updatedFirst = new Score(FIRST_MATCH, 2, 2);
        var edited = savePredictions(mvc, firstBrowser, firstCsrf, updatedFirst, draftScore,
                new Score(UNCONFIRMED_MATCH, 2, 1), new Score(UNKNOWN_KICKOFF_MATCH, 2, 1));
        assertEntries(edited.path("saved"), updatedFirst);
        assertEntries(edited.path("rejected"), rejection(DRAFT_MATCH, "NOT_IN_ROUND"),
                rejection(UNCONFIRMED_MATCH, "LOCKED"), rejection(UNKNOWN_KICKOFF_MATCH, "LOCKED"));
        assertEntries(readPredictions(mvc, firstBrowser).path("predictions"),
                updatedFirst.withPoints(null), secondScore.withPoints(null));

        new JdbcTemplate(ownerSource).update("UPDATE lmuml.matches SET kickoff_at = clock_timestamp() WHERE id = ?",
                FIRST_MATCH);
        var updatedSecond = new Score(SECOND_MATCH, 3, 0);
        var afterKickoff = savePredictions(mvc, firstBrowser, firstCsrf, new Score(FIRST_MATCH, 9, 9), updatedSecond);
        assertEntries(afterKickoff.path("saved"), updatedSecond);
        assertEntries(afterKickoff.path("rejected"), rejection(FIRST_MATCH, "LOCKED"));
        assertThat(OffsetDateTime.parse(afterKickoff.path("serverNow").asString())).isNotNull();

        assertEntries(readPredictions(mvc, otherBrowser).path("predictions"));
        var otherScore = new Score(SECOND_MATCH, 5, 1);
        assertEntries(savePredictions(mvc, otherBrowser, otherCsrf, otherScore).path("saved"), otherScore);
        assertEntries(readPredictions(mvc, otherBrowser).path("predictions"), otherScore.withPoints(null));
        assertEntries(readPredictions(mvc, firstBrowser).path("predictions"),
                updatedFirst.withPoints(null), updatedSecond.withPoints(null));

        var results = new JdbcTemplate(ownerSource);
        results.update("""
                UPDATE lmuml.matches SET provider_status = 'FT', fulltime_home = 2, fulltime_away = 2 WHERE id = ?
                """, FIRST_MATCH);
        results.update("""
                UPDATE lmuml.matches
                SET provider_status = '2H', fulltime_home = 2, fulltime_away = 1, home_goals = 3, away_goals = 0
                WHERE id = ?
                """, SECOND_MATCH);
        assertEntries(readPredictions(mvc, firstBrowser).path("predictions"),
                updatedFirst.withPoints(10), updatedSecond.withPoints(null));

        results.update("UPDATE lmuml.matches SET provider_status = 'AET' WHERE id = ?", SECOND_MATCH);
        assertEntries(readPredictions(mvc, firstBrowser).path("predictions"),
                updatedFirst.withPoints(10), updatedSecond.withPoints(8));
        assertEntries(readPredictions(mvc, otherBrowser).path("predictions"), otherScore.withPoints(7));

        results.update("""
                UPDATE lmuml.matches SET provider_status = 'PEN', fulltime_home = 0, fulltime_away = 0 WHERE id = ?
                """, SECOND_MATCH);
        assertEntries(readPredictions(mvc, firstBrowser).path("predictions"),
                updatedFirst.withPoints(10), updatedSecond.withPoints(2));

        results.update("UPDATE lmuml.matches SET provider_status = 'AWD' WHERE id = ?", FIRST_MATCH);
        results.update("UPDATE lmuml.matches SET fulltime_away = NULL WHERE id = ?", SECOND_MATCH);
        assertEntries(readPredictions(mvc, firstBrowser).path("predictions"),
                updatedFirst.withPoints(null), updatedSecond.withPoints(null));
    }

    @Test
    void ranksSettledPredictionsBySeasonAndPublishedRound() throws Exception {
        String email = "ada.ranking@example.test";
        String firstRound = "a5000000-0000-0000-0000-000000000001";
        String secondRound = "a5000000-0000-0000-0000-000000000002";
        String draftRound = "a5000000-0000-0000-0000-000000000003";
        String otherSeasonRound = "a5000000-0000-0000-0000-000000000004";
        var mvc = MockMvcBuilders.webAppContextSetup(context)
                .addFilters(context.getBean("springSecurityFilterChain", Filter.class)).build();
        var browser = new MockHttpSession(context.getServletContext());
        mvc.perform(get(RANKING).session(browser)).andExpect(status().isUnauthorized());
        String csrf = session(mvc, browser).path("csrfToken").asString();
        mvc.perform(post(REGISTER).session(browser).header("X-CSRF-TOKEN", csrf)
                        .contentType(MediaType.APPLICATION_JSON).content(registration(email, "Ada", PASSWORD)))
                .andExpect(status().isCreated());
        mvc.perform(login(browser, csrf, email, PASSWORD)).andExpect(status().isNoContent());

        var ownerSource = connection("lmuml_migrator_test", "test-only-migrator-password");
        new ResourceDatabasePopulator(new ClassPathResource("db/fixtures/player-ranking.sql")).execute(ownerSource);
        var database = new JdbcTemplate(ownerSource);
        assertPredictionStatistics(mvc, browser, database, firstRound, secondRound);

        assertThat(readRanking(mvc, get(RANKING).session(browser)).path("fixturesCapturedAt").isNull()).isTrue();
        database.update("""
                INSERT INTO lmuml.api_football_snapshots (endpoint, league_id, season, captured_at, payload)
                SELECT 'fixtures', c.api_football_id, s.start_year, '2026-11-25T19:00:00Z'::timestamptz,
                    '{"get":"fixtures","errors":[]}'::jsonb
                FROM lmuml.seasons s JOIN lmuml.competitions c ON c.id = s.competition_id
                WHERE s.code = 'ranking-2026'
                """);
        var season = readRanking(mvc, get(RANKING).session(browser));
        assertThat(season.path("seasonName").asString()).isEqualTo("Ranking 2026");
        assertThat(season.path("fixturesCapturedAt").asString()).isEqualTo("2026-11-25T19:00:00Z");
        assertThat(season.path("roundId").isNull()).isTrue();
        assertThat(season.path("latestScoredRound")).isEqualTo(JSON.<JsonNode>valueToTree(
                Map.of("id", secondRound, "number", 2, "name", "Runda 2")));
        assertThat(season.path("rounds")).isEqualTo(JSON.<JsonNode>valueToTree(List.of(
                Map.of("id", secondRound, "number", 2, "name", "Runda 2"),
                Map.of("id", firstRound, "number", 1, "name", "Runda 1"))));
        assertRanking(season,
                new RankingEntry(1, "Ada", 18, 1, 2, 2, true, 8L),
                new RankingEntry(1, "Borys", 18, 1, 2, 2, false, 8L),
                new RankingEntry(3, "Cezary", 18, 0, 2, 2, false, 9L),
                new RankingEntry(4, "Hubert", 10, 1, 1, 1, false, 0L),
                new RankingEntry(5, "Gabriela", 6, 1, 2, 2, false, -4L),
                new RankingEntry(6, "Daria", 0, 0, 0, 1, false, 0L),
                new RankingEntry(7, "Ewa", -2, 0, 0, 1, false, 0L));
        assertThat(readRanking(mvc, get(RANKING).session(browser).param("sort", "POINTS"))).isEqualTo(season);

        var exact = readRanking(mvc, get(RANKING).session(browser).param("sort", "EXACT_SCORES"));
        assertRanking(exact,
                new RankingEntry(1, "Ada", 18, 1, 2, 2, true, 8L),
                new RankingEntry(1, "Borys", 18, 1, 2, 2, false, 8L),
                new RankingEntry(3, "Hubert", 10, 1, 1, 1, false, 0L),
                new RankingEntry(4, "Gabriela", 6, 1, 2, 2, false, -4L),
                new RankingEntry(5, "Cezary", 18, 0, 2, 2, false, 9L),
                new RankingEntry(6, "Daria", 0, 0, 0, 1, false, 0L),
                new RankingEntry(7, "Ewa", -2, 0, 0, 1, false, 0L));

        var outcomes = readRanking(mvc, get(RANKING).session(browser).param("sort", "OUTCOMES"));
        assertRanking(outcomes,
                new RankingEntry(1, "Ada", 18, 1, 2, 2, true, 8L),
                new RankingEntry(1, "Borys", 18, 1, 2, 2, false, 8L),
                new RankingEntry(1, "Cezary", 18, 0, 2, 2, false, 9L),
                new RankingEntry(4, "Gabriela", 6, 1, 2, 2, false, -4L),
                new RankingEntry(5, "Hubert", 10, 1, 1, 1, false, 0L),
                new RankingEntry(6, "Daria", 0, 0, 0, 1, false, 0L),
                new RankingEntry(7, "Ewa", -2, 0, 0, 1, false, 0L));

        var round = readRanking(mvc, get(RANKING).session(browser)
                .param("roundId", secondRound).param("sort", "OUTCOMES"));
        assertThat(round.path("roundId").asString()).isEqualTo(secondRound);
        assertThat(round.path("latestScoredRound").isNull()).isTrue();
        assertRanking(round,
                new RankingEntry(1, "Cezary", 9, 0, 1, 1, false, null),
                new RankingEntry(2, "Ada", 8, 0, 1, 1, true, null),
                new RankingEntry(2, "Borys", 8, 0, 1, 1, false, null),
                new RankingEntry(4, "Gabriela", -4, 0, 1, 1, false, null));
        mvc.perform(get(RANKING).session(browser).param("roundId", draftRound)).andExpect(status().isNotFound());
        mvc.perform(get(RANKING).session(browser).param("roundId", otherSeasonRound)).andExpect(status().isNotFound());
        mvc.perform(get(RANKING).session(browser).param("roundId", "invalid")).andExpect(status().isBadRequest());
        mvc.perform(get(RANKING).session(browser).param("sort", "invalid")).andExpect(status().isBadRequest());
        mvc.perform(get(PLAYER + "/seasons/missing-season/ranking").session(browser)).andExpect(status().isNotFound());

        database.update("""
                UPDATE lmuml.matches SET fulltime_home = 0, fulltime_away = 0 WHERE api_football_id = 49301
                """);
        assertRanking(readRanking(mvc, get(RANKING).session(browser)),
                new RankingEntry(1, "Cezary", 12, 0, 1, 2, false, 9L),
                new RankingEntry(2, "Ada", 10, 0, 1, 2, true, 8L),
                new RankingEntry(2, "Borys", 10, 0, 1, 2, false, 8L),
                new RankingEntry(4, "Hubert", 2, 0, 0, 1, false, 0L),
                new RankingEntry(5, "Ewa", 0, 0, 1, 1, false, 0L),
                new RankingEntry(6, "Gabriela", -2, 0, 1, 2, false, -4L),
                new RankingEntry(7, "Daria", -3, 0, 0, 1, false, 0L));
        assertRankingDeltaRound(database, mvc, browser, firstRound, secondRound, draftRound);
        assertRankingRefreshKickoffs(database, mvc, browser, firstRound, secondRound);
    }

    private static void assertPredictionStatistics(MockMvc mvc, MockHttpSession browser, JdbcTemplate database,
            String firstRound, String secondRound) throws Exception {
        String publicPath = "/api/v1/seasons/ranking-2026/prediction-statistics";
        String personalPath = PLAYER + "/seasons/ranking-2026/statistics";
        mvc.perform(get(personalPath)).andExpect(status().isUnauthorized());
        mvc.perform(get("/api/v1/seasons/MALFORMED/prediction-statistics")).andExpect(status().isBadRequest());
        mvc.perform(get("/api/v1/seasons/missing-season/prediction-statistics")).andExpect(status().isNotFound());
        mvc.perform(get(PLAYER + "/seasons/missing-season/statistics").session(browser))
                .andExpect(status().isNotFound());

        // Only the top five display names and standings are public, without IDs or predictions.
        var aggregateResponse = mvc.perform(get(publicPath)).andExpect(status().isOk()).andReturn().getResponse();
        assertThat(JSON.readTree(aggregateResponse.getContentAsByteArray())).isEqualTo(JSON.<JsonNode>valueToTree(Map.of(
                "seasonName", "Ranking 2026", "playersWithSettledPredictions", 7,
                "settledPredictions", 11, "exactScores", 4, "correctOutcomes", 9,
                "leaders", List.of(
                        Map.of("position", 1, "displayName", "Ada", "points", 18),
                        Map.of("position", 1, "displayName", "Borys", "points", 18),
                        Map.of("position", 3, "displayName", "Cezary", "points", 18),
                        Map.of("position", 4, "displayName", "Hubert", "points", 10),
                        Map.of("position", 5, "displayName", "Gabriela", "points", 6)),
                "rounds", List.of(
                        Map.of("number", 1, "name", "Runda 1", "settledPredictions", 7, "exactScores", 4,
                                "correctOutcomes", 5),
                        Map.of("number", 2, "name", "Runda 2", "settledPredictions", 4, "exactScores", 0,
                                "correctOutcomes", 4)))));

        var personalResponse = mvc.perform(get(personalPath).session(browser)).andExpect(status().isOk())
                .andReturn().getResponse();
        assertThat(personalResponse.getHeader("Cache-Control")).isEqualTo("no-store");
        assertThat(JSON.readTree(personalResponse.getContentAsByteArray())).isEqualTo(JSON.<JsonNode>valueToTree(Map.of(
                "seasonName", "Ranking 2026",
                "totals", Map.of("points", 18, "settledPredictions", 2, "exactScores", 1, "correctOutcomes", 2),
                "rounds", List.of(
                        Map.of("id", firstRound, "number", 1, "name", "Runda 1", "points", 10,
                                "settledPredictions", 1, "exactScores", 1, "correctOutcomes", 1),
                        Map.of("id", secondRound, "number", 2, "name", "Runda 2", "points", 8,
                                "settledPredictions", 1, "exactScores", 0, "correctOutcomes", 1)))));

        var emptyResponse = mvc.perform(get(PLAYER + "/seasons/ranking-2027/statistics").session(browser))
                .andExpect(status().isOk()).andReturn().getResponse();
        assertThat(JSON.readTree(emptyResponse.getContentAsByteArray())).isEqualTo(JSON.<JsonNode>valueToTree(Map.of(
                "seasonName", "Ranking 2027",
                "totals", Map.of("points", 0, "settledPredictions", 0, "exactScores", 0, "correctOutcomes", 0),
                "rounds", List.of())));

        // Inconsistent provider data can claim a match is finished before its scheduled kickoff.
        var kickoff = database.queryForObject("SELECT kickoff_at FROM lmuml.matches WHERE api_football_id = 49302",
                OffsetDateTime.class);
        database.update("UPDATE lmuml.matches SET kickoff_at = statement_timestamp() + INTERVAL '1 day' WHERE api_football_id = 49302");
        try {
            var stillPrivate = readRanking(mvc, get(personalPath).session(browser));
            assertThat(stillPrivate.path("totals").path("settledPredictions").asInt()).isEqualTo(1);
            var aggregate = readRanking(mvc, get(publicPath));
            assertThat(aggregate.path("settledPredictions").asInt()).isEqualTo(7);
            assertThat(aggregate.path("rounds")).hasSize(1);
            assertThat(aggregate.path("leaders").get(0)).isEqualTo(JSON.<JsonNode>valueToTree(
                    Map.of("position", 1, "displayName", "Ada", "points", 10)));
        } finally {
            database.update("UPDATE lmuml.matches SET kickoff_at = ? WHERE api_football_id = 49302", kickoff);
        }
    }

    private static void assertRankingDeltaRound(JdbcTemplate database, MockMvc mvc, MockHttpSession browser,
            String firstRound, String secondRound, String draftRound) throws Exception {
        database.update("UPDATE lmuml.matches SET fulltime_home = 0, fulltime_away = 0 WHERE api_football_id = 49302");
        var corrected = readRanking(mvc, get(RANKING).session(browser));
        assertThat(corrected.path("latestScoredRound").path("id").asString()).isEqualTo(secondRound);
        assertThat(corrected.path("entries")).anySatisfy(entry -> {
            assertThat(entry.path("displayName").asString()).isEqualTo("Ada");
            assertThat(entry.path("latestRoundPoints").asLong()).isEqualTo(4);
        });

        // A higher published round with no completed result cannot move the comparison forward.
        database.update("UPDATE lmuml.matches SET provider_status = 'NS' WHERE api_football_id = 49305");
        database.update("UPDATE lmuml.betting_rounds SET published_at = CURRENT_TIMESTAMP WHERE id = ?::uuid", draftRound);
        assertThat(readRanking(mvc, get(RANKING).session(browser)).path("latestScoredRound").path("id").asString())
                .isEqualTo(secondRound);

        // The comparison round is shared by all players even if no one predicted it.
        database.update("DELETE FROM lmuml.player_predictions WHERE match_id = (SELECT id FROM lmuml.matches WHERE api_football_id = 49302)");
        var withoutPredictions = readRanking(mvc, get(RANKING).session(browser));
        assertThat(withoutPredictions.path("latestScoredRound").path("id").asString()).isEqualTo(secondRound);
        assertThat(withoutPredictions.path("entries")).allSatisfy(entry ->
                assertThat(entry.path("latestRoundPoints").asLong()).isZero());

        database.update("UPDATE lmuml.matches SET fulltime_away = NULL WHERE api_football_id = 49302");
        assertThat(readRanking(mvc, get(RANKING).session(browser)).path("latestScoredRound").path("id").asString())
                .isEqualTo(firstRound);
        database.update("UPDATE lmuml.matches SET provider_status = 'NS' WHERE api_football_id = 49301");
        var unscored = readRanking(mvc, get(RANKING).session(browser));
        assertThat(unscored.path("latestScoredRound").isNull()).isTrue();
        assertThat(unscored.path("entries")).isEqualTo(JSON.createArrayNode());

        database.update("UPDATE lmuml.matches SET provider_status = 'PEN' WHERE api_football_id = 49301");
        database.update("UPDATE lmuml.betting_rounds SET published_at = NULL WHERE id = ?::uuid", draftRound);
    }

    private static void assertRankingRefreshKickoffs(JdbcTemplate database, MockMvc mvc, MockHttpSession browser,
            String firstRound, String secondRound) throws Exception {
        var now = database.queryForObject("SELECT date_trunc('minute', CURRENT_TIMESTAMP)", OffsetDateTime.class);
        var recent = now.minusHours(2);
        var future = now.plusHours(2);
        database.update("UPDATE lmuml.matches SET kickoff_at = ? WHERE api_football_id IN (49301, 49303)", recent);
        database.update("UPDATE lmuml.matches SET kickoff_at = ?, provider_status = 'NS' WHERE api_football_id = 49302",
                future);
        database.update("UPDATE lmuml.matches SET kickoff_at = ?, provider_status = 'PST' WHERE api_football_id = 49304",
                now.plusHours(3));
        database.update("UPDATE lmuml.matches SET kickoff_at = ? WHERE api_football_id IN (49305, 49306)",
                now.plusHours(4));
        database.update("""
                DELETE FROM lmuml.player_predictions
                WHERE match_id = (SELECT id FROM lmuml.matches WHERE api_football_id = 49302)
                """);

        String recentIso = recent.toInstant().toString();
        String futureIso = future.toInstant().toString();
        assertThat(readRanking(mvc, get(RANKING).session(browser)).path("refreshKickoffs"))
                .isEqualTo(JSON.<JsonNode>valueToTree(List.of(recentIso, futureIso)));
        assertThat(readRanking(mvc, get(RANKING).session(browser).param("roundId", firstRound)).path("refreshKickoffs"))
                .isEqualTo(JSON.<JsonNode>valueToTree(List.of(recentIso)));
        assertThat(readRanking(mvc, get(RANKING).session(browser).param("roundId", secondRound)).path("refreshKickoffs"))
                .isEqualTo(JSON.<JsonNode>valueToTree(List.of(futureIso)));

        database.update("UPDATE lmuml.matches SET kickoff_at = ? WHERE api_football_id IN (49301, 49302, 49303)",
                now.minusDays(2));
        assertThat(readRanking(mvc, get(RANKING).session(browser)).path("refreshKickoffs"))
                .isEqualTo(JSON.createArrayNode());
    }

    private static JsonNode readRanking(MockMvc mvc, MockHttpServletRequestBuilder request) throws Exception {
        var response = mvc.perform(request).andExpect(status().isOk()).andReturn().getResponse();
        return JSON.readTree(response.getContentAsByteArray());
    }

    @Test
    void revealsOtherPlayersPredictionsOnlyForStartedMatchesInPublishedRound() throws Exception {
        String roundId = "b5000000-0000-0000-0000-000000000001";
        String draftRoundId = "b5000000-0000-0000-0000-000000000002";
        String emptyRoundId = "b5000000-0000-0000-0000-000000000003";
        String path = PLAYER_ROUNDS + roundId + "/players-predictions";
        var mvc = MockMvcBuilders.webAppContextSetup(context)
                .addFilters(context.getBean("springSecurityFilterChain", Filter.class)).build();
        var browser = new MockHttpSession(context.getServletContext());
        mvc.perform(get(path).session(browser)).andExpect(status().isUnauthorized());
        createPlayerSession(mvc, browser, "community-viewer@example.test");

        var ownerSource = connection("lmuml_migrator_test", "test-only-migrator-password");
        new ResourceDatabasePopulator(new ClassPathResource("db/fixtures/players-predictions.sql")).execute(ownerSource);
        var database = new JdbcTemplate(ownerSource);
        var viewerId = database.queryForObject("SELECT id FROM lmuml.players WHERE email = ?", UUID.class,
                "community-viewer@example.test");
        var past = database.queryForObject("SELECT statement_timestamp() - INTERVAL '1 day'", OffsetDateTime.class);
        var future = past.plusDays(2);
        var revealedStatuses = List.of("NS", "1H", "HT", "2H", "ET", "BT", "P", "LIVE", "SUSP", "INT",
                "FT", "AET", "PEN", "ABD", "AWD", "WO");
        var expectedPredictions = new ArrayList<ScoredPrediction>();
        for (int index = 0; index < revealedStatuses.size(); index++) {
            String providerStatus = revealedStatuses.get(index);
            var matchId = communityMatch(index + 1);
            insertCommunityMatch(database, matchId, index + 1, providerStatus, past, "league:1", 1);
            insertCommunityPrediction(database, viewerId, matchId, 2, 1);
            Integer points = List.of("FT", "AET", "PEN").contains(providerStatus) ? 10 : null;
            expectedPredictions.add(new ScoredPrediction(matchId, 2, 1, points));
        }
        // The provider's final/penalty totals must not replace the result after regulation time.
        database.update("""
                UPDATE lmuml.matches
                SET home_goals = 4, away_goals = 4, extratime_home = 4, extratime_away = 4,
                    penalty_home = 5, penalty_away = 3
                WHERE provider_status IN ('AET', 'PEN')
                  AND season_id = 'b1000000-0000-0000-0000-000000000001'
                """);
        int index = 17;
        for (String providerStatus : List.of("TBD", "PST", "CANC", "UNRECOGNIZED")) {
            var matchId = communityMatch(index);
            insertCommunityMatch(database, matchId, index++, providerStatus, past, "league:1", 1);
            insertCommunityPrediction(database, viewerId, matchId, 97, 98);
        }
        insertCommunityMatch(database, communityMatch(21), 21, "NS", null, "league:1", 1);
        insertCommunityMatch(database, communityMatch(22), 22, "NS", future, "league:1", 1);
        insertCommunityMatch(database, communityMatch(23), 23, "FT", future, "league:1", 1);
        insertCommunityMatch(database, communityMatch(24), 24, "FT", past, "league:1", null);
        insertCommunityMatch(database, communityMatch(25), 25, "FT", past, "league:4", 1);
        for (int match = 21; match <= 25; match++) {
            insertCommunityPrediction(database, viewerId, communityMatch(match), 97, 98);
        }
        expectedPredictions.add(new ScoredPrediction(communityMatch(24), 97, 98, null));
        var negativePlayer = UUID.fromString("b6000000-0000-0000-0000-000000000001");
        var zeroPlayer = UUID.fromString("b6000000-0000-0000-0000-000000000002");
        var hiddenPlayer = UUID.fromString("b6000000-0000-0000-0000-000000000003");
        insertCommunityPrediction(database, negativePlayer, communityMatch(11), 20, 20);
        insertCommunityPrediction(database, zeroPlayer, communityMatch(11), 10, 3);
        insertCommunityPrediction(database, hiddenPlayer, communityMatch(22), 96, 95);

        var response = mvc.perform(get(path).session(browser)).andExpect(status().isOk()).andReturn().getResponse();
        assertThat(response.getHeader("Cache-Control")).isEqualTo("no-store");
        var body = JSON.readTree(response.getContentAsByteArray());
        assertThat(body.path("roundId").asString()).isEqualTo(roundId);
        assertThat(OffsetDateTime.parse(body.path("serverNow").asString())).isBetween(past, future);
        assertEntries(body.path("players"),
                new CommunityPlayer(viewerId, "Kibic", true, expectedPredictions),
                new CommunityPlayer(negativePlayer, "Minus", false,
                        List.of(new ScoredPrediction(communityMatch(11), 20, 20, -32))),
                new CommunityPlayer(zeroPlayer, "Zero", false,
                        List.of(new ScoredPrediction(communityMatch(11), 10, 3, 0))),
                new CommunityPlayer(hiddenPlayer, "Ukryty", false, List.of()));
        // Assert identifiers/fields rather than goal substrings, which can also occur in UUIDs or serverNow.
        assertThat(response.getContentAsString()).doesNotContain("@example.test", "password", "hash",
                communityMatch(17).toString(), communityMatch(21).toString(), communityMatch(22).toString(),
                communityMatch(23).toString(), communityMatch(25).toString());

        mvc.perform(get(PLAYER_ROUNDS + draftRoundId + "/players-predictions").session(browser))
                .andExpect(status().isNotFound());
        mvc.perform(get(PLAYER_ROUNDS + UUID.randomUUID() + "/players-predictions").session(browser))
                .andExpect(status().isNotFound());
        mvc.perform(get(PLAYER_ROUNDS + "invalid/players-predictions").session(browser))
                .andExpect(status().isBadRequest());
        var emptyResponse = mvc.perform(get(PLAYER_ROUNDS + emptyRoundId + "/players-predictions").session(browser))
                .andExpect(status().isOk()).andReturn().getResponse();
        assertThat(JSON.readTree(emptyResponse.getContentAsByteArray()).path("players")).isEqualTo(JSON.createArrayNode());

        // A provider postponement hides previously revealed scores; a new confirmed kickoff reveals them again.
        database.update("UPDATE lmuml.matches SET provider_status = 'PST' WHERE id = ?", communityMatch(11));
        var postponed = JSON.readTree(mvc.perform(get(path).session(browser)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray());
        assertThat(postponed.path("players")).allSatisfy(player ->
                assertThat(player.path("predictions")).noneSatisfy(prediction ->
                        assertThat(prediction.path("matchId").asString()).isEqualTo(communityMatch(11).toString())));
        database.update("UPDATE lmuml.matches SET kickoff_at = statement_timestamp(), provider_status = 'NS' WHERE id = ?",
                communityMatch(22));
        var started = JSON.readTree(mvc.perform(get(path).session(browser)).andExpect(status().isOk())
                .andReturn().getResponse().getContentAsByteArray());
        assertThat(started.path("players")).anySatisfy(player -> {
            assertThat(player.path("id").asString()).isEqualTo(hiddenPlayer.toString());
            assertEntries(player.path("predictions"), new ScoredPrediction(communityMatch(22), 96, 95, null));
        });
    }

    private static UUID communityMatch(int number) {
        return UUID.fromString("b3000000-0000-0000-0000-" + "%012d".formatted(number));
    }

    private static void insertCommunityMatch(JdbcTemplate database, UUID id, int providerOffset, String status,
            OffsetDateTime kickoff, String group, Integer fulltimeAway) {
        database.update("""
                INSERT INTO lmuml.matches (id, season_id, api_football_id, provider_status, kickoff_at,
                    home_team_id, away_team_id, fulltime_home, fulltime_away)
                VALUES (?, 'b1000000-0000-0000-0000-000000000001', ?, ?, ?,
                    'b2000000-0000-0000-0000-000000000001', 'b2000000-0000-0000-0000-000000000002', 2, ?)
                """, id, 59300 + providerOffset, status, kickoff, fulltimeAway);
        database.update("""
                INSERT INTO lmuml.betting_round_matches (match_id, season_id, group_key)
                VALUES (?, 'b1000000-0000-0000-0000-000000000001', ?)
                """, id, group);
    }

    private static void insertCommunityPrediction(JdbcTemplate database, UUID player, UUID match, int home, int away) {
        database.update("INSERT INTO lmuml.player_predictions (player_id, match_id, home_goals, away_goals) VALUES (?, ?, ?, ?)",
                player, match, home, away);
    }

    private record CommunityPlayer(UUID id, String displayName, boolean isCurrentPlayer,
            List<ScoredPrediction> predictions) {}

    private static void assertRanking(JsonNode ranking, RankingEntry... entries) {
        assertThat(ranking.path("entries")).isEqualTo(JSON.readTree(JSON.writeValueAsBytes(List.of(entries))));
    }

    private record RankingEntry(int position, String displayName, int points, int exactScores, int correctOutcomes,
            int settledPredictions, boolean isCurrentPlayer, Long latestRoundPoints) {}

    private String createPlayerSession(MockMvc mvc, MockHttpSession browser, String email) throws Exception {
        String csrf = session(mvc, browser).path("csrfToken").asString();
        mvc.perform(post(REGISTER).session(browser).header("X-CSRF-TOKEN", csrf)
                        .contentType(MediaType.APPLICATION_JSON).content(registration(email, "Kibic", PASSWORD)))
                .andExpect(status().isCreated());
        mvc.perform(login(browser, csrf, email, PASSWORD)).andExpect(status().isNoContent());
        return session(mvc, browser).path("csrfToken").asString();
    }

    private static JsonNode readPredictions(MockMvc mvc, MockHttpSession browser) throws Exception {
        var response = mvc.perform(get(predictionPath(PUBLISHED_ROUND)).session(browser)).andExpect(status().isOk())
                .andReturn().getResponse();
        return JSON.readTree(response.getContentAsByteArray());
    }

    private static JsonNode savePredictions(MockMvc mvc, MockHttpSession browser, String csrf, Score... scores)
            throws Exception {
        var response = mvc.perform(writePredictions(browser, PUBLISHED_ROUND, (Object[]) scores)
                        .header("X-CSRF-TOKEN", csrf)).andExpect(status().isOk()).andReturn().getResponse();
        return JSON.readTree(response.getContentAsByteArray());
    }

    private static MockHttpServletRequestBuilder writePredictions(MockHttpSession browser, String round, Object... entries) {
        return post(predictionPath(round)).session(browser).contentType(MediaType.APPLICATION_JSON)
                .content(JSON.writeValueAsString(Map.of("predictions", List.of(entries))));
    }

    private static String predictionPath(String round) {
        return PLAYER_ROUNDS + round + "/predictions";
    }

    private static Map<String, Object> rejection(UUID matchId, String reason) {
        return Map.of("matchId", matchId, "reason", reason);
    }

    private static void assertEntries(JsonNode actual, Object... expected) {
        assertThat(actual.isArray()).isTrue();
        var actualEntries = new ArrayList<JsonNode>();
        actual.forEach(actualEntries::add);
        var expectedEntries = Arrays.stream(expected).map(value -> JSON.<JsonNode>valueToTree(value)).toList();
        assertThat(actualEntries).containsExactlyInAnyOrderElementsOf(expectedEntries);
    }

    private record Score(UUID matchId, int homeGoals, int awayGoals) {
        ScoredPrediction withPoints(Integer points) {
            return new ScoredPrediction(matchId, homeGoals, awayGoals, points);
        }
    }

    private record ScoredPrediction(UUID matchId, int homeGoals, int awayGoals, Integer points) {}

    private static MockHttpServletRequestBuilder reset(MockHttpSession browser, String path, Map<String, String> body) {
        return post(PASSWORD_RESET + path).session(browser).contentType(MediaType.APPLICATION_JSON)
                .content(JSON.writeValueAsString(body));
    }

    private static String resetToken(String link) {
        assertThat(link).startsWith(RESET_LINK);
        String token = link.substring(RESET_LINK.length());
        assertThat(token).matches("[A-Za-z0-9_-]{43}");
        return token;
    }

    private static JsonNode session(MockMvc mvc, MockHttpSession browser) throws Exception {
        var response = mvc.perform(get(PLAYER + "/session").session(browser)).andExpect(status().isOk())
                .andReturn().getResponse();
        return JSON.readTree(response.getContentAsByteArray());
    }

    private static MockHttpServletRequestBuilder login(MockHttpSession browser, String token,
            String email, String password) {
        return post(PLAYER + "/login").session(browser).header("X-CSRF-TOKEN", token)
                .contentType(MediaType.APPLICATION_FORM_URLENCODED)
                .param("username", email).param("password", password);
    }

    private static MockHttpServletRequestBuilder passwordChange(MockHttpSession browser,
            String currentPassword, Object newPassword) {
        return post(PLAYER + "/password").session(browser).contentType(MediaType.APPLICATION_JSON)
                .content(JSON.writeValueAsString(Map.of("currentPassword", currentPassword, "newPassword", newPassword)));
    }

    private static String registration(String email, String displayName, Object password) {
        return JSON.writeValueAsString(Map.of("email", email, "displayName", displayName, "password", password));
    }

    private static DriverManagerDataSource connection(String username, String password) {
        return new DriverManagerDataSource(POSTGRES.getJdbcUrl(), username, password);
    }
}
