package pl.lmuml.player;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.UUID;
import java.util.regex.Pattern;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.TransientDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ProblemDetail;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.transaction.CannotCreateTransactionException;
import org.springframework.web.ErrorResponseException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import tools.jackson.databind.JsonNode;

import static pl.lmuml.player.PlayerPredictionsStore.*;

@RestController
@RequestMapping("/api/v1/player/betting-rounds/{roundId}/predictions")
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class PlayerPredictionsController {

    private static final int MAX_BATCH_SIZE = 256;
    private static final Pattern MATCH_ID = Pattern.compile(
            "[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}");

    private final PlayerPredictionsStore store;

    PlayerPredictionsController(PlayerPredictionsStore store) {
        this.store = store;
    }

    @GetMapping
    ReadResult find(@AuthenticationPrincipal PlayerPrincipal player, @PathVariable UUID roundId) {
        return store.find(player.id(), roundId).orElseThrow(PlayerPredictionsController::roundNotFound);
    }

    @PostMapping(consumes = MediaType.APPLICATION_JSON_VALUE)
    SaveResult save(@AuthenticationPrincipal PlayerPrincipal player, @PathVariable UUID roundId,
            @RequestBody JsonNode body) {
        List<Prediction> predictions = parsePredictions(body.path("predictions"));
        return store.save(player.id(), roundId, predictions).orElseThrow(PlayerPredictionsController::roundNotFound);
    }

    private static List<Prediction> parsePredictions(JsonNode values) {
        if (!values.isArray() || values.isEmpty() || values.size() > MAX_BATCH_SIZE) {
            throw requestError(HttpStatus.BAD_REQUEST, "Podaj od 1 do %d typów.".formatted(MAX_BATCH_SIZE));
        }
        var ids = new HashSet<UUID>();
        var predictions = new ArrayList<Prediction>(values.size());
        for (JsonNode value : values) {
            JsonNode matchId = value.path("matchId");
            if (!matchId.isString() || !MATCH_ID.matcher(matchId.asString()).matches()) {
                throw requestError(HttpStatus.BAD_REQUEST, "Typ musi wskazywać poprawny identyfikator meczu.");
            }
            UUID id = UUID.fromString(matchId.asString());
            if (!ids.add(id)) {
                throw requestError(HttpStatus.BAD_REQUEST, "Podaj tylko jeden typ dla każdego meczu.");
            }
            predictions.add(new Prediction(id, goals(value.path("homeGoals")), goals(value.path("awayGoals"))));
        }
        return predictions;
    }

    private static int goals(JsonNode value) {
        if (value.isIntegralNumber() && value.canConvertToLong()) {
            long goals = value.asLong();
            if (goals >= 0 && goals <= 99) return (int) goals;
        }
        throw requestError(HttpStatus.BAD_REQUEST, "Podaj liczbę goli od 0 do 99 dla obu drużyn.");
    }

    @ExceptionHandler(ErrorResponseException.class)
    ProblemDetail requestError(ErrorResponseException error) {
        return error.getBody();
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    ProblemDetail invalidRequest() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.BAD_REQUEST, "Sprawdź format zapisanych typów.");
    }

    @ExceptionHandler({DataAccessResourceFailureException.class, TransientDataAccessException.class,
            CannotCreateTransactionException.class})
    ProblemDetail databaseUnavailable() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.SERVICE_UNAVAILABLE, "Typy są chwilowo niedostępne.");
    }

    @ExceptionHandler(DataAccessException.class)
    ProblemDetail databaseFailure() {
        return ProblemDetail.forStatusAndDetail(HttpStatus.INTERNAL_SERVER_ERROR, "Nie udało się obsłużyć typów.");
    }

    private static ErrorResponseException roundNotFound() {
        return requestError(HttpStatus.NOT_FOUND, "Nie znaleziono opublikowanej kolejki.");
    }

    private static ErrorResponseException requestError(HttpStatus status, String detail) {
        return new ErrorResponseException(status, ProblemDetail.forStatusAndDetail(status, detail), null);
    }
}
