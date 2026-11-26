package pl.lmuml.football.apifootball;

import java.time.Instant;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import pl.lmuml.football.apifootball.dto.ApiFootballFixture;
import pl.lmuml.football.apifootball.dto.ApiFootballLeague;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.json.JsonMapper;

import static pl.lmuml.football.apifootball.ApiFootballImportBatch.*;

final class ApiFootballImportMapper {

    private final JsonMapper json;

    ApiFootballImportMapper(JsonMapper json) {
        this.json = json.rebuild().disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .disable(MapperFeature.ALLOW_COERCION_OF_SCALARS).build();
    }

    ApiFootballImportBatch map(ApiFootballSnapshot leagues, ApiFootballSnapshot fixtures) {
        require(leagues.endpoint() == ApiFootballSnapshot.Endpoint.LEAGUES
                && fixtures.endpoint() == ApiFootballSnapshot.Endpoint.FIXTURES
                && leagues.leagueId() == fixtures.leagueId() && leagues.season() == fixtures.season(),
                "Import requires matching league metadata and fixture scopes.");
        List<ApiFootballLeague> leagueItems;
        List<ApiFootballFixture> fixtureItems;
        try {
            leagueItems = json.convertValue(leagues.payload().get("response"), new TypeReference<>() {});
            fixtureItems = json.convertValue(fixtures.payload().get("response"), new TypeReference<>() {});
        } catch (JacksonException | IllegalArgumentException invalid) {
            throw new IllegalArgumentException("API-Football sample fields do not match the expected types.");
        }
        require(leagueItems.size() == 1, "Expected exactly one competition in league metadata.");
        ApiFootballLeague item = leagueItems.getFirst();
        var profile = item.league();
        require(profile != null, "Competition metadata is required.");
        var competition = new Competition(positive(profile.id()), name(profile.name()), optional(profile.type()),
                optional(profile.logo()), item.country() == null ? null : optional(item.country().name()),
                item.country() == null ? null : optional(item.country().code()),
                item.country() == null ? null : optional(item.country().flag()));
        var selected = item.seasons().stream().filter(value -> value != null && value.year() != null
                && value.year() == leagues.season()).toList();
        require(selected.size() == 1, "Expected exactly one matching season.");
        var season = selected.getFirst();
        require(season.start() == null || season.end() == null || !season.end().isBefore(season.start()),
                "Season dates are inconsistent.");
        JsonNode coverage = null;
        for (JsonNode raw : leagues.payload().get("response").get(0).get("seasons")) {
            if (raw.get("year").asInt() == leagues.season()) coverage = raw.get("coverage");
        }
        require(coverage == null || coverage.isNull() || coverage.isObject(), "Coverage must be an object or absent.");
        var seasonData = new Season(season.year(), season.start(), season.end(), season.current(), coverage);
        Map<Long, Team> teams = new TreeMap<>();
        var matches = new ArrayList<Match>();
        var ids = new HashSet<Long>();
        for (ApiFootballFixture value : fixtureItems) {
            require(value != null && value.fixture() != null && value.teams() != null
                    && value.fixture().status() != null, "Fixture identity, participants and status are required.");
            var fixture = value.fixture();
            long id = positive(fixture.id());
            require(ids.add(id), "Duplicate provider fixture ID in one response.");
            Team home = team(value.teams().home(), teams);
            Team away = team(value.teams().away(), teams);
            require(home.providerId() != away.providerId(), "A fixture must have two different teams.");
            Instant kickoff = fixture.date() == null ? null : fixture.date().toInstant();
            require(kickoff == null || fixture.timestamp() == null
                    || kickoff.equals(Instant.ofEpochSecond(fixture.timestamp())), "Fixture date and timestamp disagree.");
            var venue = fixture.venue();
            Long venueId = venue == null ? null : venue.id();
            if (venueId != null) positive(venueId);
            nonnegative(fixture.status().elapsed());
            nonnegative(fixture.status().extra());
            var scores = value.score();
            matches.add(new Match(id, home.providerId(), away.providerId(), kickoff,
                    name(fixture.status().shortCode()), optional(value.league().round()), optional(fixture.referee()),
                    venueId, venue == null ? null : optional(venue.name()), venue == null ? null : optional(venue.city()),
                    fixture.status().elapsed(), fixture.status().extra(), value.teams().home().winner(),
                    value.teams().away().winner(), goals(value.goals()), goals(scores == null ? null : scores.halftime()),
                    goals(scores == null ? null : scores.fulltime()), goals(scores == null ? null : scores.extratime()),
                    goals(scores == null ? null : scores.penalty())));
        }
        matches.sort(java.util.Comparator.comparingLong(Match::providerId));
        return new ApiFootballImportBatch(competition, seasonData, new ArrayList<>(teams.values()), matches, leagues, fixtures);
    }

    private static Team team(ApiFootballFixture.Team value, Map<Long, Team> teams) {
        require(value != null, "Both fixture participants are required.");
        var team = new Team(positive(value.id()), name(value.name()), optional(value.logo()));
        Team previous = teams.putIfAbsent(team.providerId(), team);
        require(previous == null || previous.equals(team), "Conflicting metadata for one team in the same response.");
        return team;
    }

    private static Goals goals(ApiFootballFixture.ScorePair value) {
        if (value == null) return new Goals(null, null);
        nonnegative(value.home());
        nonnegative(value.away());
        return new Goals(value.home(), value.away());
    }

    private static long positive(Long value) {
        require(value != null && value > 0, "Provider IDs must be positive and present.");
        return value;
    }

    private static void nonnegative(Integer value) {
        require(value == null || value >= 0, "Known goals and minutes cannot be negative.");
    }

    private static String name(String value) {
        require(value != null && !value.isBlank(), "Required names and status codes cannot be blank.");
        return value.strip();
    }

    private static String optional(String value) { return value == null || value.isBlank() ? null : value; }

    private static void require(boolean valid, String message) {
        if (!valid) throw new IllegalArgumentException(message);
    }
}
