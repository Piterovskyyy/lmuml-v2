package pl.lmuml.football.apifootball;

import java.net.http.HttpClient;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

import static org.assertj.core.api.Assertions.assertThat;

class ApiFootballConfigurationTest {

    private final ApplicationContextRunner context = new ApplicationContextRunner()
            .withUserConfiguration(ApiFootballConfiguration.class)
            .withBean(RestClient.Builder.class, RestClient::builder)
            .withBean(JsonMapper.class, () -> JsonMapper.builder().build());

    @Test
    void leavesIntegrationDisabledWithoutAKey() {
        context.run(application -> {
            assertThat(application).hasNotFailed().doesNotHaveBean(ApiFootballClient.class);
            assertThat(application).doesNotHaveBean(HttpClient.class);
        });
    }

    @Test
    void createsEnabledClientWithoutCallingProvider() {
        context.withPropertyValues("lmuml.api-football.enabled=true", "lmuml.api-football.api-key=synthetic-key")
                .run(application -> {
                    assertThat(application).hasNotFailed().hasSingleBean(ApiFootballClient.class);
                    assertThat(application.getBean(HttpClient.class).followRedirects())
                            .isEqualTo(HttpClient.Redirect.NEVER);
                });
    }

    @Test
    void failsClearlyWhenEnabledWithoutAKey() {
        context.withPropertyValues("lmuml.api-football.enabled=true").run(application ->
                assertThat(application).hasFailed());
    }

    @ParameterizedTest
    @ValueSource(strings = {"synthetic key", "synthetic\u200bkey", "synthetic\ud83d\ude00key"})
    void rejectsInvalidHeaderCharactersWithoutExposingTheKey(String key) {
        context.withPropertyValues("lmuml.api-football.enabled=true", "lmuml.api-football.api-key=" + key)
                .run(application -> {
                    assertThat(application).hasFailed();
                    assertThat(application.getStartupFailure()).hasRootCauseMessage(
                            "API-Football requires a valid local API key when enabled.");
                });
    }

    @Test
    void neverCreatesProviderClientInMigrationProfile() {
        context.withPropertyValues("spring.profiles.active=migration", "lmuml.api-football.enabled=true")
                .run(application -> assertThat(application).hasNotFailed()
                        .doesNotHaveBean(ApiFootballClient.class).doesNotHaveBean(HttpClient.class));
    }
}
