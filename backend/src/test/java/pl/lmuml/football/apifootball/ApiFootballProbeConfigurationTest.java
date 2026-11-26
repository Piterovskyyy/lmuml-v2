package pl.lmuml.football.apifootball;

import javax.sql.DataSource;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.test.context.ConfigDataApplicationContextInitializer;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import pl.lmuml.LmumlApplication;

import static org.assertj.core.api.Assertions.assertThat;

class ApiFootballProbeConfigurationTest {

    @Test
    void loadsRealProbeProfileWithoutDatabaseOrAutomaticRequestDuringContextCreation() {
        new ApplicationContextRunner()
                .withInitializer(new ConfigDataApplicationContextInitializer())
                .withUserConfiguration(LmumlApplication.class)
                .withPropertyValues("spring.profiles.active=api-football-probe",
                        "lmuml.api-football.api-key=synthetic-key",
                        "lmuml.api-football.probe.league-id=9001",
                        "lmuml.api-football.probe.season=2026")
                .run(context -> {
                    assertThat(context).hasNotFailed().hasSingleBean(ApiFootballClient.class)
                            .hasSingleBean(ApplicationRunner.class)
                            .doesNotHaveBean(DataSource.class).doesNotHaveBean(Flyway.class);
                    assertThat(context.getEnvironment().getProperty("spring.main.web-application-type")).isEqualTo("none");
                    assertThat(context.getEnvironment().getProperty("spring.main.keep-alive")).isEqualTo("false");
                    // ContextRunner refreshes beans, but intentionally does not invoke ApplicationRunner.
                });
    }

    @Test
    void normalConfigurationDoesNotRegisterAProbeRunner() {
        new ApplicationContextRunner().withUserConfiguration(ApiFootballProbeConfiguration.class)
                .run(context -> assertThat(context).hasNotFailed().doesNotHaveBean(ApplicationRunner.class));
    }

    @Test
    void migrationProfileCannotRegisterAProbeRunner() {
        new ApplicationContextRunner().withUserConfiguration(ApiFootballProbeConfiguration.class)
                .withPropertyValues("spring.profiles.active=api-football-probe,migration")
                .run(context -> assertThat(context).hasNotFailed().doesNotHaveBean(ApplicationRunner.class));
    }
}
