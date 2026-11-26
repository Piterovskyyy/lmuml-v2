package pl.lmuml.bettingrounds;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import static pl.lmuml.bettingrounds.AdminRoundModels.Group;
import static pl.lmuml.bettingrounds.AdminRoundModels.Match;

final class FixtureGroups {

    static final String FINAL_KEY = "final";
    private static final String FINAL_ROUND = "Final";
    private static final Pattern LEAGUE_ROUND = Pattern.compile("League Stage - (\\d+)");
    private static final Comparator<Match> BY_KICKOFF =
            Comparator.comparing(Match::kickoffAt, Comparator.nullsLast(Comparator.naturalOrder()))
                    .thenComparing(Match::id);
    private static final Comparator<Group> BY_FIRST_MATCH = Comparator.comparing(
            (Group group) -> group.matches().isEmpty() ? null : group.matches().getFirst().kickoffAt(),
            Comparator.nullsLast(Comparator.naturalOrder()));

    private FixtureGroups() {}

    static List<Group> plan(List<Fixture> fixtures, List<SavedGroup> saved, boolean championsLeague) {
        var byId = new HashMap<UUID, Fixture>();
        var byRound = new LinkedHashMap<String, List<Fixture>>();
        for (var fixture : fixtures) {
            byId.put(fixture.match().id(), fixture);
            if (fixture.tournamentRound() != null && !fixture.tournamentRound().isBlank()) {
                byRound.computeIfAbsent(fixture.tournamentRound(), ignored -> new ArrayList<>()).add(fixture);
            }
        }

        var groups = new LinkedHashMap<String, Group>();
        var assigned = new HashMap<UUID, String>();
        for (var group : saved) {
            var matches = group.matchIds().stream().map(byId::get).map(Fixture::match).sorted(BY_KICKOFF).toList();
            groups.put(group.key(), new Group(group.key(), label(group.key(), group.tournamentRound()),
                    group.tournamentRound(), matches, group.roundId()));
            group.matchIds().forEach(id -> assigned.put(id, group.key()));
        }

        byRound.forEach((round, matches) -> {
            if (FINAL_ROUND.equals(round)) {
                return;
            }
            var stage = KnockoutStage.fromRound(round);
            if (championsLeague && stage != null) {
                split(stage, matches, assigned).forEach(group -> offer(groups, assigned, group));
            } else if (!championsLeague || LEAGUE_ROUND.matcher(round).matches()) {
                offer(groups, assigned, group("round:" + round, round, matches));
            }
        });

        boolean hasSemifinals = groups.values().stream()
                .anyMatch(group -> KnockoutStage.SEMI_FINAL.round.equals(group.tournamentRound()));
        var finals = byRound.getOrDefault(FINAL_ROUND, List.of());
        if (finals.size() == 1 && finals.getFirst().confirmed()) {
            offer(groups, assigned, group(FINAL_KEY, FINAL_ROUND, finals));
        } else if (championsLeague && hasSemifinals) {
            offer(groups, assigned, group(FINAL_KEY, FINAL_ROUND, List.of()));
        }
        return groups.values().stream().sorted(BY_FIRST_MATCH).toList();
    }

    static Match confirmedFinal(List<Fixture> fixtures) {
        var finals = fixtures.stream().filter(fixture -> FINAL_ROUND.equals(fixture.tournamentRound())).toList();
        return finals.size() == 1 && finals.getFirst().confirmed() ? finals.getFirst().match() : null;
    }

    private static void offer(Map<String, Group> groups, Map<UUID, String> assigned, Group group) {
        if (group.matches().stream().noneMatch(match -> assigned.containsKey(match.id()))) {
            groups.putIfAbsent(group.key(), group);
        }
    }

    private static List<Group> split(KnockoutStage stage, List<Fixture> fixtures, Map<UUID, String> assigned) {
        var pairs = new LinkedHashMap<Pair, List<Fixture>>();
        for (var fixture : fixtures) {
            var pair = Pair.of(fixture.homeTeamId(), fixture.awayTeamId());
            pairs.computeIfAbsent(pair, ignored -> new ArrayList<>()).add(fixture);
        }
        if (pairs.size() != stage.pairs) {
            return List.of();
        }

        String firstKey = stage.key + ":first-leg";
        String secondKey = stage.key + ":second-leg";
        var firstLegs = new ArrayList<Fixture>();
        var secondLegs = new ArrayList<Fixture>();
        for (var pair : pairs.values()) {
            if (pair.size() != 2) {
                return List.of();
            }
            var first = pair.getFirst();
            var second = pair.getLast();
            if (!first.homeTeamId().equals(second.awayTeamId())) {
                return List.of();
            }
            String firstAssignment = assigned.get(first.match().id());
            String secondAssignment = assigned.get(second.match().id());
            if (firstAssignment != null && !firstAssignment.equals(firstKey) && !firstAssignment.equals(secondKey)
                    || secondAssignment != null && !secondAssignment.equals(firstKey) && !secondAssignment.equals(secondKey)
                    || firstAssignment != null && firstAssignment.equals(secondAssignment)) {
                return List.of();
            }
            if (firstAssignment == null && secondAssignment == null) {
                Instant firstKickoff = first.match().kickoffAt();
                Instant secondKickoff = second.match().kickoffAt();
                if (firstKickoff == null || secondKickoff == null || firstKickoff.equals(secondKickoff)) {
                    return List.of();
                }
                if (firstKickoff.isAfter(secondKickoff)) {
                    first = pair.getLast();
                    second = pair.getFirst();
                }
            } else if (secondKey.equals(firstAssignment) || firstKey.equals(secondAssignment)) {
                first = pair.getLast();
                second = pair.getFirst();
            }
            firstLegs.add(first);
            secondLegs.add(second);
        }
        return List.of(group(firstKey, stage.round, firstLegs), group(secondKey, stage.round, secondLegs));
    }

    private static Group group(String key, String round, List<Fixture> fixtures) {
        return new Group(key, label(key, round), round,
                fixtures.stream().map(Fixture::match).sorted(BY_KICKOFF).toList(), null);
    }

    private static String label(String key, String round) {
        var leagueRound = LEAGUE_ROUND.matcher(round);
        if (leagueRound.matches()) {
            return "Faza ligowa · kolejka " + leagueRound.group(1);
        }
        if (FINAL_ROUND.equals(round)) {
            return "Finał";
        }
        var stage = KnockoutStage.fromRound(round);
        if (stage == null) {
            return round;
        }
        if (key.endsWith(":first-leg")) {
            return stage.label + " · pierwsze mecze";
        }
        if (key.endsWith(":second-leg")) {
            return stage.label + " · rewanże";
        }
        return stage.label;
    }

    record Fixture(Match match, UUID homeTeamId, UUID awayTeamId, String tournamentRound, String providerStatus) {
        private static final Set<String> CONFIRMED = Set.of("NS", "1H", "2H", "ET", "P", "LIVE",
                "HT", "BT", "FT", "AET", "PEN");

        boolean confirmed() {
            return match.kickoffAt() != null && CONFIRMED.contains(providerStatus);
        }
    }

    record SavedGroup(String key, String tournamentRound, UUID roundId, List<UUID> matchIds) {}

    private record Pair(UUID a, UUID b) {
        static Pair of(UUID a, UUID b) {
            return a.compareTo(b) < 0 ? new Pair(a, b) : new Pair(b, a);
        }
    }

    private enum KnockoutStage {
        PLAY_OFF("knockout-play-off", "Knockout Round Play-offs", "Baraże", 8),
        ROUND_OF_16("round-of-16", "Round of 16", "1/8 finału", 8),
        QUARTER_FINAL("quarter-final", "Quarter-finals", "Ćwierćfinały", 4),
        SEMI_FINAL("semi-final", "Semi-finals", "Półfinały", 2);

        final String key;
        final String round;
        final String label;
        final int pairs;

        KnockoutStage(String key, String round, String label, int pairs) {
            this.key = key;
            this.round = round;
            this.label = label;
            this.pairs = pairs;
        }

        static KnockoutStage fromRound(String round) {
            return switch (round) {
                case "Knockout Round Play-offs" -> PLAY_OFF;
                case "Round of 16" -> ROUND_OF_16;
                case "Quarter-finals" -> QUARTER_FINAL;
                case "Semi-finals" -> SEMI_FINAL;
                default -> null;
            };
        }
    }
}
