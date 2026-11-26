package pl.lmuml.football.matches;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.NullSource;
import org.junit.jupiter.params.provider.ValueSource;

class MatchStatusTest {

    @ParameterizedTest
    @CsvSource({
            "TBD, TIME_UNCONFIRMED,",
            "NS, SCHEDULED,",
            "1H, LIVE,",
            "2H, LIVE,",
            "ET, LIVE,",
            "P, LIVE,",
            "LIVE, LIVE,",
            "HT, BREAK,",
            "BT, BREAK,",
            "SUSP, SUSPENDED,",
            "INT, SUSPENDED,",
            "FT, FINISHED, REGULATION_TIME",
            "AET, FINISHED, EXTRA_TIME",
            "PEN, FINISHED, PENALTIES",
            "PST, POSTPONED,",
            "CANC, CANCELLED,",
            "ABD, ABANDONED,",
            "AWD, AWARDED,",
            "WO, AWARDED,"
    })
    void mapsProviderCodesToPresentation(
            String code, MatchStatus.State expectedState, MatchStatus.FinishType expectedFinishType) {
        MatchStatus status = MatchStatus.fromApiFootball(code, 90, 7);

        assertThat(status.state()).isEqualTo(expectedState);
        assertThat(status.finishType()).isEqualTo(expectedFinishType);
        assertThat(status.elapsedMinutes()).isEqualTo(90);
        assertThat(status.extraMinutes()).isEqualTo(7);
    }

    @ParameterizedTest
    @NullSource
    @ValueSource(strings = {"FUTURE_STATUS", "", "ft"})
    void treatsUnknownOrMissingCodesAsUnknownAndPreservesMissingMinutes(String code) {
        MatchStatus status = MatchStatus.fromApiFootball(code, null, null);

        assertThat(status.state()).isEqualTo(MatchStatus.State.UNKNOWN);
        assertThat(status.finishType()).isNull();
        assertThat(status.elapsedMinutes()).isNull();
        assertThat(status.extraMinutes()).isNull();
    }
}
