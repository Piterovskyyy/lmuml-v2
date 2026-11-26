import { useEffect, useEffectEvent, useState } from "react";
import { z } from "zod";

const initialRetryDelayMs = 1_000;
const maxRetryDelayMs = 30_000;
const subscriptionTimeoutMs = 10_000;
const policyViolationCode = 1008;

const fixtureUpdateSchema = z.object({
  type: z.literal("fixtures"),
  fixturesCapturedAt: z.iso.datetime({ offset: true }).nullable(),
});

function fixtureUpdate(data: unknown) {
  if (typeof data !== "string") return undefined;
  try {
    return fixtureUpdateSchema.safeParse(JSON.parse(data)).data;
  } catch {
    return undefined;
  }
}

export function useSeasonUpdates(
  seasonCode: string,
  refresh: () => void,
  { enabled, fixturesCapturedAt }: { enabled: boolean; fixturesCapturedAt?: string | null },
) {
  const [connectedSeason, setConnectedSeason] = useState<string | null>(null);
  const refreshIfChanged = useEffectEvent((version: string | null) => {
    if (version !== fixturesCapturedAt) refresh();
  });
  const canStream = enabled && fixturesCapturedAt !== undefined;

  useEffect(() => {
    setConnectedSeason(null);
    if (!canStream || typeof WebSocket === "undefined") return;

    const url = new URL("/api/v1/season-updates", window.location.href);
    url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
    let socket: WebSocket | undefined;
    let subscriptionTimer: number | undefined;
    let retryTimer: number | undefined;
    let retryDelayMs = initialRetryDelayMs;

    function clearSubscriptionTimer() {
      window.clearTimeout(subscriptionTimer);
      subscriptionTimer = undefined;
    }

    function closeSocket() {
      clearSubscriptionTimer();
      const previous = socket;
      socket = undefined;
      previous?.close();
    }

    function scheduleReconnect() {
      if (document.hidden) return;
      retryTimer = window.setTimeout(() => {
        retryTimer = undefined;
        connect();
      }, retryDelayMs);
      retryDelayMs = Math.min(retryDelayMs * 2, maxRetryDelayMs);
    }

    function connect() {
      if (document.hidden || socket || retryTimer !== undefined) return;
      const connection = new WebSocket(url);
      socket = connection;
      let receivedVersion: string | null | undefined;

      subscriptionTimer = window.setTimeout(() => {
        if (socket !== connection) return;
        closeSocket();
        scheduleReconnect();
      }, subscriptionTimeoutMs);

      connection.onopen = () => {
        if (socket !== connection) return;
        connection.send(JSON.stringify({ type: "subscribe", seasonCode }));
      };

      connection.onmessage = ({ data }) => {
        if (socket !== connection) return;
        const update = fixtureUpdate(data);
        if (!update) return;
        clearSubscriptionTimer();
        retryDelayMs = initialRetryDelayMs;
        const version = update.fixturesCapturedAt;
        // Seasons with local data can change before there is an imported fixture version.
        setConnectedSeason(version === null ? null : seasonCode);
        if (version === receivedVersion) return;
        receivedVersion = version;
        refreshIfChanged(version);
      };

      connection.onclose = ({ code }) => {
        if (socket !== connection) return;
        clearSubscriptionTimer();
        socket = undefined;
        setConnectedSeason(null);
        if (code !== policyViolationCode) scheduleReconnect();
      };
    }

    function stop() {
      window.clearTimeout(retryTimer);
      retryTimer = undefined;
      retryDelayMs = initialRetryDelayMs;
      closeSocket();
    }

    function updateVisibility() {
      if (document.hidden) {
        stop();
        setConnectedSeason(null);
      } else {
        connect();
      }
    }

    updateVisibility();
    document.addEventListener("visibilitychange", updateVisibility);
    return () => {
      document.removeEventListener("visibilitychange", updateVisibility);
      stop();
    };
  }, [canStream, seasonCode]);

  return canStream && connectedSeason === seasonCode;
}
