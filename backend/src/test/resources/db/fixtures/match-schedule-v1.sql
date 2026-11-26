-- Minimal legacy data for verifying that V2 refuses to invent provider mappings.
INSERT INTO lmuml.seasons (id, code, name) VALUES
    ('10000000-0000-0000-0000-000000000001', 'legacy-2026', 'Legacy season');

INSERT INTO lmuml.teams (id, name) VALUES
    ('20000000-0000-0000-0000-000000000001', 'Legacy home'),
    ('20000000-0000-0000-0000-000000000002', 'Legacy away');

INSERT INTO lmuml.matches (id, season_id, matchday, home_team_id, away_team_id, kickoff_at) VALUES
    ('30000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 7,
     '20000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000002',
     TIMESTAMPTZ '2026-10-25 02:30:00+02');
