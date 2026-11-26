package pl.lmuml.player;

import org.springframework.beans.factory.ObjectProvider;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
@RequestMapping(path = "/api/v1/player/password-reset", consumes = MediaType.APPLICATION_JSON_VALUE)
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class PlayerPasswordResetController {

    private final ObjectProvider<PlayerPasswordResetService> resetService;

    PlayerPasswordResetController(ObjectProvider<PlayerPasswordResetService> resetService) {
        this.resetService = resetService;
    }

    @PostMapping("/request")
    ResponseEntity<ProblemDetail> request(@RequestBody JsonNode body) {
        var reset = resetService.getIfAvailable();
        if (reset == null) {
            return unavailable();
        }
        if (!reset.request(text(body, "email"))) {
            return problem(HttpStatus.TOO_MANY_REQUESTS, "Za dużo prób. Spróbuj ponownie za chwilę.");
        }
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/confirm")
    ResponseEntity<ProblemDetail> confirm(@RequestBody JsonNode body) {
        var reset = resetService.getIfAvailable();
        if (reset == null) {
            return unavailable();
        }
        if (!reset.confirm(text(body, "token"), text(body, "newPassword"))) {
            return problem(HttpStatus.BAD_REQUEST, "Link jest nieaktualny albo nowe hasło jest nieprawidłowe.");
        }
        return ResponseEntity.noContent().build();
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ResponseEntity<ProblemDetail> invalidRequest() {
        return problem(HttpStatus.BAD_REQUEST, "Sprawdź dane formularza.");
    }

    @ExceptionHandler(DataAccessException.class)
    ResponseEntity<ProblemDetail> unavailable() {
        return problem(HttpStatus.SERVICE_UNAVAILABLE, "Odzyskiwanie hasła jest chwilowo niedostępne.");
    }

    private static ResponseEntity<ProblemDetail> problem(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(ProblemDetail.forStatusAndDetail(status, message));
    }

    private static String text(JsonNode body, String field) {
        var value = body.path(field);
        return value.isString() ? value.asString() : null;
    }
}
