package pl.lmuml.football.matches;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.Map;
import java.util.stream.IntStream;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.support.TransactionTemplate;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.node.ObjectNode;

import static org.assertj.core.api.Assertions.assertThat;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        "lmuml.catalog-cache.enabled=true"
})
@Testcontainers
class SeasonMatchesCacheIT {

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(
            DockerImageName.parse("postgres:18.6-trixie@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6")
                    .asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("lmuml_test").withUsername("test_admin")
            .withPassword("test-only-admin-password").withInitScript("db/test-app-role.sql");

    @Container
    static final GenericContainer<?> REDIS = new GenericContainer<>(
            DockerImageName.parse("redis:8.10.3-alpine@sha256:7958cfbb9d152f87dadfbc89f1b0b15938f0b81ff8982feb327476f4911935c3"))
            .withExposedPorts(6379);

    @LocalServerPort
    private int port;

    private final HttpClient http = HttpClient.newHttpClient();
    private final JsonMapper json = JsonMapper.builder().build();

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry properties) {
        Flyway.configure().dataSource(ownerSource()).schemas("lmuml").defaultSchema("lmuml")
                .createSchemas(false).cleanDisabled(true).locations("classpath:db/migration")
                .placeholders(Map.of("runtime", "lmuml_app_test", "importer", "lmuml_importer_test"))
                .load().migrate();
        properties.add("spring.datasource.url", POSTGRES::getJdbcUrl);
        properties.add("spring.datasource.username", () -> "lmuml_app_test");
        properties.add("spring.datasource.password", () -> "test-only-app-password");
        properties.add("spring.data.redis.host", REDIS::getHost);
        properties.add("spring.data.redis.port", () -> REDIS.getMappedPort(6379));
    }

    @Test
    void cachesSharedCatalogueByRevisionAndReadsPostgresWhenRedisIsDown() throws Exception {
        var source = ownerSource();
        var owner = new JdbcTemplate(source);
        new ResourceDatabasePopulator(new ClassPathResource("db/fixtures/match-schedule.sql")).execute(source);
        assertThat(catalogue().path("fixturesCapturedAt").isNull()).isTrue();
        assertThat(redis("DBSIZE")).isEqualTo("0");

        owner.update("""
                INSERT INTO lmuml.api_football_snapshots (endpoint, league_id, season, captured_at, payload)
                VALUES ('fixtures', 9001, 2026, '2026-10-26T20:15:00Z', '{"get":"fixtures","errors":[]}')
                """);
        var simultaneousReads = IntStream.range(0, 12).mapToObj(index ->
                http.sendAsync(catalogueRequest(), HttpResponse.BodyHandlers.ofString())).toList();
        var initial = readBody(simultaneousReads.getFirst().join());
        for (var read : simultaneousReads) assertThat(readBody(read.join())).isEqualTo(initial);
        assertThat(redis("INFO", "commandstats")).contains("cmdstat_set:calls=1,");
        assertThat(initial.path("standings").isNull()).isTrue();
        String initialKey = redis("KEYS", "lmuml:season-matches:v1:*");
        assertThat(initialKey).startsWith("lmuml:season-matches:v1:10000000-0000-0000-0000-000000000001:");
        assertThat(Long.parseLong(redis("TTL", initialKey))).isBetween(1L, 30L);

        var cacheHit = initial.deepCopy();
        ((ObjectNode) cacheHit.path("competition")).put("name", "Cached competition");
        assertThat(redis("SET", initialKey, cacheHit.toString(), "EX", "30")).isEqualTo("OK");
        assertThat(catalogue().path("competition").path("name").asString()).isEqualTo("Cached competition");

        owner.update("""
                INSERT INTO lmuml.season_standings
                    (season_id, team_id, position, played, won, drawn, lost, goals_for, goals_against,
                     goal_difference, points, captured_at)
                VALUES ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001',
                        1, 1, 1, 0, 0, 2, 1, 1, 3, '2026-10-26T21:00:00Z')
                """);
        var withStandings = catalogue();
        assertThat(withStandings.path("fixturesCapturedAt")).isEqualTo(initial.path("fixturesCapturedAt"));
        assertThat(withStandings.path("standings").path("rows").get(0).path("points").asInt()).isEqualTo(3);

        new TransactionTemplate(new DataSourceTransactionManager(source)).executeWithoutResult(status -> {
            owner.update("""
                    UPDATE lmuml.matches SET provider_status = 'FT', home_goals = 2, away_goals = 1,
                        fulltime_home = 2, fulltime_away = 1
                    WHERE api_football_id = 7001
                    """);
            owner.update("""
                    UPDATE lmuml.api_football_snapshots SET captured_at = '2026-10-26T21:05:00.123456Z'
                    WHERE endpoint = 'fixtures' AND league_id = 9001 AND season = 2026
                    """);
        });
        var fresh = catalogue();
        assertThat(fresh.path("fixturesCapturedAt").asString()).isEqualTo("2026-10-26T21:05:00.123456Z");
        assertThat(fresh.path("matches").get(0).path("scores").path("regulationTime").path("home").asInt()).isEqualTo(2);

        REDIS.stop();
        assertThat(catalogue()).isEqualTo(fresh);
    }

    private JsonNode catalogue() throws Exception {
        return readBody(http.send(catalogueRequest(), HttpResponse.BodyHandlers.ofString()));
    }

    private HttpRequest catalogueRequest() {
        return HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + "/api/v1/seasons/demo-2026/matches"))
                .timeout(Duration.ofSeconds(8)).GET().build();
    }

    private JsonNode readBody(HttpResponse<String> response) {
        assertThat(response.statusCode()).isEqualTo(200);
        return json.readTree(response.body());
    }

    private static String redis(String... arguments) throws Exception {
        var command = new String[arguments.length + 2];
        command[0] = "redis-cli";
        command[1] = "--raw";
        System.arraycopy(arguments, 0, command, 2, arguments.length);
        var result = REDIS.execInContainer(command);
        assertThat(result.getExitCode()).isZero();
        return result.getStdout().strip();
    }

    private static DriverManagerDataSource ownerSource() {
        return new DriverManagerDataSource(POSTGRES.getJdbcUrl(), "lmuml_migrator_test", "test-only-migrator-password");
    }
}
