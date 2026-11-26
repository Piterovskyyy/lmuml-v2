CREATE TABLE lmuml.player_predictions (
    player_id UUID NOT NULL REFERENCES lmuml.players (id),
    match_id UUID NOT NULL REFERENCES lmuml.betting_round_matches (match_id),
    home_goals SMALLINT NOT NULL CHECK (home_goals BETWEEN 0 AND 99),
    away_goals SMALLINT NOT NULL CHECK (away_goals BETWEEN 0 AND 99),
    PRIMARY KEY (player_id, match_id)
);

GRANT SELECT, INSERT, UPDATE (home_goals, away_goals) ON lmuml.player_predictions TO "${runtime}";
