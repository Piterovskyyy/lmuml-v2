package pl.lmuml.football.seasons;

import java.util.regex.Pattern;

public final class SeasonCode {

    private static final int MAX_LENGTH = 64;
    private static final Pattern FORMAT = Pattern.compile("[a-z0-9]+(-[a-z0-9]+)*");

    private SeasonCode() {}

    public static boolean isValid(String code) {
        return code != null && code.length() <= MAX_LENGTH && FORMAT.matcher(code).matches();
    }
}
