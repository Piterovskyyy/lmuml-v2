package pl.lmuml.football.apifootball;

import java.net.http.HttpClient;
import java.time.Duration;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;
import tools.jackson.databind.json.JsonMapper;

@Configuration(proxyBeanMethods = false)
@Profile("!migration")
@ConditionalOnProperty(prefix = "lmuml.api-football", name = "enabled", havingValue = "true")
class ApiFootballConfiguration {

    @Bean(destroyMethod = "close")
    HttpClient apiFootballTransport() {
        return HttpClient.newBuilder()
                .connectTimeout(Duration.ofSeconds(3))
                .followRedirects(HttpClient.Redirect.NEVER)
                .build();
    }

    @Bean
    ApiFootballClient apiFootballClient(RestClient.Builder builder, JsonMapper json,
                                       HttpClient apiFootballTransport,
                                       @Value("${lmuml.api-football.api-key:}") String apiKey) {
        if (apiKey.isEmpty() || apiKey.length() > 512
                || apiKey.chars().anyMatch(character -> character < 0x21 || character > 0x7e)) {
            throw new IllegalArgumentException("API-Football requires a valid local API key when enabled.");
        }
        RestClient http = builder
                .baseUrl("https://v3.football.api-sports.io")
                .requestFactory(requestFactory(apiFootballTransport, Duration.ofSeconds(10)))
                .defaultHeader("x-apisports-key", apiKey)
                .defaultHeader("Accept", MediaType.APPLICATION_JSON_VALUE)
                .build();
        return new ApiFootballClient(http, json);
    }

    static JdkClientHttpRequestFactory requestFactory(HttpClient transport, Duration readTimeout) {
        JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(transport);
        factory.setReadTimeout(readTimeout);
        return factory;
    }
}
