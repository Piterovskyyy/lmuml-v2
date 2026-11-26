package pl.lmuml.security;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.security.web.csrf.CsrfToken;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
class AdminSessionController {

    @GetMapping("/api/admin/session")
    SessionResponse session(HttpServletRequest request) {
        var token = (CsrfToken) request.getAttribute(CsrfToken.class.getName());
        return new SessionResponse(request.isUserInRole("ADMIN"), token.getToken());
    }

    record SessionResponse(boolean authenticated, String csrfToken) {}
}
