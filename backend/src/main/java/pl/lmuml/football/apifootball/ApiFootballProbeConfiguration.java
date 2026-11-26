package pl.lmuml.football.apifootball;

import java.nio.file.Path;
import java.time.Duration;
import java.util.Arrays;
import java.util.List;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import tools.jackson.databind.json.JsonMapper;

@Configuration(proxyBeanMethods = false)
@Profile("api-football-probe & !migration")
class ApiFootballProbeConfiguration {

    @Bean
    ApplicationRunner apiFootballProbe(ApiFootballClient client, JsonMapper json,
            @Value("${lmuml.api-football.probe.league-id:0}") long leagueId,
            @Value("${lmuml.api-football.probe.season:0}") int season,
            @Value("${lmuml.api-football.probe.fixture-id:0}") long fixtureId,
            @Value("${lmuml.api-football.probe.fixture-ids:}") String fixtureIds,
            @Value("${lmuml.api-football.probe.fixture-events:false}") boolean fixtureEvents,
            @Value("${lmuml.api-football.probe.fixture-lineups:false}") boolean fixtureLineups,
            @Value("${lmuml.api-football.probe.fixture-players:false}") boolean fixturePlayers,
            @Value("${lmuml.api-football.probe.fixture-details:false}") boolean fixtureDetails,
            @Value("${lmuml.api-football.probe.samples-root:.local/api-football}") String samplesRoot,
            @Value("${lmuml.api-football.probe.standings:false}") boolean standings) {
        return arguments -> {
            var probe = new ApiFootballProbe(client, json, Path.of(samplesRoot),
                    () -> Thread.sleep(Duration.ofSeconds(7)));
            int fixtureModes = (fixtureEvents ? 1 : 0) + (fixtureLineups ? 1 : 0)
                    + (fixturePlayers ? 1 : 0) + (fixtureDetails ? 1 : 0);
            if (!fixtureIds.isEmpty()) {
                if (fixtureId != 0 || leagueId != 0 || season != 0 || standings
                        || fixtureModes != 1 || !fixtureDetails) {
                    throw new IllegalArgumentException("Fixture ID batches require only fixture details mode.");
                }
                probe.captureFixtureDetails(parseFixtureIds(fixtureIds));
            } else if (fixtureId != 0 || fixtureModes > 0) {
                if (fixtureId <= 0 || leagueId != 0 || season != 0 || standings) {
                    throw new IllegalArgumentException("Fixture samples require only a positive fixture ID.");
                }
                if (fixtureModes > 1) {
                    throw new IllegalArgumentException("Select only one fixture data type.");
                }
                if (fixtureEvents) probe.captureFixtureEvents(fixtureId);
                else if (fixtureLineups) probe.captureFixtureLineups(fixtureId);
                else if (fixturePlayers) probe.captureFixturePlayers(fixtureId);
                else if (fixtureDetails) probe.captureFixtureDetails(fixtureId);
                else probe.captureFixtureStatistics(fixtureId);
            } else if (standings) probe.captureStandings(leagueId, season);
            else probe.capture(leagueId, season);
        };
    }

    private static List<Long> parseFixtureIds(String ids) {
        try {
            return Arrays.stream(ids.split(",", -1)).map(Long::parseLong).toList();
        } catch (NumberFormatException invalid) {
            throw new IllegalArgumentException("Fixture ID batches require comma-separated positive integers.");
        }
    }
}
