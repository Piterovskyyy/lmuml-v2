-- Shared entities can occur in responses from different seasons. Keep the newest observed metadata.
ALTER TABLE lmuml.competitions ADD COLUMN source_captured_at TIMESTAMPTZ;
ALTER TABLE lmuml.teams ADD COLUMN source_captured_at TIMESTAMPTZ;

GRANT SELECT, INSERT, UPDATE ON lmuml.competitions, lmuml.seasons, lmuml.teams,
    lmuml.matches, lmuml.api_football_snapshots TO "${importer}";
