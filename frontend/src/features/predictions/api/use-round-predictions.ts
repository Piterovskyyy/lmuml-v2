import { useEffect, useRef, useState } from "react";
import { PlayerAccountError } from "@/features/account/api/player-account";
import type { FootballMatch } from "@/features/matches/api/season-matches";
import { MatchState } from "@/features/matches/model/match-status";
import {
  draftChanged,
  draftFromScore,
  type PredictionDraft,
  type PredictionScore,
} from "../model/prediction-score";
import {
  fetchPlayerPredictions,
  savePlayerPredictions,
  type PlayerPrediction,
  type PredictionRejection,
  type ScoredPlayerPrediction,
} from "./player-predictions";

type ServerClock = { time: number; receivedAt: number };
type MatchRejection = { reason: PredictionRejection["reason"]; kickoffAt: string | null };
type SavedPrediction = PredictionScore & { points: number | null };

type RoundEditor = {
  saved: Record<string, SavedPrediction>;
  drafts: Record<string, PredictionDraft>;
  rejected: Record<string, MatchRejection>;
  clock: ServerClock | null;
  loading: boolean;
  loadError: boolean;
  saving: boolean;
  feedback?: { saved: number; rejected: number } | { error: string };
};

const emptyEditor: RoundEditor = {
  saved: {},
  drafts: {},
  rejected: {},
  clock: null,
  loading: true,
  loadError: false,
  saving: false,
};

function sessionRejected(error: unknown) {
  return error instanceof PlayerAccountError && (error.status === 401 || error.status === 403);
}

function serverClock(time: string): ServerClock {
  return { time: Date.parse(time), receivedAt: performance.now() };
}

function serverTimeNow(clock: ServerClock) {
  return clock.time + performance.now() - clock.receivedAt;
}

function savedScores(predictions: ScoredPlayerPrediction[]): Record<string, SavedPrediction> {
  return Object.fromEntries(
    predictions.map(({ matchId, homeGoals, awayGoals, points }) => [
      matchId,
      { home: homeGoals, away: awayGoals, points },
    ]),
  );
}

export function currentRejection(editor: RoundEditor, match: FootballMatch) {
  const rejection = editor.rejected[match.id];
  return rejection?.kickoffAt === match.kickoffAt ? rejection.reason : undefined;
}

export function editableMatch(editor: RoundEditor, match: FootballMatch, serverTime: number) {
  return (
    match.status.state === MatchState.Scheduled &&
    match.kickoffAt !== null &&
    Date.parse(match.kickoffAt) > serverTime &&
    !currentRejection(editor, match)
  );
}

export function useRoundPredictions(
  roundId: string,
  matches: readonly FootballMatch[],
  active: boolean,
  csrfToken: string,
  refreshSession: () => void,
) {
  const [editors, setEditors] = useState<Record<string, RoundEditor>>({});
  const pendingSaves = useRef(new Set<string>());
  const savedVersions = useRef(new Map<string, number>());
  const checkedFixtures = useRef(new Map<string, readonly FootballMatch[]>());
  const editor = editors[roundId] ?? emptyEditor;

  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    const version = savedVersions.current.get(roundId);
    const canApply = () =>
      !controller.signal.aborted && version === savedVersions.current.get(roundId);
    setEditors((previous) => ({
      ...previous,
      [roundId]: { ...(previous[roundId] ?? emptyEditor), loading: true, loadError: false },
    }));
    fetchPlayerPredictions(roundId, controller.signal)
      .then((result) => {
        if (!canApply()) return;
        const clock = serverClock(result.serverNow);
        const saved = savedScores(result.predictions);
        const refreshedFixtures = checkedFixtures.current.get(roundId) !== matches;
        checkedFixtures.current.set(roundId, matches);
        setEditors((previous) => ({
          ...previous,
          [roundId]: {
            ...previous[roundId],
            saved,
            clock,
            rejected: refreshedFixtures ? {} : previous[roundId].rejected,
            loading: false,
            loadError: false,
          },
        }));
      })
      .catch((error: unknown) => {
        if (!canApply()) return;
        setEditors((previous) => ({
          ...previous,
          [roundId]: {
            ...previous[roundId],
            clock: sessionRejected(error) ? null : previous[roundId].clock,
            loading: false,
            loadError: true,
          },
        }));
      });
    return () => controller.abort();
  }, [active, matches, roundId]);

  function updateDraft(matchId: string, draft: PredictionDraft) {
    setEditors((previous) => {
      const current = previous[roundId] ?? emptyEditor;
      const drafts = { ...current.drafts };
      if (
        !draftChanged(draft, current.saved[matchId] ?? null) &&
        !current.saving &&
        !current.loading &&
        !current.loadError
      ) {
        delete drafts[matchId];
      } else {
        drafts[matchId] = draft;
      }
      return { ...previous, [roundId]: { ...current, drafts, feedback: undefined } };
    });
  }

  async function save(predictions: PlayerPrediction[]) {
    if (!active || editor.loading || editor.loadError || !predictions.length) return;
    if (pendingSaves.current.has(roundId)) return;
    pendingSaves.current.add(roundId);
    setEditors((previous) => ({
      ...previous,
      [roundId]: { ...previous[roundId], saving: true, feedback: undefined },
    }));
    try {
      const result = await savePlayerPredictions(roundId, csrfToken, predictions);
      const clock = serverClock(result.serverNow);
      const saved = savedScores(
        result.saved.map((prediction) => ({ ...prediction, points: null })),
      );
      savedVersions.current.set(roundId, (savedVersions.current.get(roundId) ?? 0) + 1);
      setEditors((previous) => {
        const current = previous[roundId];
        const drafts = { ...current.drafts };
        for (const [id, score] of Object.entries(saved)) {
          if (drafts[id] && !draftChanged(drafts[id], score)) delete drafts[id];
        }
        const rejected = { ...current.rejected };
        for (const { matchId, reason } of result.rejected) {
          const match = matches.find(({ id }) => id === matchId);
          if (match) rejected[matchId] = { reason, kickoffAt: match.kickoffAt };
        }
        return {
          ...previous,
          [roundId]: {
            ...current,
            drafts,
            saved: { ...current.saved, ...saved },
            rejected,
            clock,
            loading: false,
            loadError: false,
            saving: false,
            feedback: { saved: result.saved.length, rejected: result.rejected.length },
          },
        };
      });
    } catch (error) {
      setEditors((previous) => ({
        ...previous,
        [roundId]: {
          ...previous[roundId],
          saving: false,
          loading: true,
          feedback: {
            error: sessionRejected(error)
              ? "Sesja wymagała odświeżenia. Sprawdź typy przed ponownym zapisem."
              : "Nie udało się potwierdzić zapisu. Sprawdź, które zmiany nadal czekają na zapis.",
          },
        },
      }));
      // The server may have committed before the response was lost. Fetch the stored scores again.
      refreshSession();
    } finally {
      pendingSaves.current.delete(roundId);
    }
  }

  return {
    editor,
    entry: (id: string) => {
      const saved = editor.saved[id] ?? null;
      return { saved, draft: editor.drafts[id] ?? draftFromScore(saved) };
    },
    updateDraft,
    save,
  };
}

export function useRoundServerTime(
  clock: ServerClock | null,
  matches: readonly FootballMatch[],
  active: boolean,
) {
  const [reading, setReading] = useState<{ clock: ServerClock; time: number }>();
  useEffect(() => {
    if (!active || !clock) return;
    const currentClock = clock;
    let timer: number | undefined;
    function update() {
      const time = serverTimeNow(currentClock);
      setReading({ clock: currentClock, time });
      const nextKickoff = matches.reduce((next, match) => {
        if (!match.kickoffAt || match.status.state !== MatchState.Scheduled) return next;
        const kickoff = Date.parse(match.kickoffAt);
        return kickoff > time ? Math.min(next, kickoff) : next;
      }, Infinity);
      if (Number.isFinite(nextKickoff)) {
        timer = window.setTimeout(update, Math.min(2_147_483_647, Math.ceil(nextKickoff - time)));
      }
    }
    update();
    return () => window.clearTimeout(timer);
  }, [active, clock, matches]);
  return reading && reading.clock === clock ? reading.time : (clock?.time ?? Infinity);
}
