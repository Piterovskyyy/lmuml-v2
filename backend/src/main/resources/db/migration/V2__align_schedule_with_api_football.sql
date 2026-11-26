-- V1 was a demonstration model. Never discard or guess identities/rounds for existing rows.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM lmuml.seasons)
        OR EXISTS (SELECT 1 FROM lmuml.teams)
        OR EXISTS (SELECT 1 FROM lmuml.matches) THEN
        RAISE EXCEPTION 'V2 requires explicit mapping of existing schedule data'
            USING HINT = 'Existing provider identities, matchday and status require an explicit migration plan. Do not delete data to bypass this check.';
    END IF;
END
$$;

CREATE TABLE lmuml.competitions (
    id UUID PRIMARY KEY,
    code VARCHAR(64) NOT NULL UNIQUE,
    name TEXT NOT NULL,
    api_football_id BIGINT NOT NULL UNIQUE,
    CONSTRAINT competitions_code_format CHECK (code ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
    CONSTRAINT competitions_name_nonblank CHECK (name ~ '[^[:space:]]'),
    CONSTRAINT competitions_api_id_positive CHECK (api_football_id > 0)
);

ALTER TABLE lmuml.seasons
    ADD COLUMN competition_id UUID NOT NULL,
    ADD COLUMN start_year SMALLINT NOT NULL,
    ADD CONSTRAINT seasons_competition_fk FOREIGN KEY (competition_id) REFERENCES lmuml.competitions (id),
    ADD CONSTRAINT seasons_competition_year_unique UNIQUE (competition_id, start_year),
    ADD CONSTRAINT seasons_start_year_range CHECK (start_year BETWEEN 1000 AND 9999);

ALTER TABLE lmuml.teams
    ADD COLUMN api_football_id BIGINT NOT NULL,
    ADD CONSTRAINT teams_api_football_id_unique UNIQUE (api_football_id),
    ADD CONSTRAINT teams_api_id_positive CHECK (api_football_id > 0);

DROP INDEX lmuml.matches_season_matchday_kickoff_id_idx;

ALTER TABLE lmuml.matches
    DROP CONSTRAINT matches_matchday_positive,
    DROP CONSTRAINT matches_status_scheduled,
    DROP COLUMN matchday,
    ALTER COLUMN kickoff_at DROP NOT NULL,
    ALTER COLUMN status DROP DEFAULT;

ALTER TABLE lmuml.matches RENAME COLUMN status TO provider_status;

ALTER TABLE lmuml.matches
    ADD COLUMN api_football_id BIGINT NOT NULL,
    ADD COLUMN api_round TEXT,
    ADD COLUMN home_goals INTEGER,
    ADD COLUMN away_goals INTEGER,
    ADD COLUMN halftime_home INTEGER,
    ADD COLUMN halftime_away INTEGER,
    ADD COLUMN fulltime_home INTEGER,
    ADD COLUMN fulltime_away INTEGER,
    ADD COLUMN extratime_home INTEGER,
    ADD COLUMN extratime_away INTEGER,
    ADD COLUMN penalty_home INTEGER,
    ADD COLUMN penalty_away INTEGER,
    ADD CONSTRAINT matches_api_football_id_unique UNIQUE (api_football_id),
    ADD CONSTRAINT matches_api_id_positive CHECK (api_football_id > 0),
    ADD CONSTRAINT matches_provider_status_nonblank CHECK (provider_status ~ '[^[:space:]]'),
    ADD CONSTRAINT matches_goals_nonnegative CHECK (home_goals >= 0 AND away_goals >= 0),
    ADD CONSTRAINT matches_halftime_nonnegative CHECK (halftime_home >= 0 AND halftime_away >= 0),
    ADD CONSTRAINT matches_fulltime_nonnegative CHECK (fulltime_home >= 0 AND fulltime_away >= 0),
    ADD CONSTRAINT matches_extratime_nonnegative CHECK (extratime_home >= 0 AND extratime_away >= 0),
    ADD CONSTRAINT matches_penalty_nonnegative CHECK (penalty_home >= 0 AND penalty_away >= 0);

CREATE INDEX matches_season_kickoff_id_idx ON lmuml.matches (season_id, kickoff_at, id);

GRANT SELECT ON lmuml.competitions TO "${runtime}";
