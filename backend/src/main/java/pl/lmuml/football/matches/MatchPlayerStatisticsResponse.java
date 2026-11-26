package pl.lmuml.football.matches;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

record MatchPlayerStatisticsResponse(UUID matchId, Instant capturedAt, List<Player> home, List<Player> away) {
    record Player(String name, Integer number, MatchLineupPosition position, Integer minutes, BigDecimal rating,
                  Integer goals, Integer assists, Integer shotsTotal, Integer shotsOnTarget, Integer passesTotal,
                  Integer keyPasses, Integer tackles, Integer saves) {}
}
