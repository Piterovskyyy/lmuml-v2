package pl.lmuml.football.matches;

import java.io.IOException;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.TimeUnit;
import java.util.stream.Collectors;
import javax.sql.DataSource;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.context.event.ContextClosedEvent;
import org.springframework.context.event.EventListener;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.socket.CloseStatus;
import org.springframework.web.socket.PingMessage;
import org.springframework.web.socket.PongMessage;
import org.springframework.web.socket.TextMessage;
import org.springframework.web.socket.WebSocketSession;
import org.springframework.web.socket.handler.TextWebSocketHandler;
import pl.lmuml.football.seasons.SeasonCode;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.DeserializationFeature;
import tools.jackson.databind.ObjectReader;
import tools.jackson.databind.json.JsonMapper;

@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class SeasonFixtureUpdates extends TextWebSocketHandler {

    private static final int MAX_CONNECTIONS = 128;
    private static final int MAX_TEXT_BYTES = 1_024;
    private static final long SUBSCRIPTION_TIMEOUT_NS = TimeUnit.SECONDS.toNanos(15);
    private static final long PING_INTERVAL_NS = TimeUnit.SECONDS.toNanos(15);
    private static final long PONG_TIMEOUT_NS = TimeUnit.SECONDS.toNanos(45);
    private static final CloseStatus OVER_CAPACITY = new CloseStatus(1013, "Season update capacity reached");

    private final JdbcClient jdbc;
    private final JsonMapper json;
    private final ObjectReader subscriptionReader;
    private final Map<String, Client> clients = new ConcurrentHashMap<>();
    private final Object lifecycleLock = new Object();
    private boolean closing;

    SeasonFixtureUpdates(DataSource dataSource, JsonMapper json) {
        jdbc = JdbcClient.create(dataSource);
        this.json = json;
        subscriptionReader = json.reader().with(DeserializationFeature.FAIL_ON_TRAILING_TOKENS,
                DeserializationFeature.FAIL_ON_READING_DUP_TREE_KEY);
    }

    @Override
    public void afterConnectionEstablished(WebSocketSession session) throws IOException {
        session.setTextMessageSizeLimit(MAX_TEXT_BYTES);
        CloseStatus refusal;
        synchronized (lifecycleLock) {
            if (closing) {
                refusal = CloseStatus.GOING_AWAY;
            } else if (clients.size() >= MAX_CONNECTIONS) {
                refusal = OVER_CAPACITY;
            } else {
                clients.put(session.getId(), new Client(session));
                return;
            }
        }
        session.close(refusal);
    }

    @Override
    protected void handleTextMessage(WebSocketSession session, TextMessage message) {
        var client = clients.get(session.getId());
        if (client == null) return;
        if (message.getPayloadLength() > MAX_TEXT_BYTES) {
            close(client, CloseStatus.TOO_BIG_TO_PROCESS);
            return;
        }

        String seasonCode = subscriptionSeason(message.getPayload());
        if (seasonCode == null) {
            close(client, CloseStatus.POLICY_VIOLATION);
            return;
        }

        synchronized (client) {
            if (!isConnected(client)) return;
            if (client.version != null && client.version.seasonCode().equals(seasonCode)) return;
            // Pause publication before loading the new season so an older poll cannot race its initial frame.
            client.version = null;
            client.subscriptionStartedAt = System.nanoTime();
        }

        SeasonVersion version;
        try {
            version = readVersions(List.of(seasonCode)).get(seasonCode);
        } catch (DataAccessException unavailable) {
            close(client, CloseStatus.SERVER_ERROR);
            return;
        }
        if (version == null) {
            close(client, CloseStatus.POLICY_VIOLATION);
            return;
        }

        synchronized (client) {
            if (isConnected(client)) sendVersion(client, version);
        }
    }

    @Override
    protected void handlePongMessage(WebSocketSession session, PongMessage message) {
        var client = clients.get(session.getId());
        if (client != null) client.lastPongAt = System.nanoTime();
    }

    @Override
    public void handleTransportError(WebSocketSession session, Throwable error) {
        var client = clients.get(session.getId());
        if (client != null) close(client, CloseStatus.SERVER_ERROR);
    }

    @Override
    public void afterConnectionClosed(WebSocketSession session, CloseStatus status) {
        clients.remove(session.getId());
    }

    @Scheduled(fixedDelay = 5, timeUnit = TimeUnit.SECONDS)
    void publishChanges() {
        long now = System.nanoTime();
        var subscribers = new ArrayList<Subscriber>();
        for (var client : clients.values()) {
            synchronized (client) {
                if (keepAlive(client, now) && client.version != null) {
                    subscribers.add(new Subscriber(client, client.version));
                }
            }
        }
        if (subscribers.isEmpty()) return;

        var seasonCodes = subscribers.stream().map(subscriber -> subscriber.version().seasonCode()).distinct().toList();
        Map<String, SeasonVersion> versions;
        try {
            versions = readVersions(seasonCodes);
        } catch (DataAccessException unavailable) {
            subscribers.forEach(subscriber -> publishVersion(subscriber, null, CloseStatus.SERVER_ERROR));
            return;
        }
        for (var subscriber : subscribers) {
            publishVersion(subscriber, versions.get(subscriber.version().seasonCode()), CloseStatus.POLICY_VIOLATION);
        }
    }

    private boolean keepAlive(Client client, long now) {
        if (!isConnected(client)) return false;
        if (client.version == null && now - client.subscriptionStartedAt >= SUBSCRIPTION_TIMEOUT_NS) {
            close(client, CloseStatus.POLICY_VIOLATION);
            return false;
        }
        if (now - client.lastPongAt >= PONG_TIMEOUT_NS) {
            close(client, CloseStatus.GOING_AWAY);
            return false;
        }
        if (now - client.lastPingAt >= PING_INTERVAL_NS) {
            try {
                client.session.sendMessage(new PingMessage());
                client.lastPingAt = now;
            } catch (IOException | IllegalStateException disconnected) {
                close(client, CloseStatus.SERVER_ERROR);
                return false;
            }
        }
        return true;
    }

    private void publishVersion(Subscriber subscriber, SeasonVersion version, CloseStatus missingVersionStatus) {
        var client = subscriber.client();
        synchronized (client) {
            // A subscription change may have published its initial snapshot while this poll was in flight.
            if (!isConnected(client) || client.version != subscriber.version()) return;
            if (version == null) {
                close(client, missingVersionStatus);
            } else if (!version.equals(client.version)) {
                sendVersion(client, version);
            }
        }
    }

    private String subscriptionSeason(String payload) {
        try {
            var body = subscriptionReader.readTree(payload);
            if (body == null || !body.isObject() || body.size() != 2) return null;
            var type = body.path("type");
            var code = body.path("seasonCode");
            if (!type.isString() || !"subscribe".equals(type.asString()) || !code.isString()) return null;
            String seasonCode = code.asString();
            return SeasonCode.isValid(seasonCode) ? seasonCode : null;
        } catch (JacksonException invalid) {
            return null;
        }
    }

    private Map<String, SeasonVersion> readVersions(List<String> seasonCodes) {
        return jdbc.sql("""
                SELECT s.code, snapshot.captured_at
                FROM lmuml.seasons s
                JOIN lmuml.competitions competition ON competition.id = s.competition_id
                LEFT JOIN lmuml.fixture_snapshot_times snapshot
                    ON snapshot.league_id = competition.api_football_id AND snapshot.season = s.start_year
                WHERE s.code IN (:seasonCodes)
                """)
                .param("seasonCodes", seasonCodes)
                .query((row, index) -> {
                    var capturedAt = row.getObject("captured_at", OffsetDateTime.class);
                    return new SeasonVersion(row.getString("code"), capturedAt == null
                            ? null : capturedAt.toInstant().toString());
                })
                .list().stream().collect(Collectors.toMap(SeasonVersion::seasonCode, version -> version));
    }

    private void sendVersion(Client client, SeasonVersion version) {
        try {
            var update = new FixtureUpdate("fixtures", version.capturedAt());
            client.session.sendMessage(new TextMessage(json.writeValueAsString(update)));
            client.version = version;
        } catch (IOException | IllegalStateException disconnected) {
            close(client, CloseStatus.SERVER_ERROR);
        }
    }

    private boolean isConnected(Client client) {
        return clients.get(client.session.getId()) == client && client.session.isOpen();
    }

    private void close(Client client, CloseStatus status) {
        synchronized (client) {
            if (!clients.remove(client.session.getId(), client)) return;
            try {
                client.session.close(status);
            } catch (IOException | IllegalStateException disconnected) {
                // The session has already been removed from the publisher.
            }
        }
    }

    @EventListener(ContextClosedEvent.class)
    void closeConnections() {
        synchronized (lifecycleLock) {
            closing = true;
        }
        clients.values().forEach(client -> close(client, CloseStatus.GOING_AWAY));
    }

    private record SeasonVersion(String seasonCode, String capturedAt) {}

    private record FixtureUpdate(String type, @JsonInclude(JsonInclude.Include.ALWAYS) String fixturesCapturedAt) {}

    private record Subscriber(Client client, SeasonVersion version) {}

    private static final class Client {
        private final WebSocketSession session;
        private final long openedAt = System.nanoTime();
        private volatile long lastPongAt = openedAt;
        private long lastPingAt = openedAt;
        private long subscriptionStartedAt = openedAt;
        private SeasonVersion version;

        private Client(WebSocketSession session) {
            this.session = session;
        }
    }
}
