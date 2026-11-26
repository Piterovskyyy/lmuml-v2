ALTER TABLE lmuml.match_lineup_players
    ADD COLUMN provider_player_id BIGINT CHECK (provider_player_id > 0);

ALTER TABLE lmuml.match_events
    ADD COLUMN provider_player_id BIGINT CHECK (provider_player_id > 0),
    ADD COLUMN related_provider_player_id BIGINT CHECK (related_provider_player_id > 0);
