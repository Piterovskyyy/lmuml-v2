-- Membership uses the selected match group even when the provider changes a date or round label.
ALTER TABLE lmuml.matches
    ADD CONSTRAINT matches_season_id_id_unique UNIQUE (season_id, id);

CREATE TABLE lmuml.betting_rounds (
    id UUID PRIMARY KEY,
    season_id UUID NOT NULL REFERENCES lmuml.seasons (id),
    number INTEGER NOT NULL CHECK (number > 0),
    name TEXT NOT NULL CHECK (name ~ '[^[:space:]]'),
    published_at TIMESTAMPTZ,
    UNIQUE (season_id, number),
    UNIQUE (season_id, id)
);

CREATE TABLE lmuml.betting_round_groups (
    season_id UUID NOT NULL,
    group_key TEXT NOT NULL CHECK (group_key ~ '[^[:space:]]'),
    tournament_round TEXT NOT NULL CHECK (tournament_round ~ '[^[:space:]]'),
    betting_round_id UUID NOT NULL,
    PRIMARY KEY (season_id, group_key),
    FOREIGN KEY (season_id, betting_round_id) REFERENCES lmuml.betting_rounds (season_id, id)
);

CREATE INDEX betting_round_groups_round_idx
    ON lmuml.betting_round_groups (season_id, betting_round_id);

CREATE TABLE lmuml.betting_round_matches (
    match_id UUID PRIMARY KEY,
    season_id UUID NOT NULL,
    group_key TEXT NOT NULL,
    FOREIGN KEY (season_id, group_key) REFERENCES lmuml.betting_round_groups (season_id, group_key),
    FOREIGN KEY (season_id, match_id) REFERENCES lmuml.matches (season_id, id)
);

CREATE INDEX betting_round_matches_group_idx
    ON lmuml.betting_round_matches (season_id, group_key);
