package pl.lmuml.football.seasons;

import java.time.Instant;
import java.time.format.DateTimeParseException;
import javax.sql.DataSource;

import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnNotWebApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.dao.DataAccessException;

import pl.lmuml.football.seasons.SeasonSyncStatusStore.Attempt;
import pl.lmuml.football.seasons.SeasonSyncStatusStore.Outcome;

@Configuration(proxyBeanMethods = false)
@Profile("api-football-sync-status & !migration")
@ConditionalOnNotWebApplication
class SeasonSyncStatusRunConfiguration {

    private static final String OPTION_PREFIX = "lmuml.api-football.sync-status.";

    @Bean
    ApplicationRunner recordApiFootballSyncStatus(DataSource dataSource) {
        var store = new SeasonSyncStatusStore(dataSource);
        return arguments -> {
            try {
                String seasonCode = option(arguments, "season-code");
                if (seasonCode.length() > 64 || !seasonCode.matches("api-football-[1-9]\\d*-[1-9]\\d{3}")) {
                    throw new IllegalArgumentException("Invalid API-Football season code.");
                }
                var attempt = new Attempt(Instant.parse(option(arguments, "started-at")),
                        Instant.parse(option(arguments, "finished-at")), Outcome.valueOf(option(arguments, "outcome")));
                store.recordAttempt(seasonCode, attempt);
            } catch (IllegalArgumentException | DateTimeParseException invalid) {
                throw new IllegalArgumentException("API-Football synchronization attempt arguments are invalid.");
            } catch (DataAccessException failure) {
                throw new IllegalStateException("Could not record the API-Football synchronization attempt.");
            }
        };
    }

    private static String option(ApplicationArguments arguments, String name) {
        var values = arguments.getOptionValues(OPTION_PREFIX + name);
        if (values == null || values.size() != 1) {
            throw new IllegalArgumentException("Expected one value for each synchronization attempt option.");
        }
        return values.getFirst();
    }
}
