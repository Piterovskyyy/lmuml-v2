BEGIN;

SELECT NOT EXISTS (
    SELECT 1 FROM lmuml.seasons WHERE code = 'rehearsal-2026'
) AS season_missing
\gset

\if :season_missing
\ir match-schedule.sql

UPDATE lmuml.seasons SET code = 'rehearsal-2026', name = 'Sezon testowy 2026/27'
WHERE id = '10000000-0000-0000-0000-000000000001';

UPDATE lmuml.matches SET kickoff_at = CURRENT_TIMESTAMP + interval '30 days'
WHERE id = '30000000-0000-0000-0000-000000000001';

UPDATE lmuml.matches
SET kickoff_at = CURRENT_TIMESTAMP - interval '3 days', provider_status = 'FT',
    home_goals = 1, away_goals = 0, fulltime_home = 1, fulltime_away = 0
WHERE id = '30000000-0000-0000-0000-000000000002';

INSERT INTO lmuml.api_football_snapshots (endpoint, league_id, season, captured_at, payload)
VALUES ('fixtures', 9001, 2026, CURRENT_TIMESTAMP, '{"get":"fixtures","errors":[]}');

INSERT INTO lmuml.active_season (singleton, season_id)
VALUES (true, '10000000-0000-0000-0000-000000000001');

INSERT INTO lmuml.betting_rounds (id, season_id, number, published_at)
VALUES ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 1,
        CURRENT_TIMESTAMP - interval '7 days');

INSERT INTO lmuml.betting_round_groups (season_id, group_key, tournament_round, betting_round_id)
VALUES ('10000000-0000-0000-0000-000000000001', 'rehearsal-upcoming', 'League Stage - 1',
        '50000000-0000-0000-0000-000000000001');

INSERT INTO lmuml.betting_round_matches (match_id, season_id, group_key)
VALUES ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
        'rehearsal-upcoming');
\endif

COMMIT;
