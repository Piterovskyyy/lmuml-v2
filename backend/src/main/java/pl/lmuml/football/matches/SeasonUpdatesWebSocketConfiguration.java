package pl.lmuml.football.matches;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.annotation.Configuration;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.socket.config.annotation.EnableWebSocket;
import org.springframework.web.socket.config.annotation.WebSocketConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketHandlerRegistry;

@Configuration(proxyBeanMethods = false)
@EnableScheduling
@EnableWebSocket
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
class SeasonUpdatesWebSocketConfiguration implements WebSocketConfigurer {

    private final SeasonFixtureUpdates updates;

    SeasonUpdatesWebSocketConfiguration(SeasonFixtureUpdates updates) {
        this.updates = updates;
    }

    @Override
    public void registerWebSocketHandlers(WebSocketHandlerRegistry registry) {
        registry.addHandler(updates, "/api/v1/season-updates");
    }
}
