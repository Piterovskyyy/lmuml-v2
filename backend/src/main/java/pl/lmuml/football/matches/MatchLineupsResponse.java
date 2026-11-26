package pl.lmuml.football.matches;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

record MatchLineupsResponse(UUID matchId, Instant capturedAt, TeamLineup home, TeamLineup away) {
    record TeamLineup(String formation, String coachName, List<Player> starters, List<Player> substitutes) {}

    record Player(String name, Integer number, MatchLineupPosition position, Integer gridRow, Integer gridColumn,
                  BigDecimal rating, Integer goals, Integer assists,
                  Substitution substitutedOn, Substitution substitutedOff) {}

    record Substitution(int minute, Integer addedTime) {}
}
