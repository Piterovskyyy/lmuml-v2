package pl.lmuml.player;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import static org.assertj.core.api.Assertions.assertThat;

class PredictionScoringTest {

    @ParameterizedTest
    @CsvSource({
        "2, 1, 2, 1, 10",
        "0, 0, 0, 0, 10",
        "1, 0, 2, 1, 8",
        "0, 1, 1, 2, 8",
        "1, 1, 2, 1, 4",
        "1, 2, 2, 1, 3",
        "7, 7, 2, 2, 0",
        "20, 20, 2, 1, -32"
    })
    void appliesTheLegacyPointsRule(int predictedHome, int predictedAway, int actualHome, int actualAway,
            long expected) {
        assertThat(PredictionScoring.points(predictedHome, predictedAway, actualHome, actualAway)).isEqualTo(expected);
    }
}
