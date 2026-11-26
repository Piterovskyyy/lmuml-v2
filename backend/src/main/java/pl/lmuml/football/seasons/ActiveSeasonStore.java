package pl.lmuml.football.seasons;

import java.util.Optional;
import javax.sql.DataSource;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class ActiveSeasonStore {

    private final JdbcClient jdbc;

    ActiveSeasonStore(DataSource dataSource) {
        this.jdbc = JdbcClient.create(dataSource);
    }

    Optional<String> findCode() {
        return jdbc.sql("""
                SELECT s.code
                FROM lmuml.active_season a
                JOIN lmuml.seasons s ON s.id = a.season_id
                """).query(String.class).optional();
    }

    boolean select(String seasonCode) {
        return jdbc.sql("""
                INSERT INTO lmuml.active_season (singleton, season_id)
                SELECT TRUE, id FROM lmuml.seasons WHERE code = :seasonCode
                ON CONFLICT (singleton) DO UPDATE SET season_id = EXCLUDED.season_id
                """)
                .param("seasonCode", seasonCode)
                .update() == 1;
    }
}
