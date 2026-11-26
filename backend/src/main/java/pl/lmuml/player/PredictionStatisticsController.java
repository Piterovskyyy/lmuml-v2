package pl.lmuml.player;

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

import pl.lmuml.football.seasons.SeasonCode;

@RestController
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class PredictionStatisticsController {

    private final PredictionStatisticsQuery query;

    PredictionStatisticsController(PredictionStatisticsQuery query) {
        this.query = query;
    }

    @GetMapping("/api/v1/seasons/{seasonCode}/prediction-statistics")
    ResponseEntity<PredictionStatisticsQuery.PublicStatistics> publicStatistics(@PathVariable String seasonCode) {
        validateSeasonCode(seasonCode);
        var statistics = query.findPublic(seasonCode).orElseThrow(PredictionStatisticsController::seasonNotFound);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(statistics);
    }

    @GetMapping("/api/v1/player/seasons/{seasonCode}/statistics")
    ResponseEntity<PredictionStatisticsQuery.PersonalStatistics> personalStatistics(
            @AuthenticationPrincipal PlayerPrincipal player, @PathVariable String seasonCode) {
        validateSeasonCode(seasonCode);
        var statistics = query.findPersonal(seasonCode, player.id())
                .orElseThrow(PredictionStatisticsController::seasonNotFound);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(statistics);
    }

    @ExceptionHandler(ErrorResponseException.class)
    ProblemDetail requestError(ErrorResponseException error) {
        return error.getBody();
    }

    @ExceptionHandler({DataAccessResourceFailureException.class, TransientDataAccessException.class,
            CannotCreateTransactionException.class})
    ProblemDetail databaseUnavailable() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, "Statystyki są chwilowo niedostępne.");
    }

    @ExceptionHandler(DataAccessException.class)
    ProblemDetail databaseFailure() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Nie udało się odczytać statystyk.");
    }

    private static void validateSeasonCode(String seasonCode) {
        if (!SeasonCode.isValid(seasonCode)) {
            throw new ErrorResponseException(HttpStatus.BAD_REQUEST,
                    ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Podaj poprawny kod sezonu."), null);
        }
    }

    private static ErrorResponseException seasonNotFound() {
        return new ErrorResponseException(HttpStatus.NOT_FOUND,
                ProblemDetail.forStatusAndDetail(HttpStatus.NOT_FOUND, "Nie znaleziono sezonu."), null);
    }
}
