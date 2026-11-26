ALTER TABLE lmuml.players
    ADD COLUMN password_reset_token_digest BYTEA CHECK (octet_length(password_reset_token_digest) = 32),
    ADD COLUMN password_reset_requested_at TIMESTAMPTZ,
    ADD CONSTRAINT players_password_reset_timestamp CHECK (
        password_reset_token_digest IS NULL OR password_reset_requested_at IS NOT NULL
    );

CREATE UNIQUE INDEX players_password_reset_token_idx ON lmuml.players (password_reset_token_digest)
    WHERE password_reset_token_digest IS NOT NULL;

GRANT SELECT (password_reset_token_digest, password_reset_requested_at),
    UPDATE (password_reset_token_digest, password_reset_requested_at) ON lmuml.players TO "${runtime}";
