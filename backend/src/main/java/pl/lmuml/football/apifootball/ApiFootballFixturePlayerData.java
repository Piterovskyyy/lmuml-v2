package pl.lmuml.football.apifootball;

import java.util.List;
import java.util.Locale;
import java.util.function.BiPredicate;
import java.util.regex.Pattern;
import java.util.stream.IntStream;

import pl.lmuml.football.matches.MatchLineupPosition;

final class ApiFootballFixturePlayerData {

    private static final Pattern CONTROL_CHARACTERS = Pattern.compile("[\\p{Cc}\\p{Cf}]");
    private static final int MAX_TEXT_LENGTH = 200;

    private ApiFootballFixturePlayerData() {}

    static Long positivePlayerId(Long id) {
        return id != null && id > 0 ? id : null;
    }

    static <T> boolean canReplayRows(List<T> stored, List<T> incoming, BiPredicate<T, T> matches) {
        return stored.size() == incoming.size()
                && IntStream.range(0, stored.size()).allMatch(index -> matches.test(stored.get(index), incoming.get(index)));
    }

    static MatchLineupPosition position(String value) {
        return switch (value == null ? "" : value.strip().toUpperCase(Locale.ROOT)) {
            case "G" -> MatchLineupPosition.GOALKEEPER;
            case "D" -> MatchLineupPosition.DEFENDER;
            case "M" -> MatchLineupPosition.MIDFIELDER;
            case "F" -> MatchLineupPosition.FORWARD;
            default -> MatchLineupPosition.UNKNOWN;
        };
    }

    static String cleanText(String value) {
        if (value == null) return null;
        String cleaned = CONTROL_CHARACTERS.matcher(value).replaceAll("").strip();
        if (cleaned.isEmpty()) return null;
        if (cleaned.codePointCount(0, cleaned.length()) > MAX_TEXT_LENGTH) {
            return cleaned.substring(0, cleaned.offsetByCodePoints(0, MAX_TEXT_LENGTH)).stripTrailing();
        }
        return cleaned;
    }
}
