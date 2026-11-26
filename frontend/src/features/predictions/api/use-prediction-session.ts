import { useCallback, useLayoutEffect, useState } from "react";
import { playerAccountApi, type PlayerSession } from "@/features/account/api/player-account";

type AuthenticatedSession = Extract<PlayerSession, { authenticated: true }>;
type SessionState =
  | { status: "checking" | "error"; previous?: AuthenticatedSession }
  | { status: "ready"; session: PlayerSession };

function knownPlayer(state: SessionState) {
  if (state.status !== "ready") return state.previous;
  return state.session.authenticated ? state.session : undefined;
}

export function usePredictionSession(active: boolean) {
  const [state, setState] = useState<SessionState>({ status: "checking" });
  const [attempt, setAttempt] = useState(0);
  const refresh = useCallback(() => setAttempt((value) => value + 1), []);

  useLayoutEffect(() => {
    // Keep drafts in memory while leaving the page, but hide previous account data until verified.
    setState((previous) => ({ status: "checking", previous: knownPlayer(previous) }));
    if (!active) return;

    const controller = new AbortController();
    playerAccountApi
      .session(controller.signal)
      .then((session) => {
        if (!controller.signal.aborted) setState({ status: "ready", session });
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setState((previous) => ({ status: "error", previous: knownPlayer(previous) }));
        }
      });
    return () => controller.abort();
  }, [active, attempt]);

  return { state, player: knownPlayer(state), refresh };
}
