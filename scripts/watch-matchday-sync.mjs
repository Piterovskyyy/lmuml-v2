import { setTimeout } from "node:timers/promises";
import { pruneAutomaticSamples } from "./automatic-samples.mjs";
import { matchdayIntervalMs } from "./matchday-sync.mjs";

const attemptTimeoutMs = 3 * 60_000;

function waitForNextCheck(milliseconds, signal) {
  return setTimeout(milliseconds, undefined, { signal });
}

export async function watchMatchdaySync(runCheck, {
  signal,
  now = Date.now,
  wait = waitForNextCheck,
  prune = pruneAutomaticSamples,
  log = console,
}) {
  let lastPruneDate;
  while (!signal.aborted) {
    const timestamp = now();
    const utcDate = new Date(timestamp).toISOString().slice(0, 10);
    if (lastPruneDate !== utcDate) {
      lastPruneDate = utcDate;
      try {
        const removed = await prune({ now: timestamp });
        if (removed > 0) log.log(`Usunięto wygasłe katalogi automatycznej synchronizacji (${removed}).`);
      } catch (error) {
        log.error(`Nie udało się posprzątać próbek: ${error.message}`);
      }
    }
    if (signal.aborted) return;

    try {
      const attemptSignal = AbortSignal.any([signal, AbortSignal.timeout(attemptTimeoutMs)]);
      await runCheck(attemptSignal);
    } catch (error) {
      if (signal.aborted) return;
      log.error(`Nie udało się zsynchronizować sezonu: ${error.message}`);
    }
    if (signal.aborted) return;

    const checkedAt = now();
    const delay = matchdayIntervalMs - checkedAt % matchdayIntervalMs;
    try {
      await wait(delay, signal);
    } catch (error) {
      if (signal.aborted) return;
      throw error;
    }
  }
}
