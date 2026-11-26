INSERT INTO lmuml.competitions (id, code, name, api_football_id) VALUES
    ('a4000000-0000-0000-0000-000000000001', 'ranking-cup', 'Puchar testowy', 49101);

INSERT INTO lmuml.seasons (id, competition_id, code, name, start_year) VALUES
    ('a1000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000001', 'ranking-2026', 'Ranking 2026', 2026),
    ('a1000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000001', 'ranking-2027', 'Ranking 2027', 2027);

INSERT INTO lmuml.teams (id, name, api_football_id) VALUES
    ('a2000000-0000-0000-0000-000000000001', 'Gospodarze', 49201),
    ('a2000000-0000-0000-0000-000000000002', 'Goście', 49202);

-- The first two matches count in separate published rounds. Later rows test exclusions.
INSERT INTO lmuml.matches (id, season_id, api_football_id, provider_status, home_team_id, away_team_id,
    kickoff_at, fulltime_home, fulltime_away, home_goals, away_goals)
SELECT fixture.id::uuid, season.id, fixture.provider_id, fixture.status,
    'a2000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002',
    CURRENT_TIMESTAMP - INTERVAL '2 hours', 2, fixture.regulation_away, 2, 2
FROM (VALUES
    ('a3000000-0000-0000-0000-000000000001', 49301, 'PEN', 1, 'ranking-2026'),
    ('a3000000-0000-0000-0000-000000000002', 49302, 'AET', 1, 'ranking-2026'),
    ('a3000000-0000-0000-0000-000000000003', 49303, 'FT', NULL, 'ranking-2026'),
    ('a3000000-0000-0000-0000-000000000004', 49304, '2H', 1, 'ranking-2026'),
    ('a3000000-0000-0000-0000-000000000005', 49305, 'FT', 1, 'ranking-2026'),
    ('a3000000-0000-0000-0000-000000000006', 49306, 'FT', 1, 'ranking-2027')
) fixture(id, provider_id, status, regulation_away, season_code)
JOIN lmuml.seasons season ON season.code = fixture.season_code;

INSERT INTO lmuml.betting_rounds (id, season_id, number, published_at) VALUES
    ('a5000000-0000-0000-0000-000000000001', 'a1000000-0000-0000-0000-000000000001', 1, CURRENT_TIMESTAMP),
    ('a5000000-0000-0000-0000-000000000002', 'a1000000-0000-0000-0000-000000000001', 2, CURRENT_TIMESTAMP),
    ('a5000000-0000-0000-0000-000000000003', 'a1000000-0000-0000-0000-000000000001', 3, NULL),
    ('a5000000-0000-0000-0000-000000000004', 'a1000000-0000-0000-0000-000000000002', 1, CURRENT_TIMESTAMP);

INSERT INTO lmuml.betting_round_groups (season_id, group_key, tournament_round, betting_round_id)
SELECT season_id, 'league:' || number, 'League Stage - ' || number, id
FROM lmuml.betting_rounds WHERE id IN (
    'a5000000-0000-0000-0000-000000000001', 'a5000000-0000-0000-0000-000000000002',
    'a5000000-0000-0000-0000-000000000003', 'a5000000-0000-0000-0000-000000000004'
);

INSERT INTO lmuml.betting_round_matches (match_id, season_id, group_key)
SELECT match.id, match.season_id, membership.group_key
FROM (VALUES
    ('a3000000-0000-0000-0000-000000000001', 'league:1'),
    ('a3000000-0000-0000-0000-000000000002', 'league:2'),
    ('a3000000-0000-0000-0000-000000000003', 'league:1'),
    ('a3000000-0000-0000-0000-000000000004', 'league:1'),
    ('a3000000-0000-0000-0000-000000000005', 'league:3'),
    ('a3000000-0000-0000-0000-000000000006', 'league:1')
) membership(match_id, group_key)
JOIN lmuml.matches match ON match.id = membership.match_id::uuid;

INSERT INTO lmuml.players (id, email, display_name, password_hash)
SELECT gen_random_uuid(), lower(name) || '.ranking@example.test', name, repeat('0', 96)
FROM (VALUES ('Borys'), ('Cezary'), ('Daria'), ('Ewa'), ('Feliks'), ('Gabriela'), ('Hubert')) players(name);

INSERT INTO lmuml.player_predictions (player_id, match_id, home_goals, away_goals)
SELECT player.id, prediction.match_id::uuid, prediction.home, prediction.away
FROM (VALUES
    ('ada', 'a3000000-0000-0000-0000-000000000001', 2, 1),
    ('ada', 'a3000000-0000-0000-0000-000000000002', 1, 0),
    ('borys', 'a3000000-0000-0000-0000-000000000001', 2, 1),
    ('borys', 'a3000000-0000-0000-0000-000000000002', 1, 0),
    ('cezary', 'a3000000-0000-0000-0000-000000000001', 2, 0),
    ('cezary', 'a3000000-0000-0000-0000-000000000002', 3, 1),
    ('daria', 'a3000000-0000-0000-0000-000000000001', 3, 5),
    ('ewa', 'a3000000-0000-0000-0000-000000000001', 5, 5),
    ('feliks', 'a3000000-0000-0000-0000-000000000003', 2, 1),
    ('feliks', 'a3000000-0000-0000-0000-000000000004', 2, 1),
    ('feliks', 'a3000000-0000-0000-0000-000000000005', 2, 1),
    ('feliks', 'a3000000-0000-0000-0000-000000000006', 2, 1),
    ('gabriela', 'a3000000-0000-0000-0000-000000000001', 2, 1),
    ('gabriela', 'a3000000-0000-0000-0000-000000000002', 15, 0),
    ('hubert', 'a3000000-0000-0000-0000-000000000001', 2, 1)
) prediction(name, match_id, home, away)
JOIN lmuml.players player ON player.email = prediction.name || '.ranking@example.test';
