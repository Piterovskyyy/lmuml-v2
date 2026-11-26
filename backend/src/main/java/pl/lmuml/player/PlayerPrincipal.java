package pl.lmuml.player;

import java.io.Serial;
import java.util.List;
import java.util.UUID;

import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.userdetails.User;

public final class PlayerPrincipal extends User {

    @Serial
    private static final long serialVersionUID = 1L;

    private final UUID id;
    private final String displayName;
    private final long credentialVersion;

    public PlayerPrincipal(UUID id, String email, String displayName, String passwordHash, long credentialVersion) {
        super(email, passwordHash, List.of(new SimpleGrantedAuthority("ROLE_PLAYER")));
        this.id = id;
        this.displayName = displayName;
        this.credentialVersion = credentialVersion;
    }

    public UUID id() {
        return id;
    }

    public String email() {
        return getUsername();
    }

    public String displayName() {
        return displayName;
    }

    long credentialVersion() {
        return credentialVersion;
    }
}
