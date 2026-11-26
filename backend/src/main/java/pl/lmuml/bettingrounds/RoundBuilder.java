package pl.lmuml.bettingrounds;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

import pl.lmuml.football.seasons.SeasonCode;

import static pl.lmuml.bettingrounds.AdminRoundModels.*;
import static pl.lmuml.bettingrounds.FixtureGroups.*;

@Service
@ConditionalOnWebApplication(type = ConditionalOnWebApplication.Type.SERVLET)
final class RoundBuilder {

    private static final int MAX_ROUND_NUMBER = 9999;

    private final RoundStore store;
    private final TransactionTemplate read;
    private final TransactionTemplate write;

    RoundBuilder(RoundStore store, PlatformTransactionManager transactions) {
        this.store = store;
        this.write = new TransactionTemplate(transactions);
        this.read = new TransactionTemplate(transactions);
        read.setReadOnly(true);
        read.setIsolationLevel(TransactionDefinition.ISOLATION_REPEATABLE_READ);
    }

    List<Season> seasons() {
        return store.seasons();
    }

    Plan plan(String seasonCode) {
        validateSeasonCode(seasonCode);
        return read.execute(transaction -> {
            var season = season(seasonCode);
            var saved = store.groups(season.id());
            var fixtures = store.fixtures(season.id());
            var rounds = store.rounds(season.id()).stream().map(round -> summary(round, saved, fixtures)).toList();
            int nextNumber = rounds.isEmpty() ? 1 : Math.min(MAX_ROUND_NUMBER, rounds.getLast().number() + 1);
            return new Plan(season.season(), nextNumber, FixtureGroups.plan(fixtures, saved, season.championsLeague()), rounds);
        });
    }

    Round create(DraftRequest request) {
        validateDraft(request);
        return write.execute(transaction -> {
            var season = season(request.seasonCode());
            var saved = store.groups(season.id());
            var fixtures = store.fixtures(season.id());
            var available = FixtureGroups.plan(fixtures, saved, season.championsLeague()).stream()
                    .collect(Collectors.toMap(Group::key, Function.identity()));
            var selected = new ArrayList<Group>();
            for (var selection : request.groups()) {
                var group = available.get(selection.key());
                if (group == null || group.assignedRoundId() != null) {
                    throw conflict("Co najmniej jeden blok jest już zajęty lub niedostępny. Odśwież listę.");
                }
                var currentIds = group.matches().stream().map(Match::id).collect(Collectors.toSet());
                if (!currentIds.equals(new HashSet<>(selection.matchIds()))) {
                    throw conflict("Skład bloku zmienił się od czasu podglądu. Odśwież listę i sprawdź mecze.");
                }
                selected.add(group);
            }
            if (selected.stream().allMatch(group -> group.matches().isEmpty())) {
                throw invalid("Dodaj przynajmniej jeden blok z meczami.");
            }

            var round = store.insertRound(season.id(), request.number());
            selected.stream().sorted(java.util.Comparator.comparing(Group::key)).forEach(group -> store.insertGroup(round, group));
            return summary(round, store.groups(season.id()), fixtures);
        });
    }

    Round publish(UUID id) {
        return write.execute(transaction -> {
            var round = lockRound(id);
            var saved = store.groups(round.seasonId());
            var fixtures = store.fixtures(round.seasonId());
            if (round.publishedAt() == null) {
                var matchIds = groupsFor(round, saved).stream().flatMap(group -> group.matchIds().stream())
                        .collect(Collectors.toSet());
                boolean canPublish = fixtures.stream().anyMatch(
                        fixture -> matchIds.contains(fixture.match().id()) && fixture.confirmed());
                if (!canPublish) {
                    throw conflict("Do publikacji potrzebny jest co najmniej jeden mecz z potwierdzonym terminem.");
                }
                round = store.publish(round);
            }
            return summary(round, saved, fixtures);
        });
    }

    Round attachFinal(UUID id, UUID matchId) {
        if (matchId == null) {
            throw invalid("Wybierz mecz finałowy.");
        }
        return write.execute(transaction -> {
            var round = lockRound(id);
            var saved = store.groups(round.seasonId());
            var fixtures = store.fixtures(round.seasonId());
            var reservation = groupsFor(round, saved).stream()
                    .filter(group -> FINAL_KEY.equals(group.key()))
                    .findFirst().orElseThrow(() -> conflict("Ta kolejka nie ma rezerwacji finału."));
            if (reservation.matchIds().contains(matchId)) {
                return summary(round, saved, fixtures);
            }
            var available = confirmedFinal(fixtures);
            if (!reservation.matchIds().isEmpty() || available == null || !available.id().equals(matchId)) {
                throw conflict("Ten mecz finałowy nie jest dostępny do przypisania. Odśwież listę.");
            }

            store.insertMatch(round.seasonId(), FINAL_KEY, matchId);
            return summary(round, store.groups(round.seasonId()), fixtures);
        });
    }

    void delete(UUID id) {
        write.executeWithoutResult(transaction -> {
            var round = lockRound(id);
            if (round.publishedAt() != null) {
                throw conflict("Opublikowanej kolejki nie można usunąć.");
            }
            store.delete(id);
        });
    }

    private RoundStore.SeasonRow season(String code) {
        return store.season(code).orElseThrow(() -> missing("Nie znaleziono sezonu."));
    }

    private RoundStore.RoundRow lockRound(UUID id) {
        return store.lockRound(id).orElseThrow(() -> missing("Nie znaleziono kolejki."));
    }

    private static List<SavedGroup> groupsFor(RoundStore.RoundRow round, List<SavedGroup> saved) {
        return saved.stream().filter(group -> group.roundId().equals(round.id())).toList();
    }

    private static Round summary(RoundStore.RoundRow round, List<SavedGroup> saved, List<Fixture> fixtures) {
        var groups = groupsFor(round, saved);
        boolean awaitingFinal = groups.stream().anyMatch(group -> FINAL_KEY.equals(group.key()) && group.matchIds().isEmpty());
        return new Round(round.id(), round.number(), round.name(),
                round.publishedAt() == null ? Status.DRAFT : Status.PUBLISHED,
                groups.stream().map(SavedGroup::key).toList(),
                groups.stream().mapToInt(group -> group.matchIds().size()).sum(),
                round.publishedAt(), awaitingFinal, awaitingFinal ? confirmedFinal(fixtures) : null);
    }

    private static void validateDraft(DraftRequest request) {
        validateSeasonCode(request.seasonCode());
        if (request.number() == null || request.number() < 1 || request.number() > MAX_ROUND_NUMBER) {
            throw invalid("Podaj numer rundy od 1 do 9999.");
        }
        if (request.groups() == null || request.groups().isEmpty()) {
            throw invalid("Wybierz co najmniej jeden blok meczów.");
        }
        Set<String> keys = new HashSet<>();
        for (var selection : request.groups()) {
            if (selection == null || selection.key() == null || selection.key().isBlank() || !keys.add(selection.key())
                    || selection.matchIds() == null || selection.matchIds().stream().anyMatch(Objects::isNull)
                    || new HashSet<>(selection.matchIds()).size() != selection.matchIds().size()) {
                throw invalid("Każdy blok i mecz można wybrać tylko raz.");
            }
        }
    }

    private static void validateSeasonCode(String code) {
        if (!SeasonCode.isValid(code)) {
            throw invalid("Wybierz poprawny kod sezonu.");
        }
    }

    private static Rejected invalid(String detail) { return new Rejected(Failure.INVALID, detail); }

    private static Rejected missing(String detail) { return new Rejected(Failure.MISSING, detail); }

    private static Rejected conflict(String detail) { return new Rejected(Failure.CONFLICT, detail); }

    enum Failure { INVALID, MISSING, CONFLICT }

    static final class Rejected extends RuntimeException {
        final Failure failure;

        Rejected(Failure failure, String detail) {
            super(detail);
            this.failure = failure;
        }
    }
}
