package pl.lmuml.player;

import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

final class PredictionLeaderboard {

    private static final Comparator<PlayerTotal> BY_POINTS = Comparator.comparingLong(PlayerTotal::points).reversed();
    private static final Comparator<PlayerTotal> BY_EXACT_SCORES = Comparator.comparingInt(PlayerTotal::exactScores)
            .reversed();
    private static final Comparator<PlayerTotal> BY_OUTCOMES = Comparator.comparingInt(PlayerTotal::correctOutcomes)
            .reversed();

    private PredictionLeaderboard() {}

    static List<Placement> rank(Collection<PlayerTotal> totals, Sort sort) {
        Comparator<PlayerTotal> criteria = switch (sort) {
            case POINTS -> BY_POINTS.thenComparing(BY_EXACT_SCORES);
            case EXACT_SCORES -> BY_EXACT_SCORES.thenComparing(BY_POINTS);
            case OUTCOMES -> BY_OUTCOMES.thenComparing(BY_POINTS);
        };
        var ordered = totals.stream()
                .sorted(criteria.thenComparing(PlayerTotal::displayName).thenComparing(PlayerTotal::playerId))
                .toList();
        var placements = new ArrayList<Placement>(ordered.size());
        int position = 0;
        PlayerTotal previous = null;
        for (int index = 0; index < ordered.size(); index++) {
            PlayerTotal player = ordered.get(index);
            if (previous == null || criteria.compare(previous, player) != 0) {
                position = index + 1;
            }
            placements.add(new Placement(position, player));
            previous = player;
        }
        return List.copyOf(placements);
    }

    enum Sort { POINTS, EXACT_SCORES, OUTCOMES }

    record Placement(int position, PlayerTotal player) {}

    record PlayerTotal(UUID playerId, String displayName, long points, int exactScores, int correctOutcomes,
            int settledPredictions, long latestRoundPoints) {
        static PlayerTotal from(UUID playerId, String displayName, PredictionScoring.Settlement result,
                long latestRoundPoints) {
            return new PlayerTotal(playerId, displayName, result.points(), result.exactScore() ? 1 : 0,
                    result.correctOutcome() ? 1 : 0, 1, latestRoundPoints);
        }

        PlayerTotal add(PlayerTotal other) {
            return new PlayerTotal(playerId, displayName, points + other.points, exactScores + other.exactScores,
                    correctOutcomes + other.correctOutcomes, settledPredictions + other.settledPredictions,
                    latestRoundPoints + other.latestRoundPoints);
        }
    }
}
