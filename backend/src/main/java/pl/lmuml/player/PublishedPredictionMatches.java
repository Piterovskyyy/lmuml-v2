package pl.lmuml.player;

final class PublishedPredictionMatches {

    static final String CTE = """
            WITH published_matches AS (
                SELECT m.id, m.kickoff_at, m.provider_status, m.fulltime_home, m.fulltime_away,
                       r.id AS round_id, r.number AS round_number, r.name AS round_name
                FROM lmuml.betting_rounds r
                JOIN lmuml.betting_round_groups g ON g.betting_round_id = r.id AND g.season_id = r.season_id
                JOIN lmuml.betting_round_matches rm ON rm.group_key = g.group_key AND rm.season_id = g.season_id
                JOIN lmuml.matches m ON m.id = rm.match_id
                WHERE r.season_id = :seasonId AND r.published_at IS NOT NULL
                  AND (CAST(:roundId AS uuid) IS NULL OR r.id = :roundId)
            )
            """;

    private PublishedPredictionMatches() {}
}
