package pl.lmuml.football.apifootball;

import java.time.Instant;
import java.util.Objects;

import tools.jackson.databind.JsonNode;

record ApiFootballSnapshot(Endpoint endpoint, long leagueId, int season, Instant capturedAt, JsonNode payload) {

    enum Endpoint {
        LEAGUES("leagues"), FIXTURES("fixtures"), STANDINGS("standings");

        private final String path;

        Endpoint(String path) { this.path = path; }

        String path() { return path; }
    }

    ApiFootballSnapshot {
        Objects.requireNonNull(endpoint, "Snapshot endpoint is required.");
        Objects.requireNonNull(capturedAt, "Original capture time is required.");
        if (leagueId <= 0 || season < 1000 || season > 9999) {
            throw new IllegalArgumentException("A positive league ID and a four-digit season are required.");
        }
        requireSuccessfulEnvelope(payload, endpoint);
        requireParameters(payload.get("parameters"), endpoint, leagueId, season);
        requireScope(payload.get("response"), endpoint, leagueId, season);
        payload = payload.deepCopy();
    }

    @Override
    public JsonNode payload() {
        return payload.deepCopy();
    }

    @Override
    public String toString() {
        return "ApiFootballSnapshot[endpoint=" + endpoint + ", leagueId=" + leagueId
                + ", season=" + season + ", capturedAt=" + capturedAt + "]";
    }

    private static void requireSuccessfulEnvelope(JsonNode payload, Endpoint endpoint) {
        if (payload == null || !payload.isObject()
                || payload.get("get") == null || !endpoint.path().equals(payload.get("get").asString())
                || payload.get("errors") == null
                || !(payload.get("errors").isArray() || payload.get("errors").isObject())
                || !payload.get("errors").isEmpty()
                || payload.get("response") == null || !payload.get("response").isArray()
                || !integerEquals(payload.get("results"), payload.get("response").size())
                || payload.get("paging") == null
                || !integerEquals(payload.get("paging").get("current"), 1)
                || !integerEquals(payload.get("paging").get("total"), 1)) {
            throw new IllegalArgumentException("A successful complete API-Football envelope is required.");
        }
    }

    private static void requireScope(JsonNode items, Endpoint endpoint, long leagueId, int season) {
        if (endpoint == Endpoint.LEAGUES && items.isEmpty()) {
            throw new IllegalArgumentException("League metadata must contain the requested season.");
        }
        for (JsonNode item : items) {
            JsonNode league = item.get("league");
            if (league == null || !integerEquals(league.get("id"), leagueId)) {
                throw new IllegalArgumentException("Snapshot league does not match its request scope.");
            }
            if (endpoint != Endpoint.LEAGUES) {
                if (!integerEquals(league.get("season"), season)) {
                    throw new IllegalArgumentException("Snapshot season does not match its request scope.");
                }
            } else {
                JsonNode seasons = item.get("seasons");
                boolean found = false;
                if (seasons != null && seasons.isArray()) {
                    for (JsonNode value : seasons) {
                        if (integerEquals(value.get("year"), season)) found = true;
                    }
                }
                if (!found) {
                    throw new IllegalArgumentException("League metadata must contain the requested season.");
                }
            }
        }
    }

    private static void requireParameters(JsonNode parameters, Endpoint endpoint, long leagueId, int season) {
        String idParameter = endpoint == Endpoint.LEAGUES ? "id" : "league";
        if (parameters == null || !parameters.isObject() || parameters.size() != 2
                || !parameterEquals(parameters.get(idParameter), leagueId)
                || !parameterEquals(parameters.get("season"), season)) {
            throw new IllegalArgumentException("Snapshot parameters do not match its request scope.");
        }
    }

    private static boolean parameterEquals(JsonNode value, long expected) {
        if (integerEquals(value, expected)) return true;
        if (value == null || !value.isString()) return false;
        try {
            return Long.parseLong(value.asString()) == expected;
        } catch (NumberFormatException ignored) {
            return false;
        }
    }

    private static boolean integerEquals(JsonNode value, long expected) {
        return value != null && value.isIntegralNumber() && value.canConvertToLong() && value.asLong() == expected;
    }
}
