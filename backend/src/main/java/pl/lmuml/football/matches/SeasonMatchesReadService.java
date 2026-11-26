package pl.lmuml.football.matches;

import java.time.Duration;
import java.util.Optional;
import java.util.stream.IntStream;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.dao.DataAccessException;
import org.springframework.data.redis.core.StringRedisTemplate;
import org.springframework.stereotype.Service;
import pl.lmuml.football.matches.SeasonMatchesQuery.CatalogRevision;
import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

@Service
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class SeasonMatchesReadService {

    private static final Logger LOG = LoggerFactory.getLogger(SeasonMatchesReadService.class);
    private static final Duration TTL = Duration.ofSeconds(30);
    private static final long REDIS_RETRY_PAUSE_NANOS = Duration.ofSeconds(2).toNanos();

    private final SeasonMatchesQuery query;
    private final StringRedisTemplate redis;
    private final JsonMapper json;
    private final boolean enabled;
    private final Object[] fillLocks = IntStream.range(0, 16).mapToObj(index -> new Object()).toArray();
    private volatile long redisFailedAt;

    SeasonMatchesReadService(SeasonMatchesQuery query, StringRedisTemplate redis, JsonMapper json,
            @Value("${lmuml.catalog-cache.enabled:false}") boolean enabled) {
        this.query = query;
        this.redis = redis;
        this.json = json;
        this.enabled = enabled;
    }

    Optional<SeasonMatchesResponse> find(String seasonCode) {
        if (!enabled || redisPaused()) return query.findBySeasonCode(seasonCode);

        var revision = query.findCatalogRevision(seasonCode);
        if (revision.isEmpty()) return Optional.empty();
        if (revision.get().fixturesCapturedAt() == null) return query.findBySeasonCode(seasonCode);

        var requestedRevision = revision.get();
        var cached = readCache(requestedRevision, seasonCode);
        if (cached.isPresent()) return cached;

        // Several browsers may request the same new version immediately after a WebSocket event.
        int lockIndex = Math.floorMod(requestedRevision.seasonId().hashCode(), fillLocks.length);
        synchronized (fillLocks[lockIndex]) {
            if (!redisPaused()) {
                var filled = readCache(requestedRevision, seasonCode);
                if (filled.isPresent()) return filled;
                if (!redisPaused()) {
                    var response = query.findBySeasonCode(seasonCode);
                    response.filter(catalog -> catalog.fixturesCapturedAt() != null).ifPresent(this::writeCache);
                    return response;
                }
            }
        }
        return query.findBySeasonCode(seasonCode);
    }

    private Optional<SeasonMatchesResponse> readCache(CatalogRevision revision, String seasonCode) {
        try {
            String value = redis.opsForValue().get(key(revision));
            if (value != null) {
                var response = json.readValue(value, SeasonMatchesResponse.class);
                if (response != null && response.season() != null && seasonCode.equals(response.season().code())
                        && revision.equals(revisionOf(response))) {
                    return Optional.of(response);
                }
            }
        } catch (DataAccessException unavailable) {
            pauseRedis(unavailable);
        } catch (JacksonException invalid) {
            LOG.debug("Ignoring an unreadable season matches cache entry");
        }
        return Optional.empty();
    }

    private void writeCache(SeasonMatchesResponse response) {
        if (redisPaused()) return;
        try {
            // Use the version from the same PostgreSQL snapshot as these matches.
            redis.opsForValue().set(key(revisionOf(response)), json.writeValueAsString(response), TTL);
        } catch (DataAccessException unavailable) {
            pauseRedis(unavailable);
        } catch (JacksonException invalid) {
            LOG.debug("Unable to serialize the season matches cache entry");
        }
    }

    private static CatalogRevision revisionOf(SeasonMatchesResponse response) {
        var standings = response.standings();
        return new CatalogRevision(response.season().id(), response.fixturesCapturedAt(),
                standings == null ? null : standings.capturedAt());
    }

    private static String key(CatalogRevision revision) {
        var standings = revision.standingsCapturedAt();
        return "lmuml:season-matches:v1:" + revision.seasonId() + ":" + revision.fixturesCapturedAt()
                + ":" + (standings == null ? "none" : standings);
    }

    private boolean redisPaused() {
        long failedAt = redisFailedAt;
        return failedAt != 0 && System.nanoTime() - failedAt < REDIS_RETRY_PAUSE_NANOS;
    }

    private void pauseRedis(DataAccessException unavailable) {
        redisFailedAt = System.nanoTime();
        LOG.debug("Season matches cache temporarily unavailable ({})", unavailable.getClass().getSimpleName());
    }
}
