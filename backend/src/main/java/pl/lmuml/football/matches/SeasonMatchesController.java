package pl.lmuml.football.matches;

import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.QueryTimeoutException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import pl.lmuml.football.seasons.SeasonCode;

@RestController
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class SeasonMatchesController {

    private final SeasonMatchesQuery query;
    private final SeasonMatchesReadService catalog;
    private final MatchStatisticsQuery statistics;
    private final MatchEventsQuery events;
    private final MatchLineupsQuery lineups;
    private final MatchPlayerStatisticsQuery playerStatistics;

    SeasonMatchesController(SeasonMatchesQuery query, SeasonMatchesReadService catalog, MatchStatisticsQuery statistics,
            MatchEventsQuery events, MatchLineupsQuery lineups, MatchPlayerStatisticsQuery playerStatistics) {
        this.query = query;
        this.catalog = catalog;
        this.statistics = statistics;
        this.events = events;
        this.lineups = lineups;
        this.playerStatistics = playerStatistics;
    }

    @GetMapping("/api/v1/seasons/{seasonCode}/matches")
    SeasonMatchesResponse matches(@PathVariable String seasonCode) {
        validateSeasonCode(seasonCode);
        return catalog.find(seasonCode).orElseThrow(SeasonMatchesController::seasonNotFound);
    }

    @GetMapping("/api/v1/seasons/{seasonCode}/betting-rounds")
    SeasonBettingRoundsResponse bettingRounds(@PathVariable String seasonCode) {
        validateSeasonCode(seasonCode);
        return query.findBettingRoundsBySeasonCode(seasonCode).orElseThrow(SeasonMatchesController::seasonNotFound);
    }

    @GetMapping("/api/v1/matches/{matchId}/statistics")
    ResponseEntity<MatchStatisticsResponse> statistics(@PathVariable String matchId) {
        var result = statistics.find(parseMatchId(matchId)).orElseThrow(() ->
                new ErrorResponseException(HttpStatus.NOT_FOUND,
                        problem(HttpStatus.NOT_FOUND, "Match statistics not found",
                                "There is no saved comparison for the requested match."), null));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
    }

    @GetMapping("/api/v1/matches/{matchId}/events")
    ResponseEntity<MatchEventsResponse> events(@PathVariable String matchId) {
        var result = events.find(parseMatchId(matchId)).orElseThrow(() ->
                new ErrorResponseException(HttpStatus.NOT_FOUND,
                        problem(HttpStatus.NOT_FOUND, "Match events not found",
                                "There is no saved timeline for the requested match."), null));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
    }

    @GetMapping("/api/v1/matches/{matchId}/lineups")
    ResponseEntity<MatchLineupsResponse> lineups(@PathVariable String matchId) {
        var result = lineups.find(parseMatchId(matchId)).orElseThrow(() ->
                new ErrorResponseException(HttpStatus.NOT_FOUND,
                        problem(HttpStatus.NOT_FOUND, "Match lineups not found",
                                "There are no saved lineups for the requested match."), null));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
    }

    @GetMapping("/api/v1/matches/{matchId}/player-statistics")
    ResponseEntity<?> playerStatistics(@PathVariable String matchId) {
        var result = playerStatistics.find(parseMatchId(matchId));
        if (result.isEmpty()) {
            var error = problem(HttpStatus.NOT_FOUND, "Match player statistics not found",
                    "There are no saved player statistics for the requested match.");
            return ResponseEntity.of(error).cacheControl(CacheControl.noStore()).build();
        }
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result.get());
    }

    private static UUID parseMatchId(String value) {
        if (value.length() == 36) {
            try {
                UUID id = UUID.fromString(value);
                if (id.toString().equalsIgnoreCase(value)) return id;
            } catch (IllegalArgumentException ignored) {
                // Keep the same public response for all malformed identifiers.
            }
        }
        throw new ErrorResponseException(HttpStatus.BAD_REQUEST,
                problem(HttpStatus.BAD_REQUEST, "Invalid match ID", "Use a UUID to identify the match."), null);
    }

    private static void validateSeasonCode(String seasonCode) {
        if (!SeasonCode.isValid(seasonCode)) {
            var error = problem(HttpStatus.BAD_REQUEST, "Invalid season code",
                    "Use up to 64 lowercase letters, digits and single hyphens between segments.");
            throw new ErrorResponseException(HttpStatus.BAD_REQUEST, error, null);
        }
    }

    private static ErrorResponseException seasonNotFound() {
        return new ErrorResponseException(HttpStatus.NOT_FOUND,
                problem(HttpStatus.NOT_FOUND, "Season not found", "The requested season does not exist."), null);
    }

    @ExceptionHandler(ErrorResponseException.class)
    ProblemDetail requestError(ErrorResponseException error) {
        return error.getBody();
    }

    @ExceptionHandler({DataAccessResourceFailureException.class, QueryTimeoutException.class,
            CannotCreateTransactionException.class})
    ProblemDetail databaseUnavailable() {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "Match data unavailable",
                "Match data is temporarily unavailable. Please try again later.");
    }

    @ExceptionHandler(DataAccessException.class)
    ProblemDetail databaseFailure() {
        // A broken query or schema is an internal error, not a temporary connection failure.
        return problem(HttpStatus.INTERNAL_SERVER_ERROR, "Match data could not be read",
                "An unexpected error occurred while reading match data.");
    }

    private static ProblemDetail problem(HttpStatus status, String title, String detail) {
        ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, detail);
        problem.setTitle(title);
        return problem;
    }
}
