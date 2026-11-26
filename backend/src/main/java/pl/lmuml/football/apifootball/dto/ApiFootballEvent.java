package pl.lmuml.football.apifootball.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ApiFootballEvent(
        Time time,
        Team team,
        Person player,
        Person assist,
        String type,
        String detail,
        String comments
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Time(Integer elapsed, Integer extra) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Team(Long id, String name, String logo) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Person(Long id, String name) {}
}
