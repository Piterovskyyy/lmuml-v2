package pl.lmuml.player;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.RejectedExecutionException;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;
import java.util.regex.Pattern;

import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.dao.DataAccessException;
import org.springframework.mail.MailException;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
@ConditionalOnProperty(name = "lmuml.player.password-reset.enabled", havingValue = "true")
final class PlayerPasswordResetService {

    private static final Logger LOG = LoggerFactory.getLogger(PlayerPasswordResetService.class);
    private static final Pattern RESET_TOKEN = Pattern.compile("[A-Za-z0-9_-]{43}");
    private static final SecureRandom RANDOM = new SecureRandom();

    private final PlayerUserDetailsService players;
    private final PlayerPasswordResetMail mail;
    private final URI publicOrigin;
    // A slow mail server cannot tie up HTTP threads or create an unbounded backlog.
    private final ThreadPoolExecutor requests = new ThreadPoolExecutor(1, 1, 0, TimeUnit.SECONDS,
            new ArrayBlockingQueue<>(32), Thread.ofPlatform().daemon().name("player-password-reset").factory());

    PlayerPasswordResetService(PlayerUserDetailsService players, PlayerPasswordResetMail mail,
            @Value("${lmuml.player.password-reset.public-url:}") String publicUrl) {
        this.players = players;
        this.mail = mail;
        this.publicOrigin = validateOrigin(publicUrl);
    }

    boolean request(String email) {
        String normalizedEmail = PlayerUserDetailsService.normalizeEmail(email);
        if (!PlayerUserDetailsService.validEmail(normalizedEmail)) {
            return true;
        }
        try {
            // Both known and unknown addresses take the same HTTP path.
            requests.execute(() -> sendIfAllowed(normalizedEmail));
            return true;
        } catch (RejectedExecutionException exception) {
            return false;
        }
    }

    boolean confirm(String token, String newPassword) {
        return token != null && RESET_TOKEN.matcher(token).matches()
                && players.resetPassword(digest(token), newPassword);
    }

    private void sendIfAllowed(String email) {
        byte[] randomBytes = new byte[32];
        RANDOM.nextBytes(randomBytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(randomBytes);
        try {
            if (players.storePasswordReset(email, digest(token))) {
                String url = publicOrigin.resolve("/#konto?reset=" + token).toASCIIString();
                mail.send(email, url);
            }
        } catch (DataAccessException | MailException exception) {
            // The exception may include message content or personal data.
            LOG.warn("Unable to process a player password reset request ({})", exception.getClass().getSimpleName());
        }
    }

    private static byte[] digest(String token) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(token.getBytes(StandardCharsets.US_ASCII));
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 is unavailable", exception);
        }
    }

    private static URI validateOrigin(String value) {
        URI origin = URI.create(value);
        boolean localHttp = "http".equalsIgnoreCase(origin.getScheme())
                && ("127.0.0.1".equals(origin.getHost()) || "localhost".equalsIgnoreCase(origin.getHost()));
        if (origin.getHost() == null || (!"https".equalsIgnoreCase(origin.getScheme()) && !localHttp)
                || origin.getUserInfo() != null || origin.getQuery() != null || origin.getFragment() != null
                || !(origin.getPath().isEmpty() || "/".equals(origin.getPath()))) {
            throw new IllegalArgumentException("Password reset requires an HTTPS public origin or local HTTP origin");
        }
        return origin;
    }

    @PreDestroy
    void close() {
        requests.shutdownNow();
    }
}
