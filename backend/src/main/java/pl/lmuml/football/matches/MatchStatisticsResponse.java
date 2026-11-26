package pl.lmuml.football.matches;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

record MatchStatisticsResponse(UUID matchId, Instant capturedAt, TeamStatistics home, TeamStatistics away) {

    record TeamStatistics(Integer shotsTotal, Integer shotsOnTarget, BigDecimal possessionPercent,
            Integer corners, Integer fouls, Integer saves) {}
}
