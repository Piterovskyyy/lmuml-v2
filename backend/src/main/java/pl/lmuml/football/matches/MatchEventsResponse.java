package pl.lmuml.football.matches;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

record MatchEventsResponse(UUID matchId, Instant capturedAt, List<Event> events) {

    record Event(int minute, Integer addedTime, MatchEventSide side, MatchEventKind kind,
            String playerName, String relatedPlayerName) {}
}
