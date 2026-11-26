package pl.lmuml.security;

import java.io.IOException;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.dao.DataAccessException;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.web.authentication.logout.LogoutHandler;
import org.springframework.web.filter.OncePerRequestFilter;
import pl.lmuml.player.PlayerPrincipal;
import pl.lmuml.player.PlayerUserDetailsService;

final class PlayerSessionVersionFilter extends OncePerRequestFilter {

    private final PlayerUserDetailsService players;
    private final LogoutHandler logout;
    private final LogoutHandler clearCsrf;

    PlayerSessionVersionFilter(PlayerUserDetailsService players, LogoutHandler logout, LogoutHandler clearCsrf) {
        this.players = players;
        this.logout = logout;
        this.clearCsrf = clearCsrf;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        var authentication = SecurityContextHolder.getContext().getAuthentication();
        if (authentication != null && authentication.getPrincipal() instanceof PlayerPrincipal player) {
            boolean current;
            try {
                current = players.isCurrentSession(player);
            } catch (DataAccessException exception) {
                response.setStatus(HttpServletResponse.SC_SERVICE_UNAVAILABLE);
                return;
            }
            if (!current) {
                logout.logout(request, response, authentication);
                clearCsrf.logout(request, response, authentication);
            }
        }
        chain.doFilter(request, response);
    }
}
