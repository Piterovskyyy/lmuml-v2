INSERT INTO lmuml.competitions (id, code, name, api_football_id) VALUES
    ('b4000000-0000-0000-0000-000000000001', 'community-cup', 'Puchar typów graczy', 59101);

INSERT INTO lmuml.seasons (id, competition_id, code, name, start_year) VALUES
    ('b1000000-0000-0000-0000-000000000001', 'b4000000-0000-0000-0000-000000000001', 'community-2026', 'Typy graczy 2026', 2026);

INSERT INTO lmuml.teams (id, name, api_football_id) VALUES
    ('b2000000-0000-0000-0000-000000000001', 'Gospodarze', 59201),
    ('b2000000-0000-0000-0000-000000000002', 'Goście', 59202);

INSERT INTO lmuml.betting_rounds (id, season_id, number, published_at) VALUES
    ('b5000000-0000-0000-0000-000000000001', 'b1000000-0000-0000-0000-000000000001', 1, CURRENT_TIMESTAMP),
    ('b5000000-0000-0000-0000-000000000002', 'b1000000-0000-0000-0000-000000000001', 2, NULL),
    ('b5000000-0000-0000-0000-000000000003', 'b1000000-0000-0000-0000-000000000001', 3, CURRENT_TIMESTAMP),
    ('b5000000-0000-0000-0000-000000000004', 'b1000000-0000-0000-0000-000000000001', 4, CURRENT_TIMESTAMP);

INSERT INTO lmuml.betting_round_groups (season_id, group_key, tournament_round, betting_round_id)
SELECT season_id, 'league:' || number, 'League Stage - ' || number, id
FROM lmuml.betting_rounds WHERE id IN (
    'b5000000-0000-0000-0000-000000000001', 'b5000000-0000-0000-0000-000000000002',
    'b5000000-0000-0000-0000-000000000003', 'b5000000-0000-0000-0000-000000000004'
);

INSERT INTO lmuml.players (id, email, display_name, password_hash) VALUES
    ('b6000000-0000-0000-0000-000000000001', 'community-minus@example.test', 'Minus', repeat('0', 96)),
    ('b6000000-0000-0000-0000-000000000002', 'community-zero@example.test', 'Zero', repeat('0', 96)),
    ('b6000000-0000-0000-0000-000000000003', 'community-hidden@example.test', 'Ukryty', repeat('0', 96)),
    ('b6000000-0000-0000-0000-000000000004', 'community-without-picks@example.test', 'Bez typów', repeat('0', 96));
