package pl.lmuml.football.matches;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import pl.lmuml.football.matches.SeasonMatchesResponse.Competition;
import pl.lmuml.football.matches.SeasonMatchesResponse.MatchItem;
import pl.lmuml.football.matches.SeasonMatchesResponse.Season;

record SeasonBettingRoundsResponse(Season season, Competition competition, List<BettingRound> rounds) {
    SeasonBettingRoundsResponse {
        rounds = List.copyOf(rounds);
    }

    record BettingRound(UUID id, int number, String name, Instant publishedAt, boolean awaitingFinal,
            List<MatchItem> matches) {
        BettingRound {
            matches = List.copyOf(matches);
        }
    }
}
