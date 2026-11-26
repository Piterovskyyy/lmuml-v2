package pl.lmuml.football.apifootball;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import pl.lmuml.football.apifootball.dto.ApiFootballEnvelope;
import pl.lmuml.football.apifootball.dto.ApiFootballFixture;
import pl.lmuml.football.apifootball.dto.ApiFootballLeague;
import pl.lmuml.football.apifootball.dto.ApiFootballStanding;
import pl.lmuml.football.apifootball.dto.ApiFootballStatistics;
import pl.lmuml.football.apifootball.dto.ApiFootballTeam;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

class ApiFootballDtoTest {

    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final TypeReference<ApiFootballEnvelope<List<ApiFootballFixture>>> FIXTURE_LIST = new TypeReference<>() {};
    private static final TypeReference<ApiFootballEnvelope<JsonNode>> RAW_RESPONSE = new TypeReference<>() {};

    @Test
    void readsTypedFixtureListWithOffsetDateAndUnixSeconds() throws Exception {
        ApiFootballEnvelope<List<ApiFootballFixture>> envelope = fixtureEnvelope();
        assertThat(envelope.get()).isEqualTo("fixtures");
        assertThat(envelope.results()).isEqualTo(1);
        assertThat(envelope.paging()).isEqualTo(new ApiFootballEnvelope.Paging(1, 1));
        assertThat(envelope.response()).hasSize(1);
        ApiFootballFixture.Fixture fixture = envelope.response().getFirst().fixture();
        assertThat(fixture.id()).isEqualTo(7001L);
        assertThat(fixture.date().toInstant()).isEqualTo(Instant.ofEpochSecond(fixture.timestamp()));
        assertThat(fixture.date().toInstant()).isEqualTo(Instant.parse("2026-10-25T00:30:00Z"));
        assertThat(fixture.referee()).isNull();
        assertThat(fixture.venue().id()).isNull();
    }

    @Test
    void preservesArrayAndObjectShapesForErrorsAndEchoedParameters() {
        ApiFootballEnvelope<JsonNode> empty = JSON.readValue("""
                {"get":"fixtures","parameters":[],"errors":[],"results":0,"response":[]}
                """, RAW_RESPONSE);
        assertThat(empty.parameters().isArray()).isTrue();
        assertThat(empty.errors().isArray()).isTrue();
        assertThat(empty.response().isEmpty()).isTrue();
        assertThat(empty.results()).isZero();

        ApiFootballEnvelope<JsonNode> failure = JSON.readValue("""
                {"parameters":{"league":"9001"},"errors":{"rateLimit":"Synthetic limit error"},"results":0,"response":[]}
                """, RAW_RESPONSE);
        assertThat(failure.parameters().get("league").asString()).isEqualTo("9001");
        assertThat(failure.errors().get("rateLimit").asString()).isEqualTo("Synthetic limit error");
    }

    @Test
    void readsTypedObjectResponseWithoutAssumingAllEndpointsReturnArrays() {
        ApiFootballEnvelope<Map<String, Map<String, Integer>>> envelope = JSON.readValue("""
                {"get":"status","parameters":[],"errors":[],"results":1,
                 "response":{"requests":{"current":3,"limit_day":100}}}
                """, new TypeReference<>() {});
        assertThat(envelope.response().get("requests")).containsEntry("current", 3).containsEntry("limit_day", 100);
        assertThat(envelope.paging()).isNull();
    }

    @Test
    void preservesNullGoalsAndFourIndependentScorePairs() {
        ApiFootballFixture fixture = JSON.readValue("""
                {"goals":{"home":0,"away":null},"score":{
                  "halftime":{"home":1,"away":0},"fulltime":{"home":2,"away":2},
                  "extratime":{"home":3,"away":3},"penalty":{"home":4,"away":5}}}
                """, ApiFootballFixture.class);
        assertThat(fixture.goals().home()).isZero();
        assertThat(fixture.goals().away()).isNull();
        assertThat(fixture.score().halftime()).isEqualTo(new ApiFootballFixture.ScorePair(1, 0));
        assertThat(fixture.score().fulltime()).isEqualTo(new ApiFootballFixture.ScorePair(2, 2));
        assertThat(fixture.score().extratime()).isEqualTo(new ApiFootballFixture.ScorePair(3, 3));
        assertThat(fixture.score().penalty()).isEqualTo(new ApiFootballFixture.ScorePair(4, 5));
    }

    @Test
    void keepsNumericPercentageDecimalStringAndNullStatisticValues() {
        ApiFootballStatistics statistics = JSON.readValue("""
                {"statistics":[{"type":"Shots","value":4},{"type":"Possession","value":"56%"},
                  {"type":"Unavailable","value":null},{"type":"Decimal text","value":"0.42"}]}
                """, ApiFootballStatistics.class);
        assertThat(statistics.statistics().get(0).value().isNumber()).isTrue();
        assertThat(statistics.statistics().get(0).value().asInt()).isEqualTo(4);
        assertThat(statistics.statistics().get(1).value().asString()).isEqualTo("56%");
        assertThat(statistics.statistics().get(2).value().isNull()).isTrue();
        assertThat(statistics.statistics().get(3).value().asString()).isEqualTo("0.42");
    }

    @Test
    void retainsUnknownStatusAndKnockoutRoundWithoutInventingDomainMappings() {
        ApiFootballFixture fixture = JSON.readValue("""
                {"fixture":{"status":{"short":"NEW_STATUS","long":"Future status","elapsed":null,"extra":null}},
                 "league":{"round":"Quarter-finals"},"future_field":true}
                """, ApiFootballFixture.class);
        assertThat(fixture.fixture().status().shortCode()).isEqualTo("NEW_STATUS");
        assertThat(fixture.fixture().status().longName()).isEqualTo("Future status");
        assertThat(fixture.fixture().status().elapsed()).isNull();
        assertThat(fixture.league().round()).isEqualTo("Quarter-finals");
    }

    @Test
    void readsReferenceMetadataAndExactCoverageFlagNames() {
        ApiFootballLeague league = JSON.readValue("""
                {"league":{"id":9001,"name":"Example Cup","type":"Cup"},"seasons":[{
                  "year":2026,"start":"2026-08-01","end":"2027-05-30","current":true,"coverage":{
                    "fixtures":{"events":true,"lineups":false,"statistics_fixtures":null,"statistics_players":false},
                    "standings":false,"players":null,"top_scorers":true,"top_assists":false,"top_cards":null,
                    "injuries":true,"predictions":false,"odds":null}}]}
                """, ApiFootballLeague.class);
        assertThat(league.league().id()).isEqualTo(9001L);
        assertThat(league.seasons().getFirst().start()).isEqualTo(LocalDate.of(2026, 8, 1));
        ApiFootballLeague.Coverage coverage = league.seasons().getFirst().coverage();
        assertThat(coverage.fixtures().lineups()).isFalse();
        assertThat(coverage.fixtures().statisticsFixtures()).isNull();
        assertThat(coverage.fixtures().statisticsPlayers()).isFalse();
        assertThat(coverage.topScorers()).isTrue();
        assertThat(coverage.topAssists()).isFalse();
        assertThat(coverage.topCards()).isNull();
        ApiFootballTeam team = JSON.readValue("""
                {"team":{"id":11,"name":"North City","code":null,"founded":null,"national":false},
                 "venue":{"id":null,"name":"Example Ground","capacity":12000,"surface":"grass"}}
                """, ApiFootballTeam.class);
        assertThat(team.team().founded()).isNull();
        assertThat(team.team().national()).isFalse();
        assertThat(team.venue().capacity()).isEqualTo(12000);
    }

    @Test
    void keepsSeparateStandingGroupsAndMapsReservedForProperty() {
        ApiFootballStanding standing = JSON.readValue("""
                {"league":{"id":9001,"season":2026,"standings":[[
                  {"rank":1,"team":{"id":11},"group":"Group A","points":7,"goalsDiff":3,"form":null,
                   "all":{"played":3,"win":2,"draw":1,"lose":0,"goals":{"for":5,"against":2}},
                   "update":"2026-10-25T10:00:00+00:00"}],
                  [{"rank":1,"team":{"id":22},"group":"Group B","points":9}]]}}
                """, ApiFootballStanding.class);
        assertThat(standing.league().standings()).hasSize(2);
        ApiFootballStanding.Row first = standing.league().standings().getFirst().getFirst();
        assertThat(first.all().goals().goalsFor()).isEqualTo(5);
        assertThat(first.all().goals().against()).isEqualTo(2);
        assertThat(first.form()).isNull();
        assertThat(first.update()).isEqualTo("2026-10-25T10:00:00+00:00");
        assertThat(standing.league().standings().get(1).getFirst().group()).isEqualTo("Group B");
    }

    @Test
    void readsTypedEnrichmentsWhileRetainingUnmodeledPlayerData() throws Exception {
        ApiFootballFixture fixture = fixtureEnvelope().response().getFirst();
        assertThat(fixture.events().getFirst().player().id()).isEqualTo(51L);
        assertThat(fixture.events().getFirst().assist().id()).isNull();
        assertThat(fixture.events().getFirst().time().extra()).isNull();
        assertThat(fixture.lineups().getFirst().startXi().getFirst().player().pos()).isEqualTo("F");
        assertThat(fixture.lineups().getFirst().startXi().getFirst().player().grid()).isEqualTo("4:2");
        assertThat(fixture.lineups().getFirst().team().colors().goalkeeper().primary()).isEqualTo("445566");
        assertThat(fixture.lineups().getFirst().substitutes()).isEmpty();
        assertThat(fixture.statistics().getFirst().statistics().getFirst().value().asInt()).isEqualTo(4);
        assertThat(fixture.players().at("/0/players/0/player/id").asLong()).isEqualTo(51L);
    }

    @Test
    void doesNotTurnMissingOrNullCollectionsIntoEmptyLists() {
        ApiFootballFixture missing = JSON.readValue("{}", ApiFootballFixture.class);
        ApiFootballFixture explicitNull = JSON.readValue("{\"events\":null,\"lineups\":null}", ApiFootballFixture.class);
        ApiFootballFixture empty = JSON.readValue("{\"events\":[],\"lineups\":[]}", ApiFootballFixture.class);
        assertThat(missing.events()).isNull();
        assertThat(missing.statistics()).isNull();
        assertThat(explicitNull.events()).isNull();
        assertThat(explicitNull.lineups()).isNull();
        assertThat(empty.events()).isEmpty();
        assertThat(empty.lineups()).isEmpty();
    }

    private ApiFootballEnvelope<List<ApiFootballFixture>> fixtureEnvelope() throws Exception {
        String payload = new ClassPathResource("apifootball/fixture-envelope.json").getContentAsString(StandardCharsets.UTF_8);
        return JSON.readValue(payload, FIXTURE_LIST);
    }
}
