package pl.lmuml.bettingrounds;

import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceTransactionManager;
import org.springframework.jdbc.datasource.DriverManagerDataSource;
import org.springframework.jdbc.datasource.init.ResourceDatabasePopulator;
import org.testcontainers.junit.jupiter.Container;
import org.testcontainers.junit.jupiter.Testcontainers;
import org.testcontainers.postgresql.PostgreSQLContainer;
import org.testcontainers.utility.DockerImageName;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static pl.lmuml.bettingrounds.AdminRoundModels.*;

@Testcontainers
class RoundBuilderIT {

    private static final String SEASON = "demo-2026";
    private static final UUID SEASON_ID = UUID.fromString("10000000-0000-0000-0000-000000000001");

    @Container
    static final PostgreSQLContainer POSTGRES = new PostgreSQLContainer(
            DockerImageName.parse("postgres:18.6-trixie@sha256:edb0c08dc33befd0262ab3b5cf1c4f3f8cfd8b09e88c05b45adee29d6761ddb6")
                    .asCompatibleSubstituteFor("postgres"))
            .withDatabaseName("lmuml_test").withUsername("test_admin")
            .withPassword("test-only-admin-password").withInitScript("db/test-app-role.sql");

    @Test
    void reservesIndependentLegsAndAttachesOnlyTheConfirmedFinalToThePublishedRound() {
        var owner = connection("lmuml_migrator_test", "test-only-migrator-password");
        Flyway.configure().dataSource(owner).defaultSchema("lmuml").schemas("lmuml").createSchemas(false)
                .locations("classpath:db/migration")
                .placeholders(Map.of("runtime", "lmuml_app_test", "importer", "lmuml_importer_test"))
                .load().migrate();
        new ResourceDatabasePopulator(new ClassPathResource("db/fixtures/match-schedule.sql")).execute(owner);
        var catalog = new JdbcTemplate(owner);
        catalog.update("UPDATE lmuml.competitions SET api_football_id = 2 WHERE api_football_id = 9001");
        var runtime = connection("lmuml_app_test", "test-only-app-password");
        var builder = new RoundBuilder(new RoundStore(runtime), new DataSourceTransactionManager(runtime));

        for (int pair = 0; pair < 7; pair++) {
            createPair(catalog, pair, "Round of 16", "2027-03-04T20:00:00Z");
        }
        assertThat(builder.plan(SEASON).groups()).noneMatch(group -> "Round of 16".equals(group.tournamentRound()));
        createPair(catalog, 7, "Round of 16", "2027-03-04T20:00:00Z");
        var semiFirst = createPair(catalog, 8, "Semi-finals", "2027-04-20T20:00:00Z");
        var semiSecond = createPair(catalog, 9, "Semi-finals", "2027-04-21T20:00:00Z");

        var qualifyingMatch = insertMatch(catalog, 7498, "Play-offs", semiFirst, semiSecond,
                OffsetDateTime.parse("2026-08-20T20:00:00Z"), "NS");
        assertThat(builder.plan(SEASON).groups()).noneMatch(group -> "Play-offs".equals(group.tournamentRound()));
        assertThatThrownBy(() -> builder.create(new DraftRequest(SEASON, 1,
                List.of(new GroupSelection("round:Play-offs", List.of(qualifyingMatch))))))
                .isInstanceOf(RoundBuilder.Rejected.class);
        assertThat(group(builder, "round:League Stage - 1").matches()).hasSize(1);

        var firstLegs = group(builder, "round-of-16:first-leg");
        var secondLegs = group(builder, "round-of-16:second-leg");
        assertThat(firstLegs.matches()).hasSize(8);
        assertThat(secondLegs.matches()).hasSize(8);
        assertThatThrownBy(() -> builder.create(new DraftRequest(SEASON, 1,
                List.of(new GroupSelection(firstLegs.key(), List.of(firstLegs.matches().getFirst().id()))))))
                .isInstanceOf(RoundBuilder.Rejected.class);
        assertThat(builder.plan(SEASON).rounds()).isEmpty();

        var firstRound = create(builder, 1, firstLegs);
        assertThat(firstRound.name()).isEqualTo("Runda 1");
        var movedMatch = firstLegs.matches().getFirst().id();
        catalog.update("UPDATE lmuml.matches SET kickoff_at = '2027-03-30T20:00:00Z' WHERE id = ?", movedMatch);
        assertThat(group(builder, secondLegs.key()).matches()).isEqualTo(secondLegs.matches());
        assertThatThrownBy(() -> create(builder, 2, firstLegs)).isInstanceOf(RoundBuilder.Rejected.class);
        var draftToDelete = create(builder, 2, secondLegs);
        builder.delete(draftToDelete.id());
        var replayRound = create(builder, 2, secondLegs);
        assertThat(replayRound.id()).isNotEqualTo(firstRound.id());
        assertThat(group(builder, secondLegs.key()).assignedRoundId()).isEqualTo(replayRound.id());
        var publishedFirst = builder.publish(firstRound.id());
        assertThat(publishedFirst.status()).isEqualTo(Status.PUBLISHED);
        assertThat(publishedFirst.name()).isEqualTo(firstRound.name());
        assertThat(builder.publish(firstRound.id())).isEqualTo(publishedFirst);
        assertThatThrownBy(() -> builder.delete(firstRound.id())).isInstanceOf(RoundBuilder.Rejected.class);

        assertThat(group(builder, "final").matches()).isEmpty();
        var finalMatch = insertMatch(catalog, 7499, "Final", semiFirst, semiSecond,
                OffsetDateTime.parse("2027-05-29T20:00:00Z"), "TBD");
        assertThat(group(builder, "final").matches()).isEmpty();

        var finale = create(builder, 3, group(builder, "semi-final:first-leg"),
                group(builder, "semi-final:second-leg"), group(builder, "final"));
        assertThat(finale.awaitingFinal()).isTrue();
        assertThat(finale.pendingFinalMatch()).isNull();
        assertThat(finale.matchCount()).isEqualTo(4);
        builder.publish(finale.id());

        assertThat(round(builder, finale.id()).pendingFinalMatch()).isNull();
        assertThatThrownBy(() -> builder.attachFinal(finale.id(), finalMatch)).isInstanceOf(RoundBuilder.Rejected.class);
        catalog.update("UPDATE lmuml.matches SET provider_status = 'NS' WHERE id = ?", finalMatch);
        assertThat(round(builder, finale.id()).pendingFinalMatch().id()).isEqualTo(finalMatch);
        assertThatThrownBy(() -> builder.attachFinal(finale.id(), movedMatch)).isInstanceOf(RoundBuilder.Rejected.class);
        var attached = builder.attachFinal(finale.id(), finalMatch);
        assertThat(attached.status()).isEqualTo(Status.PUBLISHED);
        assertThat(attached.awaitingFinal()).isFalse();
        assertThat(attached.matchCount()).isEqualTo(5);
        assertThat(builder.attachFinal(finale.id(), finalMatch)).isEqualTo(attached);
        assertThat(group(builder, "final").matches()).extracting(Match::id).containsExactly(finalMatch);
    }

    private static Round create(RoundBuilder builder, int number, Group... groups) {
        var selections = java.util.Arrays.stream(groups)
                .map(group -> new GroupSelection(group.key(), group.matches().stream().map(Match::id).toList()))
                .toList();
        return builder.create(new DraftRequest(SEASON, number, selections));
    }

    private static Group group(RoundBuilder builder, String key) {
        return builder.plan(SEASON).groups().stream().filter(group -> group.key().equals(key)).findFirst().orElseThrow();
    }

    private static Round round(RoundBuilder builder, UUID id) {
        return builder.plan(SEASON).rounds().stream().filter(round -> round.id().equals(id)).findFirst().orElseThrow();
    }

    private static UUID createPair(JdbcTemplate catalog, int pair, String round, String kickoff) {
        UUID home = UUID.randomUUID();
        UUID away = UUID.randomUUID();
        catalog.update("INSERT INTO lmuml.teams (id, name, api_football_id) VALUES (?, ?, ?), (?, ?, ?)",
                home, "Gospodarz " + pair, 1000 + pair * 2, away, "Gość " + pair, 1001 + pair * 2);
        var firstKickoff = OffsetDateTime.parse(kickoff);
        insertMatch(catalog, 7100 + pair * 2, round, home, away, firstKickoff, "NS");
        insertMatch(catalog, 7101 + pair * 2, round, away, home, firstKickoff.plusWeeks(1), "NS");
        return home;
    }

    private static UUID insertMatch(JdbcTemplate catalog, int providerId, String round, UUID home, UUID away,
                                    OffsetDateTime kickoff, String status) {
        UUID id = UUID.randomUUID();
        catalog.update("""
                INSERT INTO lmuml.matches (id, season_id, api_football_id, api_round, provider_status,
                    home_team_id, away_team_id, kickoff_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
                """, id, SEASON_ID, providerId, round, status, home, away, kickoff);
        return id;
    }

    private static DriverManagerDataSource connection(String username, String password) {
        return new DriverManagerDataSource(POSTGRES.getJdbcUrl(), username, password);
    }
}
