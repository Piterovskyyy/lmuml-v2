CREATE TABLE lmuml.match_lineups (
    match_id UUID NOT NULL REFERENCES lmuml.matches (id) ON DELETE CASCADE,
    side TEXT NOT NULL CHECK (side IN ('HOME', 'AWAY')),
    team_id UUID NOT NULL REFERENCES lmuml.teams (id),
    captured_at TIMESTAMPTZ NOT NULL,
    formation TEXT CHECK (char_length(formation) BETWEEN 1 AND 200),
    coach_name TEXT CHECK (char_length(coach_name) BETWEEN 1 AND 200),
    PRIMARY KEY (match_id, side)
);

CREATE TABLE lmuml.match_lineup_players (
    match_id UUID NOT NULL,
    side TEXT NOT NULL,
    starter BOOLEAN NOT NULL,
    position_index INTEGER NOT NULL CHECK (position_index >= 0),
    player_name TEXT NOT NULL CHECK (char_length(player_name) BETWEEN 1 AND 200 AND btrim(player_name) <> ''),
    shirt_number INTEGER CHECK (shirt_number >= 0),
    position TEXT NOT NULL CHECK (position IN ('GOALKEEPER', 'DEFENDER', 'MIDFIELDER', 'FORWARD', 'UNKNOWN')),
    grid_row INTEGER CHECK (grid_row > 0),
    grid_column INTEGER CHECK (grid_column > 0),
    PRIMARY KEY (match_id, side, starter, position_index),
    FOREIGN KEY (match_id, side) REFERENCES lmuml.match_lineups (match_id, side) ON DELETE CASCADE,
    CHECK ((grid_row IS NULL) = (grid_column IS NULL))
);

GRANT SELECT ON lmuml.match_lineups, lmuml.match_lineup_players TO "${runtime}";
GRANT SELECT, INSERT, UPDATE ON lmuml.match_lineups TO "${importer}";
GRANT SELECT, INSERT, DELETE ON lmuml.match_lineup_players TO "${importer}";
