package pl.lmuml.player;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class PlayerRegistrationController {

    private final PlayerUserDetailsService players;

    PlayerRegistrationController(PlayerUserDetailsService players) {
        this.players = players;
    }

    @PostMapping(path = "/api/v1/player/register", consumes = MediaType.APPLICATION_JSON_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    void register(@RequestBody RegistrationRequest request) {
        players.register(text(request.email()), text(request.displayName()), text(request.password()));
    }

    @ExceptionHandler(PlayerUserDetailsService.InvalidRegistration.class)
    ProblemDetail invalidRegistration(PlayerUserDetailsService.InvalidRegistration error) {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, error.getMessage());
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ProblemDetail invalidRequest() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Sprawdź dane rejestracji i spróbuj ponownie.");
    }

    @ExceptionHandler(PlayerUserDetailsService.DuplicateEmail.class)
    ProblemDetail duplicateEmail() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.CONFLICT, "Konto z tym adresem e-mail już istnieje.");
    }

    @ExceptionHandler({DataAccessResourceFailureException.class, TransientDataAccessException.class})
    ProblemDetail databaseUnavailable() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, "Rejestracja jest chwilowo niedostępna.");
    }

    @ExceptionHandler(DataAccessException.class)
    ProblemDetail databaseFailure() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Nie udało się utworzyć konta.");
    }

    private static String text(JsonNode node) {
        return node != null && node.isString() ? node.asString() : null;
    }

    record RegistrationRequest(JsonNode email, JsonNode displayName, JsonNode password) {
        @Override
        public String toString() {
            return "RegistrationRequest[redacted]";
        }
    }
}
