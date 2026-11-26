package pl.lmuml.bettingrounds;

import java.util.List;
import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;

import static pl.lmuml.bettingrounds.AdminRoundModels.*;

@RestController
@RequestMapping("/api/admin/rounds")
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class AdminRoundsController {

    private final RoundBuilder rounds;

    AdminRoundsController(RoundBuilder rounds) {
        this.rounds = rounds;
    }

    @GetMapping("/seasons")
    List<Season> seasons() {
        return rounds.seasons();
    }

    @GetMapping
    Plan plan(@RequestParam String season) {
        return rounds.plan(season);
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    Round create(@RequestBody DraftRequest draft) {
        return rounds.create(draft);
    }

    @PostMapping("/{id}/publish")
    Round publish(@PathVariable UUID id) {
        return rounds.publish(id);
    }

    @PostMapping("/{id}/final")
    Round attachFinal(@PathVariable UUID id, @RequestBody AttachFinalRequest request) {
        return rounds.attachFinal(id, request.matchId());
    }

    @DeleteMapping("/{id}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void delete(@PathVariable UUID id) {
        rounds.delete(id);
    }

    @ExceptionHandler(RoundBuilder.Rejected.class)
    ProblemDetail rejected(RoundBuilder.Rejected error) {
        var status = switch (error.failure) {
            case INVALID -> HttpStatus.BAD_REQUEST;
            case MISSING -> HttpStatus.NOT_FOUND;
            case CONFLICT -> HttpStatus.CONFLICT;
        };
        return ProblemDetail.forStatusAndDetail(status, error.getMessage());
    }

    @ExceptionHandler({HttpMessageNotReadableException.class, MethodArgumentTypeMismatchException.class})
    ProblemDetail invalidRequest() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Sprawdź dane kolejki i spróbuj ponownie.");
    }

    @ExceptionHandler(DuplicateKeyException.class)
    ProblemDetail conflictingSelection() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT,
                "Numer kolejki, blok lub mecz jest już zajęty. Odśwież listę i sprawdź wybór.");
    }

    @ExceptionHandler({DataAccessResourceFailureException.class, TransientDataAccessException.class,
            CannotCreateTransactionException.class})
    ProblemDetail databaseUnavailable() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, "Kolejki są chwilowo niedostępne.");
    }

    @ExceptionHandler(DataAccessException.class)
    ProblemDetail databaseFailure() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Nie udało się wykonać operacji na kolejce.");
    }
}
