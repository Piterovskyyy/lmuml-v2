package pl.lmuml.football.apifootball.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ApiFootballTeam(Team team, Venue venue) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Team(
            Long id, String name, String code, String country,
            Integer founded, Boolean national, String logo) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Venue(
            Long id, String name, String address, String city,
            Integer capacity, String surface, String image) {}
}
