CREATE TABLE lmuml.match_statistics (
    match_id UUID NOT NULL REFERENCES lmuml.matches (id) ON DELETE CASCADE,
    side TEXT NOT NULL CHECK (side IN ('HOME', 'AWAY')),
    captured_at TIMESTAMPTZ NOT NULL,
    shots_total INTEGER CHECK (shots_total >= 0),
    shots_on_target INTEGER CHECK (shots_on_target >= 0),
    possession_percent NUMERIC(5, 2) CHECK (possession_percent BETWEEN 0 AND 100),
    corners INTEGER CHECK (corners >= 0),
    fouls INTEGER CHECK (fouls >= 0),
    saves INTEGER CHECK (saves >= 0),
    PRIMARY KEY (match_id, side)
);

GRANT SELECT ON lmuml.match_statistics TO "${runtime}";
GRANT SELECT, INSERT, UPDATE ON lmuml.match_statistics TO "${importer}";
