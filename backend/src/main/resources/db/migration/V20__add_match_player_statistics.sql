CREATE TABLE lmuml.match_player_stat_snapshots (
    match_id UUID PRIMARY KEY REFERENCES lmuml.matches (id) ON DELETE CASCADE,
    captured_at TIMESTAMPTZ NOT NULL,
    home_team_id UUID NOT NULL REFERENCES lmuml.teams (id),
    away_team_id UUID NOT NULL REFERENCES lmuml.teams (id),
    CHECK (home_team_id <> away_team_id)
);

CREATE TABLE lmuml.match_player_statistics (
    match_id UUID NOT NULL REFERENCES lmuml.match_player_stat_snapshots (match_id) ON DELETE CASCADE,
    side TEXT NOT NULL CHECK (side IN ('HOME', 'AWAY')),
    position_index INTEGER NOT NULL CHECK (position_index >= 0),
    provider_player_id BIGINT NOT NULL CHECK (provider_player_id > 0),
    name TEXT NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200 AND btrim(name) <> ''),
    shirt_number INTEGER CHECK (shirt_number >= 0),
    position TEXT NOT NULL CHECK (position IN ('GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD', 'UNKNOWN')),
    minutes INTEGER CHECK (minutes >= 0),
    rating NUMERIC(4, 2) CHECK (rating BETWEEN 0 AND 10),
    goals INTEGER CHECK (goals >= 0),
    assists INTEGER CHECK (assists >= 0),
    shots_total INTEGER CHECK (shots_total >= 0),
    shots_on_target INTEGER CHECK (shots_on_target >= 0),
    passes_total INTEGER CHECK (passes_total >= 0),
    key_passes INTEGER CHECK (key_passes >= 0),
    tackles INTEGER CHECK (tackles >= 0),
    saves INTEGER CHECK (saves >= 0),
    PRIMARY KEY (match_id, side, provider_player_id),
    UNIQUE (match_id, side, position_index)
);

GRANT SELECT ON lmuml.match_player_stat_snapshots, lmuml.match_player_statistics TO "${runtime}";
GRANT SELECT, INSERT, UPDATE ON lmuml.match_player_stat_snapshots TO "${importer}";
GRANT SELECT, INSERT, DELETE ON lmuml.match_player_statistics TO "${importer}";
