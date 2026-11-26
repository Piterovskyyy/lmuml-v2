package pl.lmuml.player;

import java.util.Locale;
import java.util.UUID;
import java.util.regex.Pattern;
import javax.sql.DataSource;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.security.core.userdetails.UserDetailsService;
import org.springframework.security.core.userdetails.UsernameNotFoundException;
import org.springframework.security.crypto.password.Pbkdf2PasswordEncoder;
import org.springframework.stereotype.Service;

@Service
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
public final class PlayerUserDetailsService implements UserDetailsService {

    private static final int MIN_PASSWORD_LENGTH = 8;
    private static final int MAX_PASSWORD_LENGTH = 128;
    private static final String EMAIL_ATOM = "[a-z0-9!#$%&'*+/=?^_`{|}~-]+";
    private static final String DOMAIN_LABEL = "[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?";
    private static final Pattern EMAIL = Pattern.compile(
            EMAIL_ATOM + "(?:\\." + EMAIL_ATOM + ")*@" + DOMAIN_LABEL + "(?:\\." + DOMAIN_LABEL + ")+");
    private static final String UPDATE_PASSWORD = """
            UPDATE lmuml.players
            SET password_hash = :hash, credential_version = credential_version + 1,
                password_reset_token_digest = NULL
            """;
    private static final String VALID_RESET = """
            password_reset_token_digest = :digest
            AND password_reset_requested_at > CURRENT_TIMESTAMP - INTERVAL '30 minutes'
            """;

    private final JdbcClient jdbc;
    private final Pbkdf2PasswordEncoder passwords = Pbkdf2PasswordEncoder.defaultsForSpringSecurity_v5_8();

    public PlayerUserDetailsService(DataSource source) {
        jdbc = JdbcClient.create(source);
    }

    @Override
    public PlayerPrincipal loadUserByUsername(String email) {
        String normalizedEmail = normalizeEmail(email);
        if (validEmail(normalizedEmail)) {
            return jdbc.sql("""
                    SELECT id, email, display_name, password_hash, credential_version
                    FROM lmuml.players WHERE email = :email
                    """)
                    .param("email", normalizedEmail)
                    .query((row, number) -> new PlayerPrincipal(row.getObject("id", UUID.class), row.getString("email"),
                            row.getString("display_name"), row.getString("password_hash"),
                            row.getLong("credential_version")))
                    .optional()
                    .orElseThrow(PlayerUserDetailsService::unknownAccount);
        }
        throw unknownAccount();
    }

    void register(String email, String displayName, String password) {
        String normalizedEmail = normalizeEmail(email);
        if (!validEmail(normalizedEmail)) {
            throw new InvalidRegistration("Podaj poprawny adres e-mail.");
        }
        String name = displayName == null ? "" : displayName.strip();
        int nameLength = name.codePointCount(0, name.length());
        if (nameLength < 2 || nameLength > 40 || name.codePoints().anyMatch(Character::isISOControl)) {
            throw new InvalidRegistration("Podaj nazwę gracza od 2 do 40 znaków.");
        }
        if (!validNewPassword(password)) {
            throw new InvalidRegistration("Podaj hasło od %d do %d znaków."
                    .formatted(MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH));
        }

        int created = jdbc.sql("""
                INSERT INTO lmuml.players (id, email, display_name, password_hash)
                VALUES (:id, :email, :displayName, :passwordHash)
                ON CONFLICT (email) DO NOTHING
                """)
                .param("id", UUID.randomUUID())
                .param("email", normalizedEmail)
                .param("displayName", name)
                .param("passwordHash", passwords.encode(password))
                .update();
        if (created == 0) {
            throw new DuplicateEmail();
        }
    }

    public boolean isCurrentSession(PlayerPrincipal player) {
        return jdbc.sql("""
                SELECT 1 FROM lmuml.players WHERE id = :id AND credential_version = :version
                """)
                .param("id", player.id())
                .param("version", player.credentialVersion())
                .query(Integer.class).optional().isPresent();
    }

    PasswordChangeResult changePassword(PlayerPrincipal player, String currentPassword, String newPassword) {
        if (!validNewPassword(newPassword)) {
            return PasswordChangeResult.INVALID_NEW_PASSWORD;
        }
        if (currentPassword == null || passwordLength(currentPassword) > MAX_PASSWORD_LENGTH) {
            return PasswordChangeResult.WRONG_CURRENT_PASSWORD;
        }

        String currentHash = jdbc.sql("""
                SELECT password_hash FROM lmuml.players WHERE id = :id AND credential_version = :version
                """)
                .param("id", player.id())
                .param("version", player.credentialVersion())
                .query(String.class).optional().orElse(null);
        if (currentHash == null) {
            return PasswordChangeResult.STALE_SESSION;
        }
        if (!passwords.matches(currentPassword, currentHash)) {
            return PasswordChangeResult.WRONG_CURRENT_PASSWORD;
        }

        // Two concurrent changes using the same credentials cannot both succeed.
        int changed = jdbc.sql(UPDATE_PASSWORD + """
                WHERE id = :id AND credential_version = :version
                """)
                .param("hash", passwords.encode(newPassword))
                .param("id", player.id())
                .param("version", player.credentialVersion())
                .update();
        return changed == 1 ? PasswordChangeResult.CHANGED : PasswordChangeResult.STALE_SESSION;
    }

    boolean storePasswordReset(String email, byte[] digest) {
        return jdbc.sql("""
                UPDATE lmuml.players
                SET password_reset_token_digest = :digest, password_reset_requested_at = CURRENT_TIMESTAMP
                WHERE email = :email AND (password_reset_requested_at IS NULL
                    OR password_reset_requested_at <= CURRENT_TIMESTAMP - INTERVAL '1 minute')
                """)
                .param("email", email)
                .param("digest", digest)
                .update() == 1;
    }

    boolean resetPassword(byte[] digest, String newPassword) {
        if (!validNewPassword(newPassword)) {
            return false;
        }
        // Reject an unknown or expired link before doing the expensive password hash.
        boolean exists = jdbc.sql("SELECT EXISTS (SELECT 1 FROM lmuml.players WHERE " + VALID_RESET + ")")
                .param("digest", digest)
                .query(Boolean.class).single();
        if (!exists) {
            return false;
        }
        // Recheck after hashing. The update consumes the link and revokes sessions together.
        return jdbc.sql(UPDATE_PASSWORD + "WHERE " + VALID_RESET)
                .param("digest", digest)
                .param("hash", passwords.encode(newPassword))
                .update() == 1;
    }

    private static boolean validNewPassword(String password) {
        int length = passwordLength(password);
        return length >= MIN_PASSWORD_LENGTH && length <= MAX_PASSWORD_LENGTH && !password.isBlank();
    }

    private static int passwordLength(String password) {
        return password == null ? 0 : password.codePointCount(0, password.length());
    }

    static String normalizeEmail(String email) {
        return email == null ? "" : email.strip().toLowerCase(Locale.ROOT);
    }

    static boolean validEmail(String email) {
        return email.length() <= 254 && email.indexOf('@') <= 64 && EMAIL.matcher(email).matches();
    }

    private static UsernameNotFoundException unknownAccount() {
        return new UsernameNotFoundException("Player account not found");
    }

    static final class InvalidRegistration extends RuntimeException {
        InvalidRegistration(String message) {
            super(message);
        }
    }

    static final class DuplicateEmail extends RuntimeException {}

    enum PasswordChangeResult { CHANGED, INVALID_NEW_PASSWORD, WRONG_CURRENT_PASSWORD, STALE_SESSION }
}
