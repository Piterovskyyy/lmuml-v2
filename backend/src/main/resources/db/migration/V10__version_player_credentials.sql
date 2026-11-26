ALTER TABLE lmuml.players
    ADD COLUMN credential_version BIGINT NOT NULL DEFAULT 0 CHECK (credential_version >= 0);

GRANT SELECT (credential_version), UPDATE (password_hash, credential_version)
    ON lmuml.players TO "${runtime}";
