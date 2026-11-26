CREATE TABLE lmuml.match_event_snapshots (
    match_id UUID PRIMARY KEY REFERENCES lmuml.matches (id) ON DELETE CASCADE,
    captured_at TIMESTAMPTZ NOT NULL,
    home_team_id UUID NOT NULL REFERENCES lmuml.teams (id),
    away_team_id UUID NOT NULL REFERENCES lmuml.teams (id),
    CHECK (home_team_id <> away_team_id)
);

CREATE TABLE lmuml.match_events (
    match_id UUID NOT NULL REFERENCES lmuml.match_event_snapshots (match_id) ON DELETE CASCADE,
    position INTEGER NOT NULL CHECK (position >= 0),
    minute INTEGER NOT NULL CHECK (minute >= 0),
    added_time INTEGER CHECK (added_time >= 0),
    side TEXT CHECK (side IN ('HOME', 'AWAY')),
    kind TEXT NOT NULL CHECK (kind IN ('GOAL', 'OWN_GOAL', 'PENALTY_GOAL', 'MISSED_PENALTY',
        'YELLOW_CARD', 'SECOND_YELLOW_CARD', 'RED_CARD', 'SUBSTITUTION', 'VAR', 'GOAL_CANCELLED',
        'PENALTY_CONFIRMED', 'PENALTY_CANCELLED', 'UNKNOWN')),
    player_name TEXT CHECK (char_length(player_name) BETWEEN 1 AND 200),
    related_player_name TEXT CHECK (char_length(related_player_name) BETWEEN 1 AND 200),
    PRIMARY KEY (match_id, position)
);

GRANT SELECT ON lmuml.match_event_snapshots, lmuml.match_events TO "${runtime}";
GRANT SELECT, INSERT, UPDATE ON lmuml.match_event_snapshots TO "${importer}";
GRANT SELECT, INSERT, DELETE ON lmuml.match_events TO "${importer}";
