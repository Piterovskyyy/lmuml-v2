package pl.lmuml.player;

import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

@RestController
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class PlayersPredictionsController {

    private final PlayersPredictionsQuery query;

    PlayersPredictionsController(PlayersPredictionsQuery query) {
        this.query = query;
    }

    @GetMapping("/api/v1/player/betting-rounds/{roundId}/players-predictions")
    ResponseEntity<PlayersPredictionsQuery.ReadResult> find(@AuthenticationPrincipal PlayerPrincipal player,
            @PathVariable UUID roundId) {
        var result = query.find(roundId, player.id()).orElseThrow(() ->
                new ErrorResponseException(HttpStatus.NOT_FOUND,
                        ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Nie znaleziono opublikowanej rundy."), null));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(result);
    }

    @ExceptionHandler(ErrorResponseException.class)
    ProblemDetail requestError(ErrorResponseException error) {
        return error.getBody();
    }

    @ExceptionHandler({DataAccessResourceFailureException.class, TransientDataAccessException.class,
            CannotCreateTransactionException.class})
    ProblemDetail databaseUnavailable() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, "Typy graczy są chwilowo niedostępne.");
    }

    @ExceptionHandler(DataAccessException.class)
    ProblemDetail databaseFailure() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Nie udało się odczytać typów graczy.");
    }
}
