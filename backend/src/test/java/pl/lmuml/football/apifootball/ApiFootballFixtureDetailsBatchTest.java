package pl.lmuml.football.apifootball;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.stream.LongStream;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

import static java.nio.charset.StandardCharsets.UTF_8;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.http.HttpMethod.GET;
import static org.springframework.http.MediaType.APPLICATION_JSON;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

class ApiFootballFixtureDetailsBatchTest {

    private static final String BASE_URL = "https://fixture-provider.example";
    private static final String REQUESTED_IDS = "7001-7002";
    private static final String FIRST = fixture(7001, 201, 202);
    private static final String SECOND = fixture(7002, 203, 204);

    @TempDir
    Path temporary;

    private final JsonMapper json = JsonMapper.builder().build();
    private final ApiFootballSampleReader reader = new ApiFootballSampleReader(json);

    @Test
    void capturesOneRequestAndReadsEverySectionForBothFixtures() {
        byte[] body = envelope(REQUESTED_IDS, SECOND, FIRST).getBytes(UTF_8);
        RestClient.Builder http = RestClient.builder().baseUrl(BASE_URL);
        var provider = MockRestServiceServer.bindTo(http).build();
        provider.expect(once(), requestTo(BASE_URL + "/fixtures?ids=" + REQUESTED_IDS))
                .andExpect(method(GET)).andRespond(withSuccess(body, APPLICATION_JSON));

        new ApplicationContextRunner()
                .withUserConfiguration(ApiFootballProbeConfiguration.class)
                .withBean(ApiFootballClient.class, () -> new ApiFootballClient(http.build(), json))
                .withBean(JsonMapper.class, () -> json)
                .withPropertyValues(
                        "spring.profiles.active=api-football-probe",
                        "lmuml.api-football.probe.fixture-ids=7001,7002",
                        "lmuml.api-football.probe.fixture-details=true",
                        "lmuml.api-football.probe.samples-root=" + temporary)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    context.getBean(ApplicationRunner.class).run(new DefaultApplicationArguments());
                    provider.verify();

                    try (var directories = Files.list(temporary)) {
                        assertThat(directories.toList()).singleElement().satisfies(directory -> {
                            assertThat(directory.resolve("details.json")).hasBinaryContent(body);
                            var metadata = json.readTree(Files.readAllBytes(directory.resolve("details.metadata.json")));
                            assertThat(metadata.path("fixtureIds").toString()).isEqualTo("[7001,7002]");
                            assertThat(metadata.has("fixtureId")).isFalse();
                            Instant capturedAt = Instant.parse(metadata.path("capturedAt").asString())
                                    .truncatedTo(ChronoUnit.MICROS);
                            var samples = reader.readFixtureDetailsBatch(directory);
                            assertThat(samples).extracting(ApiFootballFixtureDetailsSample::fixtureId)
                                    .containsExactlyInAnyOrder(7001L, 7002L);
                            assertThat(samples).allSatisfy(sample -> {
                                assertThat(sample.events()).hasValueSatisfying(events -> {
                                    assertThat(events.capturedAt()).isEqualTo(capturedAt);
                                    assertThat(events.events()).singleElement().satisfies(event ->
                                            assertThat(event.providerTeamId()).isEqualTo(sample.homeTeamId()));
                                });
                                assertThat(sample.lineups()).hasValueSatisfying(lineups ->
                                        assertThat(lineups.teams()).extracting(team -> team.teamId())
                                                .containsExactly(sample.homeTeamId(), sample.awayTeamId()));
                                assertThat(sample.statistics()).hasValueSatisfying(statistics ->
                                        assertThat(statistics.teams()).extracting(team -> team.statistics().shotsTotal())
                                                .containsExactly(2, 8));
                                assertThat(sample.players()).hasValueSatisfying(players ->
                                        assertThat(players.teams()).extracting(team -> team.teamId())
                                                .containsExactly(sample.homeTeamId(), sample.awayTeamId()));
                            });
                        });
                    }
                });
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidBatches")
    void rejectsABatchThatDoesNotMatchItsRequestedFixtureIds(String description, String body) throws IOException {
        var payload = json.readTree(body);
        Files.writeString(temporary.resolve("details.json"), body);
        Files.writeString(temporary.resolve("details.metadata.json"), """
                {"capturedAt":"2026-11-24T10:00:00Z","fixtureIds":[7001,7002],"results":%s,"paging":%s}
                """.formatted(payload.path("results"), payload.path("paging")));

        assertThatThrownBy(() -> reader.readFixtureDetailsBatch(temporary))
                .isInstanceOf(IllegalArgumentException.class);
    }

    private static Stream<Arguments> invalidBatches() {
        return Stream.of(
                Arguments.of("missing fixture", envelope(REQUESTED_IDS, FIRST)),
                Arguments.of("duplicate fixture", envelope(REQUESTED_IDS, FIRST, FIRST)),
                Arguments.of("unexpected fixture", envelope(REQUESTED_IDS, FIRST, fixture(7003, 205, 206))),
                Arguments.of("wrong echoed IDs", envelope("7001-7003", FIRST, SECOND)),
                Arguments.of("incomplete page", envelope(REQUESTED_IDS, FIRST, SECOND).replace("\"total\":1", "\"total\":2")));
    }

    @ParameterizedTest
    @MethodSource("invalidRequestedIds")
    void rejectsInvalidRequestsBeforeCreatingSamplesOrCallingTheProvider(List<Long> fixtureIds) {
        RestClient.Builder http = RestClient.builder().baseUrl(BASE_URL);
        var provider = MockRestServiceServer.bindTo(http).build();
        Path samples = temporary.resolve("samples");
        var probe = new ApiFootballProbe(new ApiFootballClient(http.build(), json), json, samples, () -> {});

        assertThatThrownBy(() -> probe.captureFixtureDetails(fixtureIds)).isInstanceOf(IllegalArgumentException.class);
        assertThat(samples).doesNotExist();
        provider.verify();
    }

    private static Stream<List<Long>> invalidRequestedIds() {
        return Stream.of(List.of(7001L), List.of(7001L, 7001L), List.of(7001L, 0L),
                LongStream.rangeClosed(1, 21).boxed().toList());
    }

    @Test
    void planErrorDoesNotFallBackToAdditionalRequests() {
        String body = envelope(REQUESTED_IDS).replace("\"errors\":[]", "\"errors\":{\"plan\":\"private response\"}");
        RestClient.Builder http = RestClient.builder().baseUrl(BASE_URL);
        var provider = MockRestServiceServer.bindTo(http).build();
        provider.expect(once(), requestTo(BASE_URL + "/fixtures?ids=" + REQUESTED_IDS))
                .andRespond(withSuccess(body, APPLICATION_JSON));
        var probe = new ApiFootballProbe(new ApiFootballClient(http.build(), json), json, temporary, () -> {});

        assertThatThrownBy(() -> probe.captureFixtureDetails(List.of(7001L, 7002L)))
                .isInstanceOf(ApiFootballException.class)
                .hasMessageNotContaining("private response");
        provider.verify();
    }

    private static String envelope(String requestedIds, String... fixtures) {
        return """
                {"get":"fixtures","parameters":{"ids":"%s"},"errors":[],"results":%d,
                 "paging":{"current":1,"total":1},"response":[%s]}
                """.formatted(requestedIds, fixtures.length, String.join(",", fixtures));
    }

    private static String fixture(long fixtureId, long homeTeamId, long awayTeamId) {
        return """
                {"fixture":{"id":%1$d},"teams":{"home":{"id":%2$d},"away":{"id":%3$d}},
                 "events":[{"time":{"elapsed":36},"team":{"id":%2$d},"type":"Goal","detail":"Normal Goal"}],
                 "lineups":[
                   {"team":{"id":%2$d},"startXI":[{"player":{"id":21,"name":"Żaneta"}}]},
                   {"team":{"id":%3$d},"startXI":[{"player":{"id":31,"name":"Jo"}}]}],
                 "statistics":[
                   {"team":{"id":%2$d},"statistics":[{"type":"Total Shots","value":2}]},
                   {"team":{"id":%3$d},"statistics":[{"type":"Total Shots","value":8}]}],
                 "players":[
                   {"team":{"id":%2$d},"players":[{"player":{"id":21,"name":"Żaneta"},
                     "statistics":[{"games":{"minutes":90}}]}]},
                   {"team":{"id":%3$d},"players":[{"player":{"id":31,"name":"Jo"},
                     "statistics":[{"games":{"minutes":80}}]}]}]}
                """.formatted(fixtureId, homeTeamId, awayTeamId);
    }
}
