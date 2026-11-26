package pl.lmuml.football.apifootball;

import java.util.HashSet;
import java.util.List;
import java.util.stream.Collectors;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.json.JsonMapper;

final class ApiFootballFixturePayload {

    private ApiFootballFixturePayload() {}

    static JsonNode response(long fixtureId, String endpoint, String idParameter, JsonNode payload) {
        JsonNode response = completeResponse(endpoint, payload);
        if (!requestedFixture(payload.path("parameters"), idParameter, fixtureId)) {
            throw new IllegalArgumentException("Expected a complete response for the requested fixture.");
        }
        return response;
    }

    static JsonNode batchResponse(List<Long> fixtureIds, JsonNode payload) {
        String requestedIds = batchIds(fixtureIds);
        JsonNode response = completeResponse(ApiFootballClient.FIXTURES_ENDPOINT, payload);
        JsonNode parameters = payload.path("parameters");
        JsonNode echoed = parameters.path("ids");
        if (!parameters.isObject() || parameters.size() != 1 || !echoed.isString()
                || !requestedIds.equals(echoed.asString()) || response.size() != fixtureIds.size()) {
            throw new IllegalArgumentException("Expected a complete response for the requested fixtures.");
        }
        return response;
    }

    static String batchIds(List<Long> fixtureIds) {
        if (fixtureIds.size() < 2 || fixtureIds.size() > 20
                || fixtureIds.stream().anyMatch(id -> id == null || id <= 0)
                || new HashSet<>(fixtureIds).size() != fixtureIds.size()) {
            throw new IllegalArgumentException("Fixture details batches require 2 to 20 unique positive fixture IDs.");
        }
        return fixtureIds.stream().map(Object::toString).collect(Collectors.joining("-"));
    }

    private static JsonNode completeResponse(String endpoint, JsonNode payload) {
        if (payload == null || !payload.isObject() || !endpoint.equals(payload.path("get").asString())
                || !successful(payload.path("errors"))
                || !integerEquals(payload.path("paging").path("current"), 1)
                || !integerEquals(payload.path("paging").path("total"), 1)
                || !payload.path("response").isArray()
                || !integerEquals(payload.path("results"), payload.path("response").size())) {
            throw new IllegalArgumentException("Expected a complete response for the requested fixture.");
        }
        return payload.path("response");
    }

    static <T> List<T> decodeArray(JsonNode items, JsonMapper json, TypeReference<List<T>> type) {
        if (!items.isArray()) {
            throw new IllegalArgumentException("Expected a fixture detail array.");
        }
        return json.rebuild()
                .disable(MapperFeature.ALLOW_COERCION_OF_SCALARS)
                .disable(DeserializationFeature.ACCEPT_FLOAT_AS_INT)
                .build()
                .convertValue(items, type);
    }

    private static boolean successful(JsonNode errors) {
        return (errors.isArray() || errors.isObject()) && errors.isEmpty();
    }

    private static boolean requestedFixture(JsonNode parameters, String idParameter, long fixtureId) {
        JsonNode fixture = parameters.path(idParameter);
        return parameters.isObject() && parameters.size() == 1 && fixtureId > 0
                && (integerEquals(fixture, fixtureId)
                    || (fixture.isString() && Long.toString(fixtureId).equals(fixture.asString())));
    }

    private static boolean integerEquals(JsonNode value, long expected) {
        return value.isIntegralNumber() && value.canConvertToLong() && value.asLong() == expected;
    }
}
