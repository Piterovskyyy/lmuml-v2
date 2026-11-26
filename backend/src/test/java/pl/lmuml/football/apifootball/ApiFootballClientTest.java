package pl.lmuml.football.apifootball;

import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.HttpHeaders;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.api.Assertions.assertTimeoutPreemptively;
import static pl.lmuml.football.apifootball.ApiFootballException.Kind.*;

class ApiFootballClientTest {

    private static final String KEY = "synthetic-test-key";
    private static final String EMPTY = """
            {"get":"fixtures","errors":[],"results":0,"paging":{"current":1,"total":1},"response":[]}
            """;

    private final List<Request> requests = new CopyOnWriteArrayList<>();
    private HttpServer server;
    private ExecutorService executor;
    private HttpClient transport;
    private ApiFootballClient client;

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        executor = Executors.newCachedThreadPool();
        server.setExecutor(executor);
        server.start();
        transport = new ApiFootballConfiguration().apiFootballTransport();
        client = client(Duration.ofSeconds(3));
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
        executor.shutdownNow();
        transport.close();
    }

    @Test
    void readsFixturesWithQueryParametersHeaderAndQuota() throws IOException {
        String body = new ClassPathResource("apifootball/fixture-envelope.json")
                .getContentAsString(StandardCharsets.UTF_8);
        respond(200, body);

        var result = client.fixtures(9001, 2026);

        assertThat(result.items()).hasSize(1);
        assertThat(result.items().getFirst().fixture().id()).isEqualTo(7001L);
        assertThat(result.paging().current()).isEqualTo(1);
        assertThat(result.quota()).isEqualTo(new ApiFootballResponse.Quota(100, 98, 10, 8));
        assertThat(requests).containsExactly(new Request("GET", "/fixtures?league=9001&season=2026", KEY));
        assertThatThrownBy(() -> result.items().clear()).isInstanceOf(UnsupportedOperationException.class);
    }

    @Test
    void readsLeagueCoverageUsingIdRatherThanLeagueParameter() {
        respond(200, """
                {"get":"leagues","errors":{},"results":1,"paging":{"current":1,"total":1},
                 "response":[{"league":{"id":9001},"seasons":[{"year":2024,"coverage":{"standings":true}}]}]}
                """);

        var result = client.leagues(9001, 2024);

        assertThat(result.items().getFirst().seasons().getFirst().coverage().standings()).isTrue();
        assertThat(requests).containsExactly(new Request("GET", "/leagues?id=9001&season=2024", KEY));
    }

    @Test
    void acceptsExplicitEmptyResultsAndDoesNotFetchOtherPages() {
        respond(200, EMPTY.replace("\"total\":1", "\"total\":2").replace("\"errors\":[]", "\"errors\":{}"));

        var result = client.fixtures(9001, 2024);

        assertThat(result.items()).isEmpty();
        assertThat(result.paging().total()).isEqualTo(2);
        assertThat(requests).hasSize(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"{\"plan\":\"synthetic-test-key\"}", "[\"synthetic-test-key\"]"})
    void rejectsApiErrorsEvenWithHttp200AndUnusablePayload(String errors) {
        respond(200, "{\"errors\":" + errors + ",\"response\":{\"unexpected\":true}}");

        assertFailure(API_ERROR, 200);
    }

    @ParameterizedTest
    @ValueSource(ints = {204, 302, 401, 403, 429, 499, 500, 503})
    void rejectsNon200StatusWithoutRetryOrFollowingRedirects(int status) {
        server.createContext("/destination", exchange -> {
            capture(exchange);
            exchange.sendResponseHeaders(200, -1);
            exchange.close();
        });
        respond(status, KEY);

        assertFailure(HTTP_ERROR, status);
        assertThat(requests).hasSize(1);
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "not-json", "null", "{}", "[]",
            "{\"errors\":null}", "{\"errors\":false}", "{\"errors\":\"\"}",
            "{\"get\":\"fixtures\",\"errors\":[],\"results\":0,\"paging\":{\"current\":1,\"total\":1},\"response\":{}}",
            "{\"get\":\"fixtures\",\"errors\":[],\"results\":1,\"paging\":{\"current\":1,\"total\":1},\"response\":[]}",
            "{\"get\":\"fixtures\",\"errors\":[],\"results\":1,\"paging\":{\"current\":1,\"total\":1},\"response\":[null]}"})
    void rejectsMalformedResponsesRatherThanReturningEmptySchedule(String body) {
        respond(200, body);
        assertFailure(INVALID_RESPONSE, 200);
    }

    @Test
    void rejectsWrongEndpointPagingAndTrailingJson() {
        List<String> bodies = List.of(EMPTY.replace("fixtures", "leagues"),
                EMPTY.replace("\"current\":1", "\"current\":0"),
                EMPTY.replace("\"total\":1", "\"total\":0"), EMPTY + "{}");
        for (int index = 0; index < bodies.size(); index++) {
            if (index > 0) server.removeContext("/");
            respond(200, bodies.get(index));
            assertFailure(INVALID_RESPONSE, 200);
        }
    }

    @Test
    void rejectsOversizedBody() {
        respond(200, " ".repeat(ApiFootballClient.MAX_RESPONSE_BYTES + 1));
        assertFailure(INVALID_RESPONSE, 200);
    }

    @Test
    void doesNotSilentlyTruncateFractionalIdentifiers() {
        respond(200, """
                {"get":"fixtures","errors":[],"results":1,"paging":{"current":1,"total":1},
                 "response":[{"fixture":{"id":7001.5}}]}
                """);
        assertFailure(INVALID_RESPONSE, 200);
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void boundsWaitingForHeadersAndBodyWithoutRetry(boolean headersSent) {
        CountDownLatch release = new CountDownLatch(1);
        server.createContext("/", exchange -> {
            capture(exchange);
            try {
                if (headersSent) {
                    exchange.sendResponseHeaders(200, 100);
                    exchange.getResponseBody().write('{');
                    exchange.getResponseBody().flush();
                }
                release.await();
            } catch (InterruptedException interrupted) {
                Thread.currentThread().interrupt();
            } finally {
                exchange.close();
            }
        });
        client = client(Duration.ofMillis(150));
        try {
            assertTimeoutPreemptively(Duration.ofSeconds(3), () ->
                    assertThatExceptionOfType(ApiFootballException.class)
                            .isThrownBy(() -> client.fixtures(9001, 2024))
                            .satisfies(failure -> {
                                assertThat(failure.kind()).isEqualTo(TRANSPORT_ERROR);
                                assertThat(failure.httpStatus()).isNull();
                                assertThat(failure.getCause()).isNull();
                            }));
            assertThat(requests).hasSize(1);
        } finally {
            release.countDown();
        }
    }

    @Test
    void refusesInvalidParametersBeforeMakingARequest() {
        assertThatThrownBy(() -> client.fixtures(0, 2024)).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> client.leagues(9001, -1)).isInstanceOf(IllegalArgumentException.class);
        assertThat(requests).isEmpty();
    }

    @Test
    void toleratesUnavailableQuotaMetadata() {
        HttpHeaders headers = new HttpHeaders();
        headers.add("x-ratelimit-requests-limit", "invalid");
        headers.add("x-ratelimit-requests-remaining", "-1");
        headers.add("x-ratelimit-limit", "999999999999999999999");
        assertThat(ApiFootballResponse.Quota.from(headers))
                .isEqualTo(new ApiFootballResponse.Quota(null, null, null, null));
    }

    private ApiFootballClient client(Duration timeout) {
        RestClient http = RestClient.builder()
                .baseUrl("http://127.0.0.1:" + server.getAddress().getPort())
                .requestFactory(ApiFootballConfiguration.requestFactory(transport, timeout))
                .defaultHeader("x-apisports-key", KEY)
                .build();
        return new ApiFootballClient(http, JsonMapper.builder().build());
    }

    private void respond(int status, String body) {
        // The broader context captures all client paths; no external API is contacted.
        server.createContext("/", exchange -> {
            capture(exchange);
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.getResponseHeaders().add("Location", "/destination");
            exchange.getResponseHeaders().add("x-ratelimit-requests-limit", "100");
            exchange.getResponseHeaders().add("x-ratelimit-requests-remaining", "98");
            exchange.getResponseHeaders().add("x-ratelimit-limit", "10");
            exchange.getResponseHeaders().add("x-ratelimit-remaining", "8");
            byte[] bytes = body.getBytes(StandardCharsets.UTF_8);
            exchange.sendResponseHeaders(status, status == 204 || bytes.length == 0 ? -1 : bytes.length);
            if (status != 204 && bytes.length > 0) exchange.getResponseBody().write(bytes);
            exchange.close();
        });
    }

    private void capture(HttpExchange exchange) {
        requests.add(new Request(exchange.getRequestMethod(), exchange.getRequestURI().toString(),
                exchange.getRequestHeaders().getFirst("x-apisports-key")));
    }

    private void assertFailure(ApiFootballException.Kind kind, int status) {
        assertThatExceptionOfType(ApiFootballException.class)
                .isThrownBy(() -> client.fixtures(9001, 2024))
                .satisfies(failure -> {
                    assertThat(failure.kind()).isEqualTo(kind);
                    assertThat(failure.httpStatus()).isEqualTo(status);
                    assertThat(failure.quota()).isEqualTo(new ApiFootballResponse.Quota(100, 98, 10, 8));
                    assertThat(failure.getMessage()).doesNotContain(KEY, "response", "unexpected");
                    assertThat(failure.getCause()).isNull();
                });
    }

    private record Request(String method, String uri, String key) {}
}
