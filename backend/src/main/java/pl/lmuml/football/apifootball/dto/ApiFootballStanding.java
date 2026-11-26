package pl.lmuml.football.apifootball.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ApiFootballStanding(League league) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record League(
            Long id, String name, String country, String logo, String flag,
            Integer season, List<List<Row>> standings) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Row(
            Integer rank, Team team, Integer points, Integer goalsDiff,
            String group, String form, String status, String description,
            Tally all, Tally home, Tally away, String update) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Team(Long id, String name, String logo) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Tally(Integer played, Integer win, Integer draw, Integer lose, Goals goals) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Goals(@JsonProperty("for") Integer goalsFor, Integer against) {}
}
