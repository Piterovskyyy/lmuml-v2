package pl.lmuml.football.apifootball.dto;

import java.time.OffsetDateTime;
import java.util.List;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;
import tools.jackson.databind.JsonNode;

@JsonIgnoreProperties(ignoreUnknown = true)
public record ApiFootballFixture(
        Fixture fixture,
        League league,
        Teams teams,
        ScorePair goals,
        Score score,
        List<ApiFootballEvent> events,
        List<ApiFootballLineup> lineups,
        List<ApiFootballStatistics> statistics,
        // Detailed player statistics are retained without a typed model in this stage.
        JsonNode players
) {
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Fixture(Long id, String referee, String timezone, OffsetDateTime date,
                          Long timestamp, Periods periods, Venue venue, Status status) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Periods(Long first, Long second) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Venue(Long id, String name, String city) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Status(@JsonProperty("long") String longName,
                         @JsonProperty("short") String shortCode,
                         Integer elapsed, Integer extra) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record League(Long id, String name, String country, String logo, String flag,
                         Integer season, String round, Boolean standings) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Teams(Team home, Team away) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Team(Long id, String name, String logo, Boolean winner) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record ScorePair(Integer home, Integer away) {}

    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Score(ScorePair halftime, ScorePair fulltime, ScorePair extratime, ScorePair penalty) {}
}
