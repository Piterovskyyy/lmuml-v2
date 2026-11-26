package pl.lmuml.football.apifootball;

import java.util.List;

import org.springframework.http.HttpHeaders;
import pl.lmuml.football.apifootball.dto.ApiFootballEnvelope.Paging;

public record ApiFootballResponse<T>(List<T> items, Paging paging, Quota quota) {

    public ApiFootballResponse {
        items = List.copyOf(items);
    }

    public record Quota(Integer dailyLimit, Integer dailyRemaining,
                       Integer minuteLimit, Integer minuteRemaining) {

        static Quota from(HttpHeaders headers) {
            return new Quota(number(headers, "x-ratelimit-requests-limit"),
                    number(headers, "x-ratelimit-requests-remaining"),
                    number(headers, "x-ratelimit-limit"),
                    number(headers, "x-ratelimit-remaining"));
        }

        private static Integer number(HttpHeaders headers, String name) {
            String value = headers.getFirst(name);
            if (value == null) return null;
            try {
                int number = Integer.parseInt(value);
                return number >= 0 ? number : null;
            } catch (NumberFormatException ignored) {
                return null;
            }
        }
    }
}
