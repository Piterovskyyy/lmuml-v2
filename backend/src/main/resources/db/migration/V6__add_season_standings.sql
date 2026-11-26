CREATE TABLE lmuml.season_standings (
    season_id UUID NOT NULL REFERENCES lmuml.seasons (id),
    team_id UUID NOT NULL REFERENCES lmuml.teams (id),
    position INTEGER NOT NULL CHECK (position > 0),
    played INTEGER NOT NULL CHECK (played >= 0),
    won INTEGER NOT NULL CHECK (won >= 0),
    drawn INTEGER NOT NULL CHECK (drawn >= 0),
    lost INTEGER NOT NULL CHECK (lost >= 0),
    goals_for INTEGER NOT NULL CHECK (goals_for >= 0),
    goals_against INTEGER NOT NULL CHECK (goals_against >= 0),
    goal_difference INTEGER NOT NULL,
    points INTEGER NOT NULL,
    form TEXT,
    captured_at TIMESTAMPTZ NOT NULL,
    PRIMARY KEY (season_id, team_id),
    UNIQUE (season_id, position)
);

ALTER TABLE lmuml.api_football_snapshots
    DROP CONSTRAINT api_football_snapshots_endpoint,
    ADD CONSTRAINT api_football_snapshots_endpoint CHECK (endpoint IN ('leagues', 'fixtures', 'standings'));

GRANT SELECT ON lmuml.season_standings TO "${runtime}";
GRANT SELECT, INSERT, DELETE ON lmuml.season_standings TO "${importer}";
