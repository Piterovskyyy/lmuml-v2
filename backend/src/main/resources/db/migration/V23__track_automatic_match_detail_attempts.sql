CREATE TABLE lmuml.match_detail_auto_attempts (
    match_id UUID PRIMARY KEY REFERENCES lmuml.matches (id) ON DELETE CASCADE,
    last_attempted_at TIMESTAMPTZ NOT NULL,
    attempt_count INTEGER NOT NULL CHECK (attempt_count BETWEEN 1 AND 2)
);

GRANT SELECT, INSERT, UPDATE (last_attempted_at, attempt_count)
    ON lmuml.match_detail_auto_attempts TO "${importer}";
