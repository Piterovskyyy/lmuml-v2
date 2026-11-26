import { useEffect, useState } from "react";
import { fetchActiveSeason } from "@/features/matches/api/active-season";
import {
  DEFAULT_SEASON_CODE,
  readRequestedSeasonCode,
} from "@/features/matches/model/season-selection";

type Selection = { status: "loading" | "error" } | { status: "ready"; seasonCode: string };

export function useActiveSeason(required: boolean, showDemo: boolean) {
  const [selection, setSelection] = useState<Selection>(() => {
    const requested = readRequestedSeasonCode() ?? (showDemo ? DEFAULT_SEASON_CODE : null);
    return requested ? { status: "ready", seasonCode: requested } : { status: "loading" };
  });

  useEffect(() => {
    if (!required || selection.status !== "loading") return;
    const controller = new AbortController();
    void fetchActiveSeason(controller.signal).then(
      ({ seasonCode }) => {
        if (controller.signal.aborted) return;
        setSelection({ status: "ready", seasonCode: seasonCode ?? DEFAULT_SEASON_CODE });
      },
      () => {
        if (!controller.signal.aborted) setSelection({ status: "error" });
      },
    );
    return () => controller.abort();
  }, [required, selection.status]);

  return { selection, retry: () => setSelection({ status: "loading" }) };
}
