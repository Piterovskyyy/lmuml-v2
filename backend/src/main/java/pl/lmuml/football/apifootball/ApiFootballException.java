package pl.lmuml.football.apifootball;

public final class ApiFootballException extends RuntimeException {

    public enum Kind { HTTP_ERROR, API_ERROR, INVALID_RESPONSE, TRANSPORT_ERROR }

    private final Kind kind;
    private final Integer httpStatus;
    private final ApiFootballResponse.Quota quota;

    ApiFootballException(Kind kind, Integer httpStatus, ApiFootballResponse.Quota quota) {
        // Provider bodies and underlying exception messages may contain sensitive data.
        super("API-Football request failed: " + kind
                + (httpStatus == null ? "." : " (HTTP " + httpStatus + ")."));
        this.kind = kind;
        this.httpStatus = httpStatus;
        this.quota = quota;
    }

    public Kind kind() { return kind; }

    public Integer httpStatus() { return httpStatus; }

    public ApiFootballResponse.Quota quota() { return quota; }
}
