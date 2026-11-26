package pl.lmuml.football.apifootball;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.util.stream.Stream;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;
import pl.lmuml.football.matches.MatchEventKind;
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

class ApiFootballFixtureDetailsProbeTest {

    private static final String FIXTURE = """
            {"fixture":{"id":7001},"teams":{"home":{"id":201},"away":{"id":202}}%s}
            """;
    private static final String ALL_SECTIONS = """
            ,"events":[{"time":{"elapsed":36},"team":{"id":202},"type":"Goal","detail":"Normal Goal",
                        "player":{"id":21,"name":"Żaneta"}}],
            "lineups":[
              {"team":{"id":202},"startXI":[{"player":{"id":21,"name":"Żaneta","pos":"F"}}]},
              {"team":{"id":201},"startXI":[{"player":{"id":31,"name":"Jo"}}]}],
            "statistics":[
              {"team":{"id":202},"statistics":[{"type":"Total Shots","value":9}]},
              {"team":{"id":201},"statistics":[{"type":"Total Shots","value":0}]}],
            "players":[
              {"team":{"id":202},"players":[{"player":{"id":21,"name":"Żaneta"},
                "statistics":[{"games":{"minutes":90}}]}]},
              {"team":{"id":201},"players":[{"player":{"id":31,"name":"Jo"},
                "statistics":[{"games":{"minutes":80}}]}]}]
            """;
    private static final String BASE_URL = "https://fixture-provider.example";
    private static final Instant CAPTURED_AT = Instant.parse("2026-11-24T10:00:00Z");

    @TempDir
    Path temporary;

    private final JsonMapper json = JsonMapper.builder().build();
    private final ApiFootballSampleReader reader = new ApiFootballSampleReader(json);

    @Test
    void probeRunnerCapturesOneRequestAndPreservesRawBytesAndAllSections() {
        byte[] body = envelope(FIXTURE.formatted(ALL_SECTIONS)).getBytes(UTF_8);
        RestClient.Builder http = RestClient.builder().baseUrl(BASE_URL);
        var provider = MockRestServiceServer.bindTo(http).build();
        provider.expect(once(), requestTo(BASE_URL + "/fixtures?id=7001"))
                .andExpect(method(GET)).andRespond(withSuccess(body, APPLICATION_JSON));

        new ApplicationContextRunner()
                .withUserConfiguration(ApiFootballProbeConfiguration.class)
                .withBean(ApiFootballClient.class, () -> new ApiFootballClient(http.build(), json))
                .withBean(JsonMapper.class, () -> json)
                .withPropertyValues(
                        "spring.profiles.active=api-football-probe",
                        "lmuml.api-football.probe.fixture-id=7001",
                        "lmuml.api-football.probe.fixture-details=true",
                        "lmuml.api-football.probe.samples-root=" + temporary)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    context.getBean(ApplicationRunner.class).run(new DefaultApplicationArguments());
                    provider.verify();

                    try (var samples = Files.list(temporary)) {
                        assertThat(samples.toList()).singleElement().satisfies(directory -> {
                            assertThat(directory.resolve("details.json")).hasBinaryContent(body);
                            assertThat(directory.resolve("details.metadata.json")).isRegularFile();
                            assertPopulatedDetails(reader.readFixtureDetails(directory));
                        });
                    }
                });
    }

    @Test
    void readsMissingNullAndEmptySectionsAsUnavailableWithoutDroppingAvailableData() throws IOException {
        saveSample(envelope(FIXTURE.formatted("""
                ,"lineups":null,"statistics":[],
                "events":[{"time":{"elapsed":36},"type":"Var","detail":"Goal cancelled"}]
                """)));
        var sample = reader.readFixtureDetails(temporary);

        assertThat(sample.events()).hasValueSatisfying(events -> {
            assertThat(events.capturedAt()).isEqualTo(CAPTURED_AT);
            assertThat(events.events()).singleElement()
                    .satisfies(event -> assertThat(event.kind()).isEqualTo(MatchEventKind.GOAL_CANCELLED));
        });
        assertThat(sample.lineups()).isEmpty();
        assertThat(sample.statistics()).isEmpty();
        assertThat(sample.players()).isEmpty();
    }

    @ParameterizedTest
    @ValueSource(longs = {0, -1})
    void rejectsANonpositiveRequestedFixtureBeforeCallingTheProvider(long fixtureId) {
        RestClient.Builder http = RestClient.builder().baseUrl(BASE_URL);
        var provider = MockRestServiceServer.bindTo(http).build();
        var probe = new ApiFootballProbe(new ApiFootballClient(http.build(), json), json,
                temporary.resolve("samples"), () -> {});

        assertThatThrownBy(() -> probe.captureFixtureDetails(fixtureId))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("positive fixture ID");
        assertThat(temporary.resolve("samples")).doesNotExist();
        provider.verify();
    }

    @ParameterizedTest(name = "{0}")
    @MethodSource("invalidSamples")
    void rejectsInvalidFixtureDetailsFromAnOfflineSample(String description, String body) throws IOException {
        saveSample(body);

        assertThatThrownBy(() -> reader.readFixtureDetails(temporary))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("Fixture details sample JSON/metadata files are missing, incomplete or invalid.");
    }

    private static Stream<Arguments> invalidSamples() {
        String fixture = FIXTURE.formatted("");
        return Stream.of(
                Arguments.of("wrong request parameter", envelope(fixture).replace("\"id\":\"7001\"", "\"fixture\":\"7001\"")),
                Arguments.of("wrong fixture in response", envelope(fixture.replace("7001", "7002"))),
                Arguments.of("duplicate fixture teams", envelope(fixture.replace("202", "201"))),
                Arguments.of("invalid away team ID", envelope(fixture.replace("202", "0"))),
                Arguments.of("event for an unrelated team", envelope(FIXTURE.formatted("""
                        ,"events":[{"time":{"elapsed":1},"team":{"id":999},"type":"Goal"}]
                        """))),
                Arguments.of("lineup for an unrelated team", envelope(FIXTURE.formatted(
                        ALL_SECTIONS.replace("\"id\":202},\"startXI\"", "\"id\":999},\"startXI\"")))),
                Arguments.of("malformed section object", envelope(FIXTURE.formatted(",\"players\":{}"))),
                Arguments.of("malformed entry in a section", envelope(FIXTURE.formatted(",\"events\":[{}]"))));
    }

    private static void assertPopulatedDetails(ApiFootballFixtureDetailsSample sample) {
        assertThat(sample.fixtureId()).isEqualTo(7001);
        assertThat(sample.homeTeamId()).isEqualTo(201);
        assertThat(sample.awayTeamId()).isEqualTo(202);
        assertThat(sample.events()).hasValueSatisfying(events -> assertThat(events.events()).containsExactly(
                new ApiFootballFixtureEventsSample.Event(36, null, 202L, MatchEventKind.GOAL, "Żaneta", null, 21L, null)));
        assertThat(sample.lineups()).hasValueSatisfying(lineups -> assertThat(lineups.teams())
                .extracting(team -> team.starters().getFirst().name()).containsExactly("Żaneta", "Jo"));
        assertThat(sample.statistics()).hasValueSatisfying(statistics -> assertThat(statistics.teams())
                .extracting(team -> team.statistics().shotsTotal()).containsExactly(9, 0));
        assertThat(sample.players()).hasValueSatisfying(players -> assertThat(players.teams())
                .extracting(team -> team.players().getFirst().statistics().minutes()).containsExactly(90, 80));
    }

    private void saveSample(String body) throws IOException {
        Files.writeString(temporary.resolve("details.json"), body);
        Files.writeString(temporary.resolve("details.metadata.json"), """
                {"capturedAt":"%s","fixtureId":7001,"results":1,"paging":{"current":1,"total":1}}
                """.formatted(CAPTURED_AT));
    }

    private static String envelope(String fixture) {
        return """
                {"get":"fixtures","parameters":{"id":"7001"},"errors":[],"results":1,
                 "paging":{"current":1,"total":1},"response":[%s]}
                """.formatted(fixture);
    }
}
