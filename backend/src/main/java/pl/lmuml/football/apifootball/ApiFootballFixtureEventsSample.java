package pl.lmuml.football.apifootball;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Objects;

import pl.lmuml.football.apifootball.dto.ApiFootballEvent;
import pl.lmuml.football.apifootball.dto.ApiFootballEvent.Person;
import pl.lmuml.football.matches.MatchEventKind;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import static pl.lmuml.football.apifootball.ApiFootballFixturePlayerData.cleanText;
import static pl.lmuml.football.apifootball.ApiFootballFixturePlayerData.positivePlayerId;
import static pl.lmuml.football.matches.MatchEventKind.*;

record ApiFootballFixtureEventsSample(long fixtureId, Instant capturedAt, List<Event> events) {

    private static final TypeReference<List<ApiFootballEvent>> EVENTS = new TypeReference<>() {};
    private static final Comparator<Event> CHRONOLOGICAL = Comparator.comparingInt(Event::minute)
            .thenComparingInt(event -> event.addedTime() == null ? 0 : event.addedTime());

    ApiFootballFixtureEventsSample {
        if (fixtureId <= 0) throw new IllegalArgumentException("A positive fixture ID is required.");
        capturedAt = Objects.requireNonNull(capturedAt).truncatedTo(ChronoUnit.MICROS);
        // Keep the provider's sequence for events within the same minute.
        events = events.stream().sorted(CHRONOLOGICAL).toList();
    }

    static ApiFootballFixtureEventsSample decode(long fixtureId, Instant capturedAt, JsonNode payload, JsonMapper json) {
        var response = ApiFootballFixturePayload.response(fixtureId, ApiFootballClient.FIXTURE_EVENTS_ENDPOINT,
                "fixture", payload);
        return decodeSection(fixtureId, capturedAt, response, json);
    }

    static ApiFootballFixtureEventsSample decodeSection(long fixtureId, Instant capturedAt, JsonNode items,
            JsonMapper json) {
        var events = ApiFootballFixturePayload.decodeArray(items, json, EVENTS).stream()
                .map(ApiFootballFixtureEventsSample::decodeEvent).toList();
        return new ApiFootballFixtureEventsSample(fixtureId, capturedAt, events);
    }

    private static Event decodeEvent(ApiFootballEvent event) {
        if (event == null || event.time() == null || event.time().elapsed() == null
                || event.type() == null || event.type().isBlank()) {
            throw new IllegalArgumentException("Fixture events require an elapsed minute and event type.");
        }
        MatchEventKind kind = kind(event.type(), event.detail());
        Long teamId = event.team() == null ? null : event.team().id();
        Person relatedPlayer = switch (kind) {
            case GOAL, PENALTY_GOAL, SUBSTITUTION -> event.assist();
            default -> null;
        };
        return new Event(event.time().elapsed(), event.time().extra(), teamId, kind, name(event.player()),
                name(relatedPlayer), playerId(event.player()), playerId(relatedPlayer));
    }

    private static MatchEventKind kind(String type, String detail) {
        String knownDetail = detail == null ? "" : detail.strip().toLowerCase(Locale.ROOT);
        return switch (type.strip().toLowerCase(Locale.ROOT)) {
            case "goal" -> switch (knownDetail) {
                case "normal goal" -> GOAL;
                case "own goal" -> OWN_GOAL;
                case "penalty" -> PENALTY_GOAL;
                case "missed penalty" -> MISSED_PENALTY;
                default -> UNKNOWN;
            };
            case "card" -> switch (knownDetail) {
                case "yellow card" -> YELLOW_CARD;
                case "yellow-red card", "second yellow card" -> SECOND_YELLOW_CARD;
                case "red card" -> RED_CARD;
                default -> UNKNOWN;
            };
            case "subst" -> SUBSTITUTION;
            case "var" -> switch (knownDetail) {
                case "goal cancelled", "goal canceled" -> GOAL_CANCELLED;
                case "penalty confirmed" -> PENALTY_CONFIRMED;
                case "penalty cancelled", "penalty canceled" -> PENALTY_CANCELLED;
                default -> VAR;
            };
            default -> UNKNOWN;
        };
    }

    private static String name(Person person) {
        return person == null ? null : cleanText(person.name());
    }

    private static Long playerId(Person person) {
        return person == null ? null : person.id();
    }

    record Event(int minute, Integer addedTime, Long providerTeamId, MatchEventKind kind,
                 String playerName, String relatedPlayerName, Long providerPlayerId, Long relatedProviderPlayerId) {
        Event {
            if (minute < 0 || (addedTime != null && addedTime < 0) || (providerTeamId != null && providerTeamId <= 0)) {
                throw new IllegalArgumentException("Fixture event contains an invalid time or team ID.");
            }
            Objects.requireNonNull(kind);
            providerPlayerId = positivePlayerId(providerPlayerId);
            relatedProviderPlayerId = positivePlayerId(relatedProviderPlayerId);
        }
    }
}
