CREATE VIEW lmuml.fixture_snapshot_times AS
SELECT league_id, season, captured_at
FROM lmuml.api_football_snapshots
WHERE endpoint = 'fixtures';

GRANT SELECT ON lmuml.fixture_snapshot_times TO "${runtime}";
