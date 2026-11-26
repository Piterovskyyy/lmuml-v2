package pl.lmuml.football.apifootball.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import tools.jackson.databind.JsonNode;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ApiFootballStatistics(Team team, List<Statistic> statistics) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Team(Long id, String name, String logo) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Statistic(String type, JsonNode value) {}
}
