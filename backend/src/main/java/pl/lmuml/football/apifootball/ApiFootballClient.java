package pl.lmuml.football.apifootball;

import java.io.IOException;
import java.util.List;
import java.util.function.UnaryOperator;

import org.springframework.http.client.ClientHttpResponse;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;
import org.springframework.web.util.UriBuilder;
import pl.lmuml.football.apifootball.dto.ApiFootballEnvelope;
import pl.lmuml.football.apifootball.dto.ApiFootballFixture;
import pl.lmuml.football.apifootball.dto.ApiFootballLeague;
import pl.lmuml.football.apifootball.dto.ApiFootballStanding;
import tools.jackson.core.JacksonException;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static pl.lmuml.football.apifootball.ApiFootballException.Kind.*;

public final class ApiFootballClient {

    // Bounds memory even if the upstream server returns an unexpectedly large payload.
    static final int MAX_RESPONSE_BYTES = 4 * 1024 * 1024;
    static final String FIXTURES_ENDPOINT = "fixtures";
    static final String FIXTURE_STATISTICS_ENDPOINT = "fixtures/statistics";
    static final String FIXTURE_EVENTS_ENDPOINT = "fixtures/events";
    static final String FIXTURE_LINEUPS_ENDPOINT = "fixtures/lineups";
    static final String FIXTURE_PLAYERS_ENDPOINT = "fixtures/players";
    private static final TypeReference<ApiFootballEnvelope<JsonNode>> ENVELOPE = new TypeReference<>() {};
    private static final TypeReference<List<ApiFootballLeague>> LEAGUES = new TypeReference<>() {};
    private static final TypeReference<List<ApiFootballFixture>> FIXTURES = new TypeReference<>() {};
    private static final TypeReference<List<ApiFootballStanding>> STANDINGS = new TypeReference<>() {};

    private final RestClient http;
    private final JsonMapper json;

    ApiFootballClient(RestClient http, JsonMapper json) {
        this.http = http;
        this.json = json.rebuild()
                .enable(DeserializationFeature.FAIL_ON_TRAILING_TOKENS)
                .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .build();
    }

    public ApiFootballResponse<ApiFootballLeague> leagues(long leagueId, int season) {
        return decodeLeagues(fetchLeagues(leagueId, season));
    }

    public ApiFootballResponse<ApiFootballFixture> fixtures(long leagueId, int season) {
        return decodeFixtures(fetchFixtures(leagueId, season));
    }

    public ApiFootballResponse<ApiFootballStanding> standings(long leagueId, int season) {
        return decodeStandings(fetchStandings(leagueId, season));
    }

    ApiFootballPayload fetchLeagues(long leagueId, int season) {
        return get("leagues", "id", leagueId, season);
    }

    ApiFootballPayload fetchFixtures(long leagueId, int season) {
        return get(FIXTURES_ENDPOINT, "league", leagueId, season);
    }

    ApiFootballPayload fetchFixtureDetails(long fixtureId) {
        if (fixtureId <= 0) {
            throw new IllegalArgumentException("A positive fixture ID is required.");
        }
        return get(FIXTURES_ENDPOINT, uri -> uri.queryParam("id", fixtureId));
    }

    ApiFootballPayload fetchFixtureDetails(List<Long> fixtureIds) {
        String ids = ApiFootballFixturePayload.batchIds(fixtureIds);
        return get(FIXTURES_ENDPOINT, uri -> uri.queryParam("ids", ids));
    }

    ApiFootballPayload fetchStandings(long leagueId, int season) {
        return get("standings", "league", leagueId, season);
    }

    ApiFootballPayload fetchFixtureStatistics(long fixtureId) {
        return getFixture(FIXTURE_STATISTICS_ENDPOINT, fixtureId);
    }

    ApiFootballPayload fetchFixtureEvents(long fixtureId) {
        return getFixture(FIXTURE_EVENTS_ENDPOINT, fixtureId);
    }

    ApiFootballPayload fetchFixtureLineups(long fixtureId) {
        return getFixture(FIXTURE_LINEUPS_ENDPOINT, fixtureId);
    }

    ApiFootballPayload fetchFixturePlayers(long fixtureId) {
        return getFixture(FIXTURE_PLAYERS_ENDPOINT, fixtureId);
    }

    ApiFootballResponse<ApiFootballLeague> decodeLeagues(ApiFootballPayload payload) {
        return decode(payload, LEAGUES);
    }

    ApiFootballResponse<ApiFootballFixture> decodeFixtures(ApiFootballPayload payload) {
        return decode(payload, FIXTURES);
    }

    ApiFootballResponse<ApiFootballStanding> decodeStandings(ApiFootballPayload payload) {
        return decode(payload, STANDINGS);
    }

    private ApiFootballPayload getFixture(String endpoint, long fixtureId) {
        if (fixtureId <= 0) {
            throw new IllegalArgumentException("A positive fixture ID is required.");
        }
        return get(endpoint, uri -> uri.queryParam("fixture", fixtureId));
    }

    private ApiFootballPayload get(String endpoint, String leagueParameter, long leagueId, int season) {
        if (leagueId <= 0 || season < 1000 || season > 9999) {
            throw new IllegalArgumentException("A positive league ID and a four-digit season are required.");
        }
        return get(endpoint, uri -> uri.queryParam(leagueParameter, leagueId).queryParam("season", season));
    }

    private ApiFootballPayload get(String endpoint, UnaryOperator<UriBuilder> parameters) {
        try {
            return http.get()
                    .uri(uri -> parameters.apply(uri.path("/" + endpoint)).build())
                    .exchange((request, response) -> read(response, endpoint));
        } catch (RestClientException ignored) {
            throw new ApiFootballException(TRANSPORT_ERROR, null, null);
        }
    }

    private ApiFootballPayload read(ClientHttpResponse response, String endpoint) throws IOException {
        int status = response.getStatusCode().value();
        ApiFootballResponse.Quota quota = ApiFootballResponse.Quota.from(response.getHeaders());
        if (status != 200) {
            throw new ApiFootballException(HTTP_ERROR, status, quota);
        }
        byte[] body = response.getBody().readNBytes(MAX_RESPONSE_BYTES + 1);
        if (body.length == 0 || body.length > MAX_RESPONSE_BYTES) {
            throw new ApiFootballException(INVALID_RESPONSE, status, quota);
        }
        try {
            ApiFootballEnvelope<JsonNode> envelope = json.readValue(body, ENVELOPE);
            if (envelope == null || envelope.errors() == null
                    || !(envelope.errors().isArray() || envelope.errors().isObject())) {
                throw new ApiFootballException(INVALID_RESPONSE, status, quota);
            }
            // API errors take priority over parsing an otherwise unusable response payload.
            if (!envelope.errors().isEmpty()) {
                throw new ApiFootballException(API_ERROR, status, quota);
            }
            if (!endpoint.equals(envelope.get()) || envelope.response() == null
                    || !envelope.response().isArray() || envelope.results() == null
                    || envelope.results() != envelope.response().size()
                    || envelope.paging() == null || envelope.paging().current() == null
                    || envelope.paging().total() == null || envelope.paging().current() < 1
                    || envelope.paging().total() < envelope.paging().current()) {
                throw new ApiFootballException(INVALID_RESPONSE, status, quota);
            }
            return new ApiFootballPayload(body, envelope, quota);
        } catch (JacksonException | IllegalArgumentException ignored) {
            throw new ApiFootballException(INVALID_RESPONSE, status, quota);
        }
    }

    private <T> ApiFootballResponse<T> decode(ApiFootballPayload payload, TypeReference<List<T>> type) {
        try {
            List<T> items = json.convertValue(payload.envelope().response(), type);
            if (items.contains(null)) {
                throw new ApiFootballException(INVALID_RESPONSE, 200, payload.quota());
            }
            return new ApiFootballResponse<>(items, payload.envelope().paging(), payload.quota());
        } catch (JacksonException | IllegalArgumentException ignored) {
            throw new ApiFootballException(INVALID_RESPONSE, 200, payload.quota());
        }
    }
}
