CREATE TABLE lmuml.seasons (
    id UUID PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    name TEXT NOT NULL,
    CONSTRAINT seasons_code_format CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT seasons_name_nonblank CHECK (name ~ '[^[:space:]]')
);

CREATE TABLE lmuml.teams (
    id UUID PRIMARY KEY,
    name TEXT NOT NULL,
    CONSTRAINT teams_name_nonblank CHECK (name ~ '[^[:space:]]')
);

CREATE TABLE lmuml.matches (
    id UUID PRIMARY KEY,
    season_id UUID NOT NULL,
    matchday INTEGER NOT NULL,
    home_team_id UUID NOT NULL,
    away_team_id UUID NOT NULL,
    kickoff_at TIMESTAMPTZ NOT NULL,
    status TEXT NOT NULL DEFAULT 'SCHEDULED',
    CONSTRAINT matches_season_fk FOREIGN KEY (season_id) REFERENCES lmuml.seasons (id),
    CONSTRAINT matches_home_team_fk FOREIGN KEY (home_team_id) REFERENCES lmuml.teams (id),
    CONSTRAINT matches_away_team_fk FOREIGN KEY (away_team_id) REFERENCES lmuml.teams (id),
    CONSTRAINT matches_matchday_positive CHECK (matchday > 0),
    CONSTRAINT matches_distinct_teams CHECK (home_team_id <> away_team_id),
    CONSTRAINT matches_status_scheduled CHECK (status = 'SCHEDULED')
);

CREATE INDEX matches_season_matchday_kickoff_id_idx
    ON lmuml.matches (season_id, matchday, kickoff_at, id);

GRANT SELECT ON lmuml.seasons, lmuml.teams, lmuml.matches TO "${runtime}";
