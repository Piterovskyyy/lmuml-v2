package pl.lmuml.football.apifootball;

import java.sql.Types;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.Map;
import java.util.UUID;
import javax.sql.DataSource;

import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.jdbc.datasource.ConnectionHolder;
import org.springframework.transaction.IllegalTransactionStateException;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

final class ApiFootballCatalogWriter {

    private final DataSource dataSource;
    private final JdbcClient jdbc;
    private final JsonMapper json;

    ApiFootballCatalogWriter(DataSource dataSource, JsonMapper json) {
        this.dataSource = dataSource;
        this.jdbc = JdbcClient.create(dataSource);
        this.json = json;
    }

    void write(ApiFootballImportBatch batch) {
        if (!TransactionSynchronizationManager.isActualTransactionActive()
                || !(TransactionSynchronizationManager.getResource(dataSource) instanceof ConnectionHolder connection)) {
            throw new IllegalTransactionStateException("Catalog writes require an active transaction for their data source.");
        }
        try {
            UUID competitionId = writeCompetition(batch.competition(), batch.leagueSnapshot().capturedAt());
            UUID seasonId = writeSeason(batch.competition(), competitionId, batch.season());
            Map<Long, UUID> teamIds = new HashMap<>();
            for (ApiFootballImportBatch.Team team : batch.teams()) {
                teamIds.put(team.providerId(), writeTeam(team, batch.fixtureSnapshot().capturedAt()));
            }
            for (ApiFootballImportBatch.Match match : batch.matches()) {
                writeMatch(seasonId, match, requiredTeam(teamIds, match.homeTeamId()), requiredTeam(teamIds, match.awayTeamId()));
            }
        } catch (RuntimeException failure) {
            // The caller cannot commit an earlier snapshot after suppressing a catalog failure.
            connection.setRollbackOnly();
            throw failure;
        }
    }

    private UUID writeCompetition(ApiFootballImportBatch.Competition competition, Instant capturedAt) {
        return jdbc.sql("""
                INSERT INTO lmuml.competitions AS stored
                    (id, code, name, api_football_id, logo_url, competition_type,
                     country_name, country_code, country_flag_url, source_captured_at)
                VALUES (:id, :code, :name, :providerId, :logoUrl, :type,
                        :countryName, :countryCode, :countryFlagUrl, :capturedAt)
                ON CONFLICT (api_football_id) DO UPDATE
                SET name = EXCLUDED.name, logo_url = EXCLUDED.logo_url,
                    competition_type = EXCLUDED.competition_type, country_name = EXCLUDED.country_name,
                    country_code = EXCLUDED.country_code, country_flag_url = EXCLUDED.country_flag_url,
                    source_captured_at = EXCLUDED.source_captured_at
                WHERE stored.source_captured_at IS NULL OR stored.source_captured_at <= EXCLUDED.source_captured_at
                RETURNING id
                """)
                .param("id", UUID.randomUUID())
                .param("code", "api-football-" + competition.providerId())
                .param("name", competition.name())
                .param("providerId", competition.providerId())
                .param("logoUrl", competition.logoUrl(), Types.VARCHAR)
                .param("type", competition.type(), Types.VARCHAR)
                .param("countryName", competition.countryName(), Types.VARCHAR)
                .param("countryCode", competition.countryCode(), Types.VARCHAR)
                .param("countryFlagUrl", competition.countryFlagUrl(), Types.VARCHAR)
                .param("capturedAt", offset(capturedAt))
                .query(UUID.class).optional()
                .orElseGet(() -> jdbc.sql("SELECT id FROM lmuml.competitions WHERE api_football_id = :providerId")
                        .param("providerId", competition.providerId()).query(UUID.class).single());
    }

    private UUID writeSeason(ApiFootballImportBatch.Competition competition, UUID competitionId,
                             ApiFootballImportBatch.Season season) {
        JsonNode coverage = season.coverage();
        return jdbc.sql("""
                INSERT INTO lmuml.seasons AS stored
                    (id, competition_id, code, name, start_year, starts_on, ends_on, provider_current, coverage)
                VALUES (:id, :competitionId, :code, :name, :year, :startsOn, :endsOn,
                        :providerCurrent, CAST(:coverage AS jsonb))
                ON CONFLICT (competition_id, start_year) DO UPDATE
                SET name = EXCLUDED.name, starts_on = EXCLUDED.starts_on, ends_on = EXCLUDED.ends_on,
                    provider_current = EXCLUDED.provider_current, coverage = EXCLUDED.coverage
                RETURNING id
                """)
                .param("id", UUID.randomUUID())
                .param("competitionId", competitionId)
                .param("code", "api-football-" + competition.providerId() + "-" + season.year())
                .param("name", competition.name() + " " + season.year())
                .param("year", season.year())
                .param("startsOn", season.startsOn(), Types.DATE)
                .param("endsOn", season.endsOn(), Types.DATE)
                .param("providerCurrent", season.providerCurrent(), Types.BOOLEAN)
                .param("coverage", coverage == null ? null : json.writeValueAsString(coverage), Types.VARCHAR)
                .query(UUID.class).single();
    }

    private UUID writeTeam(ApiFootballImportBatch.Team team, Instant capturedAt) {
        return jdbc.sql("""
                INSERT INTO lmuml.teams AS stored (id, name, api_football_id, logo_url, source_captured_at)
                VALUES (:id, :name, :providerId, :logoUrl, :capturedAt)
                ON CONFLICT (api_football_id) DO UPDATE
                SET name = EXCLUDED.name, logo_url = EXCLUDED.logo_url, source_captured_at = EXCLUDED.source_captured_at
                WHERE stored.source_captured_at IS NULL OR stored.source_captured_at <= EXCLUDED.source_captured_at
                RETURNING id
                """)
                .param("id", UUID.randomUUID())
                .param("name", team.name())
                .param("providerId", team.providerId())
                .param("logoUrl", team.logoUrl(), Types.VARCHAR)
                .param("capturedAt", offset(capturedAt))
                .query(UUID.class).optional()
                .orElseGet(() -> jdbc.sql("SELECT id FROM lmuml.teams WHERE api_football_id = :providerId")
                        .param("providerId", team.providerId()).query(UUID.class).single());
    }

    private void writeMatch(UUID seasonId, ApiFootballImportBatch.Match match, UUID homeTeamId, UUID awayTeamId) {
        int written = jdbc.sql("""
                INSERT INTO lmuml.matches AS stored
                    (id, season_id, api_football_id, api_round, provider_status, home_team_id, away_team_id,
                     kickoff_at, home_goals, away_goals, halftime_home, halftime_away,
                     fulltime_home, fulltime_away, extratime_home, extratime_away, penalty_home, penalty_away,
                     referee, venue_api_football_id, venue_name, venue_city, elapsed_minutes, extra_minutes,
                     home_winner, away_winner)
                VALUES (:id, :seasonId, :providerId, :apiRound, :providerStatus, :homeTeamId, :awayTeamId,
                        :kickoffAt, :homeGoals, :awayGoals, :halftimeHome, :halftimeAway,
                        :fulltimeHome, :fulltimeAway, :extratimeHome, :extratimeAway, :penaltyHome, :penaltyAway,
                        :referee, :venueId, :venueName, :venueCity, :elapsedMinutes, :extraMinutes,
                        :homeWinner, :awayWinner)
                ON CONFLICT (api_football_id) DO UPDATE
                SET api_round = EXCLUDED.api_round, provider_status = EXCLUDED.provider_status,
                    home_team_id = EXCLUDED.home_team_id, away_team_id = EXCLUDED.away_team_id,
                    kickoff_at = EXCLUDED.kickoff_at, home_goals = EXCLUDED.home_goals,
                    away_goals = EXCLUDED.away_goals, halftime_home = EXCLUDED.halftime_home,
                    halftime_away = EXCLUDED.halftime_away, fulltime_home = EXCLUDED.fulltime_home,
                    fulltime_away = EXCLUDED.fulltime_away, extratime_home = EXCLUDED.extratime_home,
                    extratime_away = EXCLUDED.extratime_away, penalty_home = EXCLUDED.penalty_home,
                    penalty_away = EXCLUDED.penalty_away, referee = EXCLUDED.referee,
                    venue_api_football_id = EXCLUDED.venue_api_football_id, venue_name = EXCLUDED.venue_name,
                    venue_city = EXCLUDED.venue_city, elapsed_minutes = EXCLUDED.elapsed_minutes,
                    extra_minutes = EXCLUDED.extra_minutes, home_winner = EXCLUDED.home_winner,
                    away_winner = EXCLUDED.away_winner
                WHERE stored.season_id = EXCLUDED.season_id
                """)
                .param("id", UUID.randomUUID())
                .param("seasonId", seasonId)
                .param("providerId", match.providerId())
                .param("apiRound", match.apiRound(), Types.VARCHAR)
                .param("providerStatus", match.providerStatus())
                .param("homeTeamId", homeTeamId)
                .param("awayTeamId", awayTeamId)
                .param("kickoffAt", offset(match.kickoffAt()), Types.TIMESTAMP_WITH_TIMEZONE)
                .param("homeGoals", match.goals().home(), Types.INTEGER)
                .param("awayGoals", match.goals().away(), Types.INTEGER)
                .param("halftimeHome", match.halftime().home(), Types.INTEGER)
                .param("halftimeAway", match.halftime().away(), Types.INTEGER)
                .param("fulltimeHome", match.fulltime().home(), Types.INTEGER)
                .param("fulltimeAway", match.fulltime().away(), Types.INTEGER)
                .param("extratimeHome", match.extratime().home(), Types.INTEGER)
                .param("extratimeAway", match.extratime().away(), Types.INTEGER)
                .param("penaltyHome", match.penalty().home(), Types.INTEGER)
                .param("penaltyAway", match.penalty().away(), Types.INTEGER)
                .param("referee", match.referee(), Types.VARCHAR)
                .param("venueId", match.venueId(), Types.BIGINT)
                .param("venueName", match.venueName(), Types.VARCHAR)
                .param("venueCity", match.venueCity(), Types.VARCHAR)
                .param("elapsedMinutes", match.elapsedMinutes(), Types.INTEGER)
                .param("extraMinutes", match.extraMinutes(), Types.INTEGER)
                .param("homeWinner", match.homeWinner(), Types.BOOLEAN)
                .param("awayWinner", match.awayWinner(), Types.BOOLEAN)
                .update();
        if (written != 1) {
            throw new IllegalStateException("An existing provider fixture cannot be reassigned to another season.");
        }
    }

    private static UUID requiredTeam(Map<Long, UUID> teamIds, long providerId) {
        UUID id = teamIds.get(providerId);
        if (id == null) throw new IllegalStateException("Imported match references a team absent from the batch.");
        return id;
    }

    private static OffsetDateTime offset(Instant instant) {
        return instant == null ? null : instant.atOffset(ZoneOffset.UTC);
    }
}
