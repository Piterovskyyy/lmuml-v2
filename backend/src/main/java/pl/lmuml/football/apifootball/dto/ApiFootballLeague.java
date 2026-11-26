package pl.lmuml.football.apifootball.dto;

import java.time.LocalDate;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ApiFootballLeague(League league, Country country, List<Season> seasons) {

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record League(Long id, String name, String type, String logo) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Country(String name, String code, String flag) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Season(Integer year, LocalDate start, LocalDate end, Boolean current, Coverage coverage) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Coverage(
            FixtureCoverage fixtures,
            Boolean standings,
            Boolean players,
            @JsonProperty("top_scorers") Boolean topScorers,
            @JsonProperty("top_assists") Boolean topAssists,
            @JsonProperty("top_cards") Boolean topCards,
            Boolean injuries,
            Boolean predictions,
            Boolean odds) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record FixtureCoverage(
            Boolean events,
            Boolean lineups,
            @JsonProperty("statistics_fixtures") Boolean statisticsFixtures,
            @JsonProperty("statistics_players") Boolean statisticsPlayers) {}
}
