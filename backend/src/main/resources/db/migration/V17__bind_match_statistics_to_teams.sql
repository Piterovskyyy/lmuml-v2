ALTER TABLE lmuml.match_statistics
    ADD COLUMN team_id UUID REFERENCES lmuml.teams (id);

UPDATE lmuml.match_statistics stored
SET team_id = CASE stored.side WHEN 'HOME' THEN m.home_team_id ELSE m.away_team_id END
FROM lmuml.matches m
WHERE m.id = stored.match_id;

ALTER TABLE lmuml.match_statistics
    ALTER COLUMN team_id SET NOT NULL;
