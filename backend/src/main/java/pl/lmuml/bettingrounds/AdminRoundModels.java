package pl.lmuml.bettingrounds;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

final class AdminRoundModels {

    private AdminRoundModels() {}

    record Season(String code, String name) {}

    record Match(UUID id, Instant kickoffAt, String homeTeam, String awayTeam) {}

    record Group(String key, String label, String tournamentRound, List<Match> matches, UUID assignedRoundId) {
        Group {
            matches = List.copyOf(matches);
        }
    }

    enum Status { DRAFT, PUBLISHED }

    record Round(UUID id, int number, String name, Status status, List<String> groupKeys, int matchCount,
                 Instant publishedAt, boolean awaitingFinal, Match pendingFinalMatch) {}

    record Plan(Season season, int nextNumber, List<Group> groups, List<Round> rounds) {}

    @JsonIgnoreProperties("name")
    record DraftRequest(String seasonCode, Integer number, List<GroupSelection> groups) {}

    record GroupSelection(String key, List<UUID> matchIds) {}

    record AttachFinalRequest(UUID matchId) {}
}
