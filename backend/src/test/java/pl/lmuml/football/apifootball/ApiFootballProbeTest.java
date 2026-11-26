package pl.lmuml.football.apifootball;

import com.sun.net.httpserver.HttpServer;
import java.io.IOException;
import java.math.BigDecimal;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.DefaultApplicationArguments;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.web.client.RestClient;
import pl.lmuml.football.apifootball.ApiFootballFixtureLineupsSample.Player;
import pl.lmuml.football.apifootball.ApiFootballFixtureLineupsSample.TeamLineup;
import pl.lmuml.football.matches.MatchLineupPosition;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static pl.lmuml.football.matches.MatchEventKind.*;

class ApiFootballProbeTest {

    private static final String LEAGUES = envelope("leagues", """
            [{"league":{"id":9001},"seasons":[{"year":2026}],"unknown_field":"Zażółć"}]
            """);
    private static final String FIXTURES = envelope("fixtures", """
            [{"fixture":{"id":7001},"league":{"id":9001,"season":2026},"unknown_field":true}]
            """);
    private static final String STANDINGS = envelope("standings", """
            [{"league":{"id":9001,"season":2026,"standings":[[{"rank":1}]]},"unknown_field":true}]
            """).replace("\"errors\"", "\"parameters\":{\"league\":\"9001\",\"season\":\"2026\"},\"errors\"");
    private static final String STATISTICS = envelope("fixtures/statistics", """
            [
              {"team":{"id":202},"statistics":[
                {"type":"Total Shots","value":0},{"type":"Ball Possession","value":"42.5%"},
                {"type":"Fouls","value":null},{"type":"Future metric","value":{"extra":true}}]},
              {"team":{"id":201},"statistics":[
                {"type":"Total Shots","value":9},{"type":"Ball Possession","value":"57.5%"},
                {"type":"Shots on Goal","value":4},{"type":"Corner Kicks","value":3},
                {"type":"Fouls","value":12},{"type":"Goalkeeper Saves","value":5}]}
            ]
            """).replace("\"errors\"", "\"parameters\":{\"fixture\":\"7001\"},\"errors\"");
    private static final String EVENTS = fixtureEvents("""
            [
              {"time":{"elapsed":90,"extra":3},"team":{"id":202},"type":"Card","detail":"Yellow-Red Card"},
              {"time":{"elapsed":90,"extra":1},"team":{"id":201},"type":"subst","detail":"Substitution 4",
               "player":{"id":12,"name":"  Żó\\tłć  "},"assist":{"id":13,"name":"Nowak"}},
              {"time":{"elapsed":61},"type":"Var","detail":"Goal cancelled","comments":"Raw notes"},
              {"time":{"elapsed":90,"extra":1},"team":{"id":201},"type":"Goal","detail":"Normal Goal",
               "player":{"id":0,"name":"Kowalski"},"assist":{"id":13,"name":"Nowak"}},
              {"time":{"elapsed":120},"type":"Future event","detail":"Future detail"}
            ]
            """);
    private static final String LINEUPS = envelope("fixtures/lineups", """
            [
              {"team":{"id":202},"coach":{"name":"  Simone Inzaghi  "},"formation":" 3-5-2 ",
               "startXI":[{"player":{"id":20,"name":"Defender","number":31,"pos":"D","grid":"2:1"}},
                          {"player":{"id":21,"name":" Yann Sommer ","number":1,"pos":"G","grid":"1:1"}}],
               "substitutes":[{"player":{"id":-1,"name":"  Coach\\t's Pick  ","pos":"future","grid":"2:0"}},
                              {"player":{"name":"  "}}]},
              {"team":{"id":201},"startXI":[{"player":{"id":31,"name":"Désiré Doué","number":14,"pos":"F","grid":"3:2"}}]}
            ]
            """).replace("\"errors\"", "\"parameters\":{\"fixture\":\"7001\"},\"errors\"");
    private static final String PLAYERS = envelope("fixtures/players", """
            [
              {"team":{"id":202},"players":[
                {"player":{"id":21,"name":"  Yann\\t Sommer  "},"statistics":[
                  {"games":{"minutes":90,"number":1,"position":"G","rating":"6.90"},
                   "goals":{"saves":3},"passes":{"total":33,"key":0}}]},
                {"player":{"id":22,"name":"Unused player"},"statistics":[{}]}]},
              {"team":{"id":201},"players":[
                {"player":{"id":31,"name":"Désiré Doué"},"statistics":[
                  {"games":{"minutes":66,"number":14,"position":"F","rating":9.20},
                   "shots":{"total":3,"on":2},"goals":{"total":2,"assists":1},
                   "passes":{"total":25,"key":2},"tackles":{"total":1},"unmapped":{"a":true}}]}]}
            ]
            """).replace("\"errors\"", "\"parameters\":{\"fixture\":\"7001\"},\"errors\"");

    @TempDir
    Path temporary;
    private HttpServer server;
    private HttpClient transport;
    private ApiFootballClient client;
    private final List<String> calls = new CopyOnWriteArrayList<>();
    private volatile String fixtureQuery;
    private String leaguesBody = LEAGUES;
    private String fixturesBody = FIXTURES;
    private String eventsBody = EVENTS;
    private String remaining = "98";
    private String minuteRemaining = "8";

    @BeforeEach
    void startServer() throws IOException {
        server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", exchange -> {
            String path = exchange.getRequestURI().getPath();
            calls.add(path);
            String query = exchange.getRequestURI().getRawQuery();
            if (query != null && query.startsWith("fixture=")) {
                fixtureQuery = query;
            }
            exchange.getResponseHeaders().add("Content-Type", "application/json");
            exchange.getResponseHeaders().add("x-ratelimit-requests-remaining", remaining);
            exchange.getResponseHeaders().add("x-ratelimit-remaining", minuteRemaining);
            byte[] body = switch (path) {
                case "/leagues" -> leaguesBody.getBytes(StandardCharsets.UTF_8);
                case "/standings" -> STANDINGS.getBytes(StandardCharsets.UTF_8);
                case "/fixtures/statistics" -> STATISTICS.getBytes(StandardCharsets.UTF_8);
                case "/fixtures/events" -> eventsBody.getBytes(StandardCharsets.UTF_8);
                case "/fixtures/lineups" -> LINEUPS.getBytes(StandardCharsets.UTF_8);
                case "/fixtures/players" -> PLAYERS.getBytes(StandardCharsets.UTF_8);
                default -> fixturesBody.getBytes(StandardCharsets.UTF_8);
            };
            exchange.sendResponseHeaders(200, body.length);
            exchange.getResponseBody().write(body);
            exchange.close();
        });
        server.start();
        transport = new ApiFootballConfiguration().apiFootballTransport();
        client = new ApiFootballClient(RestClient.builder()
                .baseUrl("http://127.0.0.1:" + server.getAddress().getPort())
                .requestFactory(ApiFootballConfiguration.requestFactory(transport, Duration.ofSeconds(3)))
                .build(), JsonMapper.builder().build());
    }

    @Test
    void standingsModeCapturesOnlyTheRequestedTableAndProducesAnOfflineSample() throws Exception {
        Path directory = probe(() -> {}).captureStandings(9001, 2026);

        assertThat(calls).containsExactly("/standings");
        assertThat(Files.readString(directory.resolve("standings.json"))).isEqualTo(STANDINGS);
        var snapshot = new ApiFootballSampleReader(JsonMapper.builder().build()).readStandings(directory);
        assertThat(snapshot.endpoint()).isEqualTo(ApiFootballSnapshot.Endpoint.STANDINGS);
        assertThat(snapshot.leagueId()).isEqualTo(9001);
        assertThat(snapshot.season()).isEqualTo(2026);
    }

    @Test
    void probeRunnerSavesStandingsUnderTheConfiguredDirectory() {
        Path samplesRoot = temporary.resolve("synchronization run");
        new ApplicationContextRunner()
                .withUserConfiguration(ApiFootballProbeConfiguration.class)
                .withBean(ApiFootballClient.class, () -> client)
                .withBean(JsonMapper.class, () -> JsonMapper.builder().build())
                .withPropertyValues(
                        "spring.profiles.active=api-football-probe",
                        "lmuml.api-football.probe.league-id=9001",
                        "lmuml.api-football.probe.season=2026",
                        "lmuml.api-football.probe.standings=true",
                        "lmuml.api-football.probe.samples-root=" + samplesRoot)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    context.getBean(ApplicationRunner.class).run(new DefaultApplicationArguments());

                    assertThat(calls).containsExactly("/standings");
                    try (var directories = Files.list(samplesRoot)) {
                        assertThat(directories.toList()).singleElement().satisfies(directory -> {
                            assertThat(Files.readString(directory.resolve("standings.json"))).isEqualTo(STANDINGS);
                            assertThat(directory.resolve("standings.metadata.json")).isRegularFile();
                        });
                    }
                });
    }

    @Test
    void probeRunnerCapturesOneFixtureAndPreservesItsTypedStatisticsAndRawSample() {
        Path samplesRoot = temporary.resolve("samples");
        var json = JsonMapper.builder().build();
        new ApplicationContextRunner()
                .withUserConfiguration(ApiFootballProbeConfiguration.class)
                .withBean(ApiFootballClient.class, () -> client)
                .withBean(JsonMapper.class, () -> json)
                .withPropertyValues(
                        "spring.profiles.active=api-football-probe",
                        "lmuml.api-football.probe.fixture-id=7001",
                        "lmuml.api-football.probe.samples-root=" + samplesRoot)
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    context.getBean(ApplicationRunner.class).run(new DefaultApplicationArguments());

                    assertThat(calls).containsExactly("/fixtures/statistics");
                    assertThat(fixtureQuery).isEqualTo("fixture=7001");
                    Path directory = onlySampleDirectory();
                    assertThat(Files.readString(directory.resolve("statistics.json"))).isEqualTo(STATISTICS);
                    var sample = new ApiFootballSampleReader(json).readFixtureStatistics(directory);
                    assertThat(sample.fixtureId()).isEqualTo(7001);
                    assertThat(sample.teams()).containsExactly(
                            new ApiFootballFixtureStatisticsSample.TeamStatistics(202,
                                    new ApiFootballFixtureStatisticsSample.Statistics(0, null,
                                            new BigDecimal("42.50"), null, null, null)),
                            new ApiFootballFixtureStatisticsSample.TeamStatistics(201,
                                    new ApiFootballFixtureStatisticsSample.Statistics(9, 4,
                                            new BigDecimal("57.50"), 3, 12, 5)));
                });
    }

    @Test
    void probeRunnerCapturesOneTimelineWithStableChronologicalOrderAndRawSample() {
        var json = JsonMapper.builder().build();
        new ApplicationContextRunner()
                .withUserConfiguration(ApiFootballProbeConfiguration.class)
                .withBean(ApiFootballClient.class, () -> client)
                .withBean(JsonMapper.class, () -> json)
                .withPropertyValues(
                        "spring.profiles.active=api-football-probe",
                        "lmuml.api-football.probe.fixture-id=7001",
                        "lmuml.api-football.probe.fixture-events=true",
                        "lmuml.api-football.probe.samples-root=" + temporary.resolve("samples"))
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    context.getBean(ApplicationRunner.class).run(new DefaultApplicationArguments());

                    assertThat(calls).containsExactly("/fixtures/events");
                    assertThat(fixtureQuery).isEqualTo("fixture=7001");
                    Path directory = onlySampleDirectory();
                    assertThat(Files.readString(directory.resolve("events.json"))).isEqualTo(EVENTS);
                    var sample = new ApiFootballSampleReader(json).readFixtureEvents(directory);
                    assertThat(sample.fixtureId()).isEqualTo(7001);
                    assertThat(sample.events()).containsExactly(
                            new ApiFootballFixtureEventsSample.Event(61, null, null, GOAL_CANCELLED, null, null, null, null),
                            new ApiFootballFixtureEventsSample.Event(90, 1, 201L, SUBSTITUTION, "Żółć", "Nowak", 12L, 13L),
                            new ApiFootballFixtureEventsSample.Event(90, 1, 201L, GOAL, "Kowalski", "Nowak", null, 13L),
                            new ApiFootballFixtureEventsSample.Event(90, 3, 202L, SECOND_YELLOW_CARD, null, null, null, null),
                            new ApiFootballFixtureEventsSample.Event(120, null, null, UNKNOWN, null, null, null, null));
                });
    }

    @Test
    void acceptsAnEmptyTimelineAndRejectsWrongFixtureOrInvalidEventTimes() throws Exception {
        eventsBody = fixtureEvents("[]");
        var reader = new ApiFootballSampleReader(JsonMapper.builder().build());
        assertThat(reader.readFixtureEvents(probe(() -> {}).captureFixtureEvents(7001)).events()).isEmpty();

        eventsBody = EVENTS;
        Path directory = probe(() -> {}).captureFixtureEvents(7001);
        for (String invalid : List.of(
                EVENTS.replace("\"fixture\":7001", "\"fixture\":7002"),
                EVENTS.replace("\"elapsed\":61", "\"elapsed\":-1"),
                EVENTS.replace("\"elapsed\":61", "\"elapsed\":\"61\""),
                EVENTS.replace("\"extra\":3", "\"extra\":-1"),
                EVENTS.replace("\"id\":201", "\"id\":0"))) {
            Files.writeString(directory.resolve("events.json"), invalid);
            assertThatThrownBy(() -> reader.readFixtureEvents(directory))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Fixture events sample");
        }
    }

    @Test
    void probeRunnerCapturesOnlyLineupsAndPreservesStarterOrderAndRawData() {
        var json = JsonMapper.builder().build();
        new ApplicationContextRunner()
                .withUserConfiguration(ApiFootballProbeConfiguration.class)
                .withBean(ApiFootballClient.class, () -> client)
                .withBean(JsonMapper.class, () -> json)
                .withPropertyValues(
                        "spring.profiles.active=api-football-probe",
                        "lmuml.api-football.probe.fixture-id=7001",
                        "lmuml.api-football.probe.fixture-lineups=true",
                        "lmuml.api-football.probe.samples-root=" + temporary.resolve("samples"))
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    context.getBean(ApplicationRunner.class).run(new DefaultApplicationArguments());

                    assertThat(calls).containsExactly("/fixtures/lineups");
                    assertThat(fixtureQuery).isEqualTo("fixture=7001");
                    Path directory = onlySampleDirectory();
                    assertThat(Files.readString(directory.resolve("lineups.json"))).isEqualTo(LINEUPS);
                    var sample = new ApiFootballSampleReader(json).readFixtureLineups(directory);
                    assertThat(sample.fixtureId()).isEqualTo(7001);
                    assertThat(sample.teams()).containsExactly(
                            new TeamLineup(202L, "3-5-2", "Simone Inzaghi", List.of(
                                    new Player("Defender", 31, MatchLineupPosition.DEFENDER, 2, 1, 20L),
                                    new Player("Yann Sommer", 1, MatchLineupPosition.GOALKEEPER, 1, 1, 21L)),
                                    List.of(new Player("Coach's Pick", null, MatchLineupPosition.UNKNOWN, null, null, null))),
                            new TeamLineup(201L, null, null, List.of(
                                    new Player("Désiré Doué", 14, MatchLineupPosition.FORWARD, 3, 2, 31L)), List.of()));
                });
    }

    @Test
    void rejectsIncompleteAndOutOfScopeLineupSamples() throws Exception {
        Path directory = probe(() -> {}).captureFixtureLineups(7001);
        var reader = new ApiFootballSampleReader(JsonMapper.builder().build());
        for (String invalid : List.of(
                LINEUPS.replace("\"fixture\":\"7001\"", "\"fixture\":\"7002\""),
                LINEUPS.replace("\"id\":201", "\"id\":202"),
                LINEUPS.replace("\"name\":\"Désiré Doué\"", "\"name\":null"),
                LINEUPS.replace("\"number\":31", "\"number\":\"31\""),
                LINEUPS.replace("\"number\":31", "\"number\":-1"))) {
            Files.writeString(directory.resolve("lineups.json"), invalid);
            assertThatThrownBy(() -> reader.readFixtureLineups(directory))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Fixture lineups sample");
        }
    }

    @Test
    void probeRunnerCapturesOnlyPlayerStatisticsAndPreservesMeasuredAndUnknownValues() {
        var json = JsonMapper.builder().build();
        new ApplicationContextRunner()
                .withUserConfiguration(ApiFootballProbeConfiguration.class)
                .withBean(ApiFootballClient.class, () -> client)
                .withBean(JsonMapper.class, () -> json)
                .withPropertyValues(
                        "spring.profiles.active=api-football-probe",
                        "lmuml.api-football.probe.fixture-id=7001",
                        "lmuml.api-football.probe.fixture-players=true",
                        "lmuml.api-football.probe.samples-root=" + temporary.resolve("samples"))
                .run(context -> {
                    assertThat(context).hasNotFailed();
                    context.getBean(ApplicationRunner.class).run(new DefaultApplicationArguments());

                    assertThat(calls).containsExactly("/fixtures/players");
                    assertThat(fixtureQuery).isEqualTo("fixture=7001");
                    Path directory = onlySampleDirectory();
                    assertThat(Files.readString(directory.resolve("players.json"))).isEqualTo(PLAYERS);
                    var sample = new ApiFootballSampleReader(json).readFixturePlayers(directory);
                    assertThat(sample.fixtureId()).isEqualTo(7001);
                    var visitor = sample.teams().getFirst();
                    var home = sample.teams().getLast();
                    assertThat(visitor.teamId()).isEqualTo(202);
                    assertThat(visitor.players()).extracting(ApiFootballFixturePlayersSample.Player::name)
                            .containsExactly("Yann Sommer", "Unused player");
                    var keeper = visitor.players().getFirst();
                    assertThat(keeper.id()).isEqualTo(21);
                    assertThat(keeper.position()).isEqualTo(MatchLineupPosition.GOALKEEPER);
                    assertThat(keeper.statistics()).isEqualTo(new ApiFootballFixturePlayersSample.Statistics(
                            90, new BigDecimal("6.90"), null, null, null, null, 33, 0, null, 3));
                    assertThat(visitor.players().getLast().statistics().measured()).isFalse();
                    assertThat(home.players().getFirst().statistics()).isEqualTo(new ApiFootballFixturePlayersSample.Statistics(
                            66, new BigDecimal("9.20"), 2, 1, 3, 2, 25, 2, 1, null));
                });
    }

    @Test
    void rejectsAmbiguousPlayersOutOfScopeAndMalformedStatistics() throws Exception {
        Path directory = probe(() -> {}).captureFixturePlayers(7001);
        var reader = new ApiFootballSampleReader(JsonMapper.builder().build());
        for (String invalid : List.of(
                PLAYERS.replace("\"fixture\":\"7001\"", "\"fixture\":\"7002\""),
                PLAYERS.replace("\"id\":21,", "\"id\":22,"),
                PLAYERS.replace("\"statistics\":[{}]", "\"statistics\":[{},{}]"),
                PLAYERS.replace("\"minutes\":90", "\"minutes\":\"90\""),
                PLAYERS.replace("\"minutes\":90", "\"minutes\":-1"),
                PLAYERS.replace("\"rating\":\"6.90\"", "\"rating\":9.999"),
                PLAYERS.replace("\"rating\":\"6.90\"", "\"rating\":\"10.01\""))) {
            Files.writeString(directory.resolve("players.json"), invalid);
            assertThatThrownBy(() -> reader.readFixturePlayers(directory))
                    .isInstanceOf(IllegalArgumentException.class)
                    .hasMessageContaining("Fixture player sample");
        }
    }

    @Test
    void rejectsOutOfScopeIncompleteAndInvalidRecordedStatistics() throws Exception {
        Path directory = probe(() -> {}).captureFixtureStatistics(7001);
        Path response = directory.resolve("statistics.json");
        var reader = new ApiFootballSampleReader(JsonMapper.builder().build());

        for (String invalid : List.of(
                STATISTICS.replace("\"fixture\":\"7001\"", "\"fixture\":\"7002\""),
                STATISTICS.replace("\"total\":1", "\"total\":2"),
                STATISTICS.replace("\"id\":201", "\"id\":202"),
                STATISTICS.replace("42.5%", "142.5%"),
                STATISTICS.replace("\"value\":0", "\"value\":-1"),
                STATISTICS.replace("\"errors\":[]", "\"errors\":{\"quota\":\"exhausted\"}"),
                STATISTICS.replace("\"value\":0", "\"value\":null").replace("\"42.5%\"", "null"))) {
            Files.writeString(response, invalid);
            assertThatThrownBy(() -> reader.readFixtureStatistics(directory))
                    .isInstanceOf(IllegalArgumentException.class);
        }
    }

    @AfterEach
    void stopServer() {
        server.stop(0);
        transport.close();
    }

    @Test
    void savesOriginalBytesAndMetadataWithExactlyTwoOrderedRequests() throws Exception {
        ApiFootballProbe probe = probe(() -> assertThat(calls).containsExactly("/leagues"));
        Path directory = probe.capture(9001, 2026);

        assertThat(calls).containsExactly("/leagues", "/fixtures");
        assertThat(Files.readAllBytes(directory.resolve("leagues.json"))).isEqualTo(LEAGUES.getBytes(StandardCharsets.UTF_8));
        assertThat(Files.readAllBytes(directory.resolve("fixtures.json"))).isEqualTo(FIXTURES.getBytes(StandardCharsets.UTF_8));
        var json = JsonMapper.builder().build();
        var metadata = json.readTree(Files.readAllBytes(directory.resolve("fixtures.metadata.json")));
        assertThat(metadata.get("quota").get("dailyRemaining").asInt()).isEqualTo(98);
        assertThat(metadata.get("season").asInt()).isEqualTo(2026);
        var summary = json.readTree(Files.readAllBytes(directory.resolve("summary.json")));
        assertThat(summary.get("decodedFixtures").asInt()).isEqualTo(1);
        assertThat(Files.readString(directory.resolve("leagues.json"))).contains("unknown_field", "Zażółć");
    }

    @Test
    void preservesLeagueSampleWhenDtoDoesNotMatchAndSkipsFixtures() throws IOException {
        leaguesBody = LEAGUES.replace("\"year\":2026", "\"year\":\"unexpected\"");
        assertThatThrownBy(() -> probe(() -> {}).capture(9001, 2026)).isInstanceOf(ApiFootballException.class);
        assertThat(calls).containsExactly("/leagues");
        Path directory = onlySampleDirectory();
        assertThat(Files.readString(directory.resolve("leagues.json"))).isEqualTo(leaguesBody);
        assertThat(directory.resolve("fixtures.json")).doesNotExist();
        assertThat(directory.resolve("summary.json")).doesNotExist();
    }

    @ParameterizedTest
    @ValueSource(strings = {"[]", "[{\"league\":{\"id\":9001},\"seasons\":[{\"year\":2025}]}]",
            "[{\"league\":{\"id\":9002},\"seasons\":[{\"year\":2026}]}]"})
    void doesNotTryOtherSeasonsWhenRequestedSeasonIsAbsent(String response) {
        leaguesBody = envelope("leagues", response);
        assertThatThrownBy(() -> probe(() -> {}).capture(9001, 2026))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("absent");
        assertThat(calls).containsExactly("/leagues");
    }

    @ParameterizedTest
    @ValueSource(booleans = {false, true})
    void stopsWhenDailyOrMinuteQuotaIsExhausted(boolean daily) {
        if (daily) remaining = "0";
        else minuteRemaining = "0";
        assertThatThrownBy(() -> probe(() -> {}).capture(9001, 2026))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("quota exhausted");
        assertThat(calls).containsExactly("/leagues");
    }

    @Test
    void stopsOnApiErrorWithoutCreatingASuccessfulSample() throws IOException {
        leaguesBody = "{\"errors\":{\"plan\":\"synthetic failure\"}}";
        assertThatThrownBy(() -> probe(() -> {}).capture(9001, 2026)).isInstanceOf(ApiFootballException.class);
        assertThat(calls).containsExactly("/leagues");
        try (var files = Files.list(onlySampleDirectory())) {
            assertThat(files).isEmpty();
        }
    }

    @Test
    void preservesFixtureSampleIfItsDtoDoesNotMatch() throws IOException {
        fixturesBody = FIXTURES.replace("\"id\":7001", "\"id\":\"unexpected\"");
        assertThatThrownBy(() -> probe(() -> {}).capture(9001, 2026)).isInstanceOf(ApiFootballException.class);
        assertThat(calls).containsExactly("/leagues", "/fixtures");
        Path directory = onlySampleDirectory();
        assertThat(Files.readString(directory.resolve("fixtures.json"))).isEqualTo(fixturesBody);
        assertThat(directory.resolve("summary.json")).doesNotExist();
    }

    @Test
    void rejectsFixturesFromAnotherSeasonAfterPreservingTheSample() {
        fixturesBody = FIXTURES.replace("\"season\":2026", "\"season\":2025");
        assertThatThrownBy(() -> probe(() -> {}).capture(9001, 2026))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("different or missing league/season");
        assertThat(calls).containsExactly("/leagues", "/fixtures");
    }

    @Test
    void neverFetchesMorePagesOrLabelsAPartialSampleAsComplete() {
        leaguesBody = LEAGUES.replace("\"total\":1", "\"total\":2");
        assertThatThrownBy(() -> probe(() -> {}).capture(9001, 2026))
                .isInstanceOf(IllegalStateException.class).hasMessageContaining("incomplete");
        assertThat(calls).containsExactly("/leagues");
    }

    @Test
    void checksOutputLocationBeforeSpendingQuota() throws IOException {
        Path file = temporary.resolve("not-a-directory");
        Files.writeString(file, "keep");
        var probe = new ApiFootballProbe(client, JsonMapper.builder().build(), file, () -> {});
        assertThatThrownBy(() -> probe.capture(9001, 2026)).isInstanceOf(IOException.class);
        assertThat(calls).isEmpty();
        assertThat(Files.readString(file)).isEqualTo("keep");
    }

    @Test
    void createsANewDirectoryAndPreservesEarlierSamples() throws Exception {
        var probe = probe(() -> {});
        Path first = probe.capture(9001, 2026);
        Path second = probe.capture(9001, 2026);
        assertThat(first).isNotEqualTo(second);
        assertThat(Files.readString(first.resolve("fixtures.json"))).isEqualTo(FIXTURES);
        assertThat(Files.readString(second.resolve("fixtures.json"))).isEqualTo(FIXTURES);
    }

    @Test
    void interruptionStopsBeforeTheSecondRequest() {
        try {
            assertThatThrownBy(() -> probe(() -> { throw new InterruptedException(); }).capture(9001, 2026))
                    .isInstanceOf(InterruptedException.class);
            assertThat(Thread.currentThread().isInterrupted()).isTrue();
            assertThat(calls).containsExactly("/leagues");
        } finally {
            Thread.interrupted();
        }
    }

    private ApiFootballProbe probe(ApiFootballProbe.Pause pause) {
        return new ApiFootballProbe(client, JsonMapper.builder().build(), temporary.resolve("samples"), pause);
    }

    private Path onlySampleDirectory() throws IOException {
        try (var files = Files.list(temporary.resolve("samples"))) {
            return files.findFirst().orElseThrow();
        }
    }

    private static String envelope(String endpoint, String response) {
        int results = JsonMapper.builder().build().readTree(response).size();
        return "{\"get\":\"" + endpoint + "\",\"errors\":[],\"results\":" + results
                + ",\"paging\":{\"current\":1,\"total\":1},\"response\":" + response + "}";
    }

    private static String fixtureEvents(String response) {
        return envelope("fixtures/events", response)
                .replace("\"errors\"", "\"parameters\":{\"fixture\":7001},\"errors\"");
    }
}
