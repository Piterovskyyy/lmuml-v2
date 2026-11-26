package pl.lmuml.football.seasons;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;
import tools.jackson.databind.JsonNode;

@RestController
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class ActiveSeasonController {

    private final ActiveSeasonStore seasons;

    ActiveSeasonController(ActiveSeasonStore seasons) {
        this.seasons = seasons;
    }

    @GetMapping("/api/v1/seasons/active")
    ResponseEntity<Selection> read() {
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .body(new Selection(seasons.findCode().orElse(null)));
    }

    @PutMapping("/api/admin/seasons/active")
    Selection select(@RequestBody JsonNode body) {
        var code = body.path("seasonCode");
        if (!code.isString()) throw invalidCode();
        String seasonCode = code.asString();
        if (!SeasonCode.isValid(seasonCode)) {
            throw invalidCode();
        }
        if (!seasons.select(seasonCode)) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "Nie znaleziono sezonu w katalogu.");
        }
        return new Selection(seasonCode);
    }

    @ExceptionHandler({DataAccessResourceFailureException.class, TransientDataAccessException.class})
    ProblemDetail databaseUnavailable() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
                "Wybór aktywnego sezonu jest chwilowo niedostępny.");
    }

    @ExceptionHandler(DataAccessException.class)
    ProblemDetail databaseFailure() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR,
                "Nie udało się odczytać albo zapisać aktywnego sezonu.");
    }

    private static ResponseStatusException invalidCode() {
        return new ResponseStatusException(HttpStatus.BAD_REQUEST, "Sprawdź kod sezonu.");
    }

    record Selection(String seasonCode) {}
}
