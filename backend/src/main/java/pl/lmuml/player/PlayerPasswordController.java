package pl.lmuml.player;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

@RestController
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class PlayerPasswordController {

    private final PlayerUserDetailsService players;

    PlayerPasswordController(PlayerUserDetailsService players) {
        this.players = players;
    }

    @PostMapping(path = "/api/v1/player/password", consumes = MediaType.APPLICATION_JSON_VALUE)
    ResponseEntity<ProblemDetail> changePassword(@AuthenticationPrincipal PlayerPrincipal player,
            @RequestBody PasswordChangeRequest request) {
        return switch (players.changePassword(player, text(request.currentPassword()), text(request.newPassword()))) {
            case CHANGED -> ResponseEntity.noContent().build();
            case INVALID_NEW_PASSWORD -> reject(HttpStatus.BAD_REQUEST, "Sprawdź nowe hasło.");
            case WRONG_CURRENT_PASSWORD -> reject(HttpStatus.UNPROCESSABLE_CONTENT, "Obecne hasło jest nieprawidłowe.");
            case STALE_SESSION -> reject(HttpStatus.CONFLICT, "Hasło zmieniło się. Zaloguj się ponownie.");
        };
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ProblemDetail invalidRequest() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Sprawdź pola formularza.");
    }

    @ExceptionHandler({DataAccessResourceFailureException.class, TransientDataAccessException.class})
    ProblemDetail databaseUnavailable() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, "Zmiana hasła jest chwilowo niedostępna.");
    }

    @ExceptionHandler(DataAccessException.class)
    ProblemDetail databaseFailure() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Nie udało się zmienić hasła.");
    }

    private static ResponseEntity<ProblemDetail> reject(HttpStatus status, String message) {
        return ResponseEntity.status(status).body(ProblemDetail.forStatusAndDetail(status, message));
    }

    private static String text(JsonNode node) {
        return node != null && node.isString() ? node.asString() : null;
    }

    record PasswordChangeRequest(JsonNode currentPassword, JsonNode newPassword) {
        @Override
        public String toString() {
            return "PasswordChangeRequest[redacted]";
        }
    }
}
