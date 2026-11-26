ALTER TABLE lmuml.competitions
    ADD COLUMN competition_type TEXT,
    ADD COLUMN country_name TEXT,
    ADD COLUMN country_code TEXT,
    ADD COLUMN country_flag_url TEXT;

ALTER TABLE lmuml.seasons
    ADD COLUMN starts_on DATE,
    ADD COLUMN ends_on DATE,
    ADD COLUMN provider_current BOOLEAN,
    ADD COLUMN coverage JSONB,
    ADD CONSTRAINT seasons_dates_order CHECK (starts_on <= ends_on),
    ADD CONSTRAINT seasons_coverage_object CHECK (jsonb_typeof(coverage) = 'object');

ALTER TABLE lmuml.matches
    ADD COLUMN referee TEXT,
    ADD COLUMN venue_api_football_id BIGINT,
    ADD COLUMN venue_name TEXT,
    ADD COLUMN venue_city TEXT,
    ADD COLUMN elapsed_minutes INTEGER,
    ADD COLUMN extra_minutes INTEGER,
    ADD COLUMN home_winner BOOLEAN,
    ADD COLUMN away_winner BOOLEAN,
    ADD CONSTRAINT matches_venue_api_id_positive CHECK (venue_api_football_id > 0),
    ADD CONSTRAINT matches_elapsed_nonnegative CHECK (elapsed_minutes >= 0),
    ADD CONSTRAINT matches_extra_nonnegative CHECK (extra_minutes >= 0);

-- One last successful complete response for each currently supported query scope.
-- The key also describes request parameters: leagues?id=... or fixtures?league=..., and season.
CREATE TABLE lmuml.api_football_snapshots (
    endpoint TEXT NOT NULL,
    league_id BIGINT NOT NULL,
    season SMALLINT NOT NULL,
    captured_at TIMESTAMPTZ NOT NULL,
    payload JSONB NOT NULL,
    PRIMARY KEY (endpoint, league_id, season),
    CONSTRAINT api_football_snapshots_endpoint CHECK (endpoint IN ('leagues', 'fixtures')),
    CONSTRAINT api_football_snapshots_league_positive CHECK (league_id > 0),
    CONSTRAINT api_football_snapshots_season_range CHECK (season BETWEEN 1000 AND 9999),
    CONSTRAINT api_football_snapshots_payload_object CHECK (jsonb_typeof(payload) = 'object'),
    CONSTRAINT api_football_snapshots_payload_endpoint CHECK ((payload ->> 'get' = endpoint) IS TRUE),
    CONSTRAINT api_football_snapshots_no_api_errors CHECK (
        (payload -> 'errors' IN ('[]'::jsonb, '{}'::jsonb)) IS TRUE
    )
);

-- No runtime grant: full provider responses are internal import data.
