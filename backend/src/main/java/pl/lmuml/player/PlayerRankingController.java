package pl.lmuml.player;

import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import pl.lmuml.football.seasons.SeasonCode;

@RestController
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class PlayerRankingController {

    private final PlayerRankingQuery query;

    PlayerRankingController(PlayerRankingQuery query) {
        this.query = query;
    }

    @GetMapping("/api/v1/player/seasons/{seasonCode}/ranking")
    PlayerRankingQuery.Ranking ranking(@AuthenticationPrincipal PlayerPrincipal player, @PathVariable String seasonCode,
            @RequestParam(required = false) UUID roundId,
            @RequestParam(defaultValue = "POINTS") PredictionLeaderboard.Sort sort) {
        if (!SeasonCode.isValid(seasonCode)) {
            throw requestError(HttpStatus.BAD_REQUEST, "Podaj poprawny kod sezonu.");
        }
        return query.find(seasonCode, roundId, player.id(), sort).orElseThrow(() ->
                requestError(HttpStatus.NOT_FOUND, "Nie znaleziono sezonu lub opublikowanej kolejki."));
    }

    @ExceptionHandler(ErrorResponseException.class)
    ProblemDetail requestError(ErrorResponseException error) {
        return error.getBody();
    }

    @ExceptionHandler({DataAccessResourceFailureException.class, TransientDataAccessException.class,
            CannotCreateTransactionException.class})
    ProblemDetail databaseUnavailable() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, "Ranking jest chwilowo niedostępny.");
    }

    @ExceptionHandler(DataAccessException.class)
    ProblemDetail databaseFailure() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Nie udało się odczytać rankingu.");
    }

    private static ErrorResponseException requestError(HttpStatus status, String detail) {
        return new ErrorResponseException(status, ProblemDetail.forStatusAndDetail(status, detail), null);
    }
}
