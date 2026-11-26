package pl.lmuml.football.seasons;

import javax.sql.DataSource;

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
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

@RestController
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class SeasonSyncStatusController {

    private final SeasonSyncStatusStore store;

    SeasonSyncStatusController(DataSource dataSource) {
        store = new SeasonSyncStatusStore(dataSource);
    }

    @GetMapping("/api/admin/seasons/{seasonCode}/sync-status")
    ResponseEntity<SeasonSyncStatusStore.Status> status(@PathVariable String seasonCode) {
        var status = store.find(seasonCode).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.NOT_FOUND, "Nie znaleziono sezonu w katalogu."));
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(status);
    }

    @ExceptionHandler({DataAccessResourceFailureException.class, TransientDataAccessException.class})
    ProblemDetail databaseUnavailable() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE,
                "Stan synchronizacji jest chwilowo niedostępny.");
    }

    @ExceptionHandler(DataAccessException.class)
    ProblemDetail databaseFailure() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR,
                "Nie udało się odczytać stanu synchronizacji.");
    }
}
