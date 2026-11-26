package pl.lmuml;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.awaitility.Awaitility.await;

@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT, properties = {
        // Expected connection errors are asserted through HTTP during the outage scenario.
        "logging.level.org.springframework.boot.jdbc.health.DataSourceHealthIndicator=OFF",
        "logging.level.com.zaxxer.hikari.pool.ProxyConnection=OFF"
})
@Testcontainers
class ApplicationHealthIT {

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(
            DockerImageName.parse("postgres:18.6-trixie@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6")
                    .asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("lmuml_test")
            .withUsername("test_admin")
            .withPassword("test-only-admin-password")
            .withInitScript("db/test-app-role.sql");

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(3))
            .build();

    @LocalServerPort
    private int port;

    @Autowired
    private JdbcTemplate jdbc;

    @DynamicPropertySource
    static void databaseProperties(DynamicPropertyRegistry properties) {
        properties.add("spring.datasource.url", () -> POSTGRES.getJdbcUrl()
                + (POSTGRES.getJdbcUrl().contains("?") ? "&" : "?")
                + "connectTimeout=3&socketTimeout=3");
        properties.add("spring.datasource.username", () -> "lmuml_app_test");
        properties.add("spring.datasource.password", () -> "test-only-app-password");
    }

    @Test
    void connectsUsingRestrictedApplicationRole() {
        assertThat(jdbc.queryForObject("SELECT 1", Integer.class)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT current_user", String.class))
                .isEqualTo("lmuml_app_test");
        assertThat(jdbc.queryForObject("""
                SELECT rolsuper OR rolcreatedb OR rolcreaterole OR rolreplication OR rolbypassrls
                FROM pg_roles WHERE rolname = current_user
                """, Boolean.class)).isFalse();
        assertThatThrownBy(() -> jdbc.execute("CREATE TABLE forbidden_bootstrap_probe (id integer)"))
                .isInstanceOf(DataAccessException.class);
    }

    @Test
    void exposesHealthWithoutInternalDetailsOrOtherManagementEndpoints() throws Exception {
        assertHealth("liveness", 200, "UP");
        assertHealth("readiness", 200, "UP");

        HttpResponse<String> health = get("/actuator/health");
        assertThat(health.statusCode()).isEqualTo(200);
        assertThat(health.body()).contains("\"status\":\"UP\"")
                .doesNotContain("components", "details", "jdbc:", "PostgreSQL");

        for (String endpoint : new String[] {"env", "configprops", "info"}) {
            assertThat(get("/actuator/" + endpoint).statusCode()).isEqualTo(404);
        }
    }

    @Test
    void databaseUnavailabilityAffectsReadinessButNotLivenessAndCanRecover() throws Exception {
        assertHealth("readiness", 200, "UP");
        // Freeze the database without changing its random host port on Docker Desktop.
        POSTGRES.getDockerClient().pauseContainerCmd(POSTGRES.getContainerId()).exec();
        try {
            assertHealth("readiness", 503, "DOWN");
            assertHealth("liveness", 200, "UP");
        } finally {
            POSTGRES.getDockerClient().unpauseContainerCmd(POSTGRES.getContainerId()).exec();
            await().atMost(Duration.ofSeconds(30)).pollInterval(Duration.ofMillis(250))
                    .untilAsserted(() -> assertHealth("readiness", 200, "UP"));
        }
    }

    private void assertHealth(String group, int statusCode, String status) throws Exception {
        HttpResponse<String> response = get("/actuator/health/" + group);
        assertThat(response.statusCode()).isEqualTo(statusCode);
        assertThat(response.body()).isEqualTo("{\"status\":\"" + status + "\"}");
    }

    private HttpResponse<String> get(String path) throws Exception {
        HttpRequest request = HttpRequest.newBuilder(URI.create("http://127.0.0.1:" + port + path))
                .timeout(Duration.ofSeconds(8))
                .GET()
                .build();
        return http.send(request, HttpResponse.BodyHandlers.ofString());
    }
}
