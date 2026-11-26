package pl.lmuml.football.apifootball.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import tools.jackson.databind.JsonNode;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ApiFootballFixturePlayers(Team team, List<PlayerSlot> players) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Team(Long id) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PlayerSlot(Person player, List<Metrics> statistics) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Person(Long id, String name) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Metrics(Games games, Shots shots, Goals goals, Passes passes, Tackles tackles) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Games(Integer minutes, Integer number, String position, JsonNode rating) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Shots(Integer total, Integer on) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Goals(Integer total, Integer assists, Integer saves) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Passes(Integer total, Integer key) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Tackles(Integer total) {}
}
