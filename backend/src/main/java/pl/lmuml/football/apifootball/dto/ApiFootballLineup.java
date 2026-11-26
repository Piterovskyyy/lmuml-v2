package pl.lmuml.football.apifootball.dto;

import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ApiFootballLineup(
        Team team,
        Coach coach,
        String formation,
        @JsonProperty("startXI") List<PlayerSlot> startXi,
        List<PlayerSlot> substitutes
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Team(Long id, String name, String logo, Colors colors) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Colors(Kit player, Kit goalkeeper) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Kit(String primary, String number, String border) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Coach(Long id, String name, String photo) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record PlayerSlot(Player player) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Player(Long id, String name, Integer number, String pos, String grid) {}
}
