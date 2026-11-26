package pl.lmuml.football.apifootball;

import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.List;
import javax.sql.DataSource;

import org.springframework.jdbc.core.simple.JdbcClient;

final class ApiFootballAutomaticDetailClaims {

    private static final Duration MATCH_WINDOW = Duration.ofHours(24);
    private static final Duration RETRY_DELAY = Duration.ofHours(1);
    private static final int BATCH_LIMIT = 20;

    // Use the same team and capture checks as the public detail reads. An events snapshot
    // can be valid without child rows because an empty timeline is a recorded result.
    private static final String CLAIM_MISSING_DETAILS = """
            WITH eligible AS (
                SELECT m.id, m.api_football_id, m.kickoff_at, prior.attempt_count
                FROM lmuml.matches m
                JOIN lmuml.seasons s ON s.id = m.season_id
                JOIN lmuml.competitions c ON c.id = s.competition_id
                LEFT JOIN lmuml.match_detail_auto_attempts prior ON prior.match_id = m.id
                LEFT JOIN lmuml.match_event_snapshots events ON events.match_id = m.id
                    AND events.home_team_id = m.home_team_id AND events.away_team_id = m.away_team_id
                LEFT JOIN lmuml.match_player_stat_snapshots players ON players.match_id = m.id
                    AND players.home_team_id = m.home_team_id AND players.away_team_id = m.away_team_id
                LEFT JOIN lmuml.match_lineups home_lineup ON home_lineup.match_id = m.id
                    AND home_lineup.side = 'HOME' AND home_lineup.team_id = m.home_team_id
                LEFT JOIN lmuml.match_lineups away_lineup ON away_lineup.match_id = m.id
                    AND away_lineup.side = 'AWAY' AND away_lineup.team_id = m.away_team_id
                    AND away_lineup.captured_at = home_lineup.captured_at
                LEFT JOIN lmuml.match_statistics home_statistics ON home_statistics.match_id = m.id
                    AND home_statistics.side = 'HOME' AND home_statistics.team_id = m.home_team_id
                LEFT JOIN lmuml.match_statistics away_statistics ON away_statistics.match_id = m.id
                    AND away_statistics.side = 'AWAY' AND away_statistics.team_id = m.away_team_id
                    AND away_statistics.captured_at = home_statistics.captured_at
                WHERE c.api_football_id = :leagueId AND s.start_year = :season
                    AND m.api_football_id > 0
                    AND m.provider_status IN ('FT', 'AET', 'PEN')
                    AND m.kickoff_at BETWEEN :windowStart AND :attemptAt
                    AND (prior.match_id IS NULL
                        OR (prior.attempt_count < 2 AND prior.last_attempted_at <= :retryBefore))
                    AND (
                        (s.coverage #> '{fixtures,events}' IS DISTINCT FROM 'false'::jsonb
                            AND events.match_id IS NULL)
                        OR (s.coverage #> '{fixtures,lineups}' IS DISTINCT FROM 'false'::jsonb
                            AND (away_lineup.match_id IS NULL OR (
                                SELECT count(DISTINCT starter.side) FROM lmuml.match_lineup_players starter
                                WHERE starter.match_id = m.id AND starter.starter
                            ) < 2))
                        OR (s.coverage #> '{fixtures,statistics_fixtures}' IS DISTINCT FROM 'false'::jsonb
                            AND away_statistics.match_id IS NULL)
                        OR (s.coverage #> '{fixtures,statistics_players}' IS DISTINCT FROM 'false'::jsonb
                            AND (players.match_id IS NULL OR (
                                SELECT count(DISTINCT player.side) FROM lmuml.match_player_statistics player
                                WHERE player.match_id = m.id
                            ) < 2))
                    )
                ORDER BY prior.attempt_count NULLS FIRST, m.kickoff_at, m.id
                LIMIT :limit
            ), claimed AS (
                INSERT INTO lmuml.match_detail_auto_attempts AS prior (match_id, last_attempted_at, attempt_count)
                SELECT id, :attemptAt, 1 FROM eligible ORDER BY id
                ON CONFLICT (match_id) DO UPDATE SET
                    last_attempted_at = EXCLUDED.last_attempted_at,
                    attempt_count = prior.attempt_count + 1
                WHERE prior.attempt_count < 2 AND prior.last_attempted_at <= :retryBefore
                RETURNING match_id
            )
            SELECT eligible.api_football_id
            FROM eligible JOIN claimed ON claimed.match_id = eligible.id
            ORDER BY eligible.attempt_count NULLS FIRST, eligible.kickoff_at, eligible.id
            """;

    private final JdbcClient jdbc;

    ApiFootballAutomaticDetailClaims(DataSource dataSource) {
        jdbc = JdbcClient.create(dataSource);
    }

    List<String> claim(long leagueId, int season, Instant attemptAt) {
        // Recheck the retry guard at the write so overlapping worker calls cannot claim the same fixture.
        return jdbc.sql(CLAIM_MISSING_DETAILS)
                .param("leagueId", leagueId)
                .param("season", season)
                .param("attemptAt", attemptAt.atOffset(ZoneOffset.UTC))
                .param("windowStart", attemptAt.minus(MATCH_WINDOW).atOffset(ZoneOffset.UTC))
                .param("retryBefore", attemptAt.minus(RETRY_DELAY).atOffset(ZoneOffset.UTC))
                .param("limit", BATCH_LIMIT)
                .query((row, index) -> Long.toString(row.getLong("api_football_id")))
                .list();
    }
}
