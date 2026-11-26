package pl.lmuml.football.matches;

/** Presentation of a provider status; it does not decide prediction deadlines or scoring. */
record MatchStatus(
        State state,
        FinishType finishType,
        Integer elapsedMinutes,
        Integer extraMinutes) {

    static MatchStatus fromApiFootball(String code, Integer elapsedMinutes, Integer extraMinutes) {
        State state = switch (code) {
            case null -> State.UNKNOWN;
            case "TBD" -> State.TIME_UNCONFIRMED;
            case "NS" -> State.SCHEDULED;
            case "1H", "2H", "ET", "P", "LIVE" -> State.LIVE;
            case "HT", "BT" -> State.BREAK;
            case "SUSP", "INT" -> State.SUSPENDED;
            case "FT", "AET", "PEN" -> State.FINISHED;
            case "PST" -> State.POSTPONED;
            case "CANC" -> State.CANCELLED;
            case "ABD" -> State.ABANDONED;
            case "AWD", "WO" -> State.AWARDED;
            default -> State.UNKNOWN;
        };
        FinishType finishType = switch (code) {
            case "FT" -> FinishType.REGULATION_TIME;
            case "AET" -> FinishType.EXTRA_TIME;
            case "PEN" -> FinishType.PENALTIES;
            case null, default -> null;
        };
        return new MatchStatus(state, finishType, elapsedMinutes, extraMinutes);
    }

    enum State {
        TIME_UNCONFIRMED,
        SCHEDULED,
        LIVE,
        BREAK,
        SUSPENDED,
        FINISHED,
        POSTPONED,
        CANCELLED,
        ABANDONED,
        AWARDED,
        UNKNOWN
    }

    enum FinishType {
        REGULATION_TIME,
        EXTRA_TIME,
        PENALTIES
    }
}
