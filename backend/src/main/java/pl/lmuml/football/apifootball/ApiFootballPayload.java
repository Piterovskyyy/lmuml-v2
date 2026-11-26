package pl.lmuml.football.apifootball;

import pl.lmuml.football.apifootball.dto.ApiFootballEnvelope;
import tools.jackson.databind.JsonNode;

// Internal transport snapshot; never a response of the application's public API.
record ApiFootballPayload(byte[] json, ApiFootballEnvelope<JsonNode> envelope,
                          ApiFootballResponse.Quota quota) {

    ApiFootballPayload {
        json = json.clone();
    }

    @Override
    public byte[] json() {
        return json.clone();
    }
}
