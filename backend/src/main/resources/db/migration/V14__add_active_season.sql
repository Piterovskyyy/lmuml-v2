CREATE TABLE lmuml.active_season (
    singleton BOOLEAN PRIMARY KEY CHECK (singleton),
    season_id UUID NOT NULL REFERENCES lmuml.seasons (id)
);

GRANT SELECT, INSERT (singleton, season_id), UPDATE (season_id)
    ON lmuml.active_season TO "${runtime}";
