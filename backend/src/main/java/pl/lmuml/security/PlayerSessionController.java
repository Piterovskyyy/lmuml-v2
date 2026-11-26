package pl.lmuml.security;

import java.util.UUID;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import pl.lmuml.player.PlayerPrincipal;

import static pl.lmuml.security.PlayerSecurityConfiguration.PLAYER_PATH;

@RestController
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
class PlayerSessionController {

    @GetMapping(PLAYER_PATH + "/session")
    SessionResponse session(CsrfToken token, @AuthenticationPrincipal PlayerPrincipal principal) {
        var player = principal == null ? null : new Player(principal.id(), principal.displayName(), principal.email());
        return new SessionResponse(player != null, token.getToken(), player);
    }

    record SessionResponse(boolean authenticated, String csrfToken, Player player) {}

    record Player(UUID id, String displayName, String email) {}
}
