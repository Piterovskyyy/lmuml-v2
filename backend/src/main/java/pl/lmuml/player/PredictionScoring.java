package pl.lmuml.player;

import java.util.Optional;

final class PredictionScoring {

    private PredictionScoring() {}

    static Optional<Settlement> settle(int predictedHome, int predictedAway, String status,
            Integer actualHome, Integer actualAway) {
        if (actualHome == null || actualAway == null) {
            return Optional.empty();
        }
        return switch (status) {
            case "FT", "AET", "PEN" -> Optional.of(settlement(predictedHome, predictedAway, actualHome, actualAway));
            case null, default -> Optional.empty();
        };
    }

    static long points(int predictedHome, int predictedAway, int actualHome, int actualAway) {
        return settlement(predictedHome, predictedAway, actualHome, actualAway).points();
    }

    private static Settlement settlement(int predictedHome, int predictedAway, int actualHome, int actualAway) {
        boolean correctOutcome = Integer.compare(predictedHome, predictedAway)
                == Integer.compare(actualHome, actualAway);
        boolean exactScore = predictedHome == actualHome && predictedAway == actualAway;
        int base = correctOutcome ? 10 : 5;
        long goalError = Math.abs((long) predictedHome - actualHome) + Math.abs((long) predictedAway - actualAway);
        return new Settlement(base - goalError, exactScore, correctOutcome);
    }

    record Settlement(long points, boolean exactScore, boolean correctOutcome) {}
}
