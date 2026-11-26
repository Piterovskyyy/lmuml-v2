package pl.lmuml.football.apifootball.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import tools.jackson.databind.JsonNode;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ApiFootballEnvelope<T>(
        String get,
        JsonNode parameters,
        JsonNode errors,
        Integer results,
        Paging paging,
        T response
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Paging(Integer current, Integer total) {}
}
