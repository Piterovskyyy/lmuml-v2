CREATE TABLE lmuml.season_sync_attempts (
    season_id UUID PRIMARY KEY REFERENCES lmuml.seasons (id) ON DELETE CASCADE,
    started_at TIMESTAMPTZ NOT NULL,
    finished_at TIMESTAMPTZ NOT NULL,
    outcome TEXT NOT NULL CHECK (outcome IN ('SUCCEEDED', 'FAILED')),
    CHECK (finished_at >= started_at)
);

GRANT SELECT ON lmuml.season_sync_attempts TO "${runtime}";
GRANT SELECT, INSERT, UPDATE (started_at, finished_at, outcome) ON lmuml.season_sync_attempts TO "${importer}";
