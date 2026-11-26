CREATE TABLE lmuml.players (
    id UUID PRIMARY KEY,
    email TEXT NOT NULL UNIQUE CHECK (length(email) BETWEEN 3 AND 254 AND email = lower(btrim(email))),
    display_name TEXT NOT NULL CHECK (length(display_name) BETWEEN 2 AND 40 AND display_name = btrim(display_name)),
    password_hash TEXT NOT NULL CHECK (password_hash ~ '^[0-9a-f]{96}$'),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);

GRANT SELECT (id, email, display_name, password_hash), INSERT (id, email, display_name, password_hash)
    ON lmuml.players TO "${runtime}";
