GRANT SELECT, INSERT, DELETE ON lmuml.betting_rounds,
    lmuml.betting_round_groups, lmuml.betting_round_matches TO "${runtime}";

GRANT UPDATE (published_at) ON lmuml.betting_rounds TO "${runtime}";
