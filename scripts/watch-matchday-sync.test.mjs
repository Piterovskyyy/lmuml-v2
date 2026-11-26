import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { watchMatchdaySync } from "./watch-matchday-sync.mjs";

const minute = 60_000;

test("watch starts immediately, then skips elapsed quarters after a long check", async () => {
  const controller = new AbortController();
  const startedAt = Date.parse("2026-11-17T22:01:30Z");
  let timestamp = startedAt;
  const events = [];

  await watchMatchdaySync(async () => {
    events.push(["check", timestamp]);
    if (timestamp === startedAt) {
      timestamp += 31 * minute;
    } else {
      controller.abort();
    }
  }, {
    signal: controller.signal,
    now: () => timestamp,
    async wait(duration) {
      events.push(["wait", duration]);
      timestamp += duration;
    },
    async prune({ now }) {
      events.push(["prune", now]);
      return 0;
    },
  });

  assert.deepEqual(events, [
    ["prune", startedAt],
    ["check", startedAt],
    ["wait", 12 * minute + 30_000],
    ["check", Date.parse("2026-11-17T22:45:00Z")],
  ]);
});

test("watch retries a failed check at the next quarter and prunes once per UTC day", async () => {
  const controller = new AbortController();
  const firstCheck = Date.parse("2026-11-17T23:44:00Z");
  let timestamp = firstCheck;
  const checkTimes = [];
  const cleanupTimes = [];
  const errors = [];
  const messages = [];

  await watchMatchdaySync(async () => {
    checkTimes.push(timestamp);
    if (checkTimes.length === 1) throw new Error("backend unavailable");
    if (checkTimes.length === 4) controller.abort();
  }, {
    signal: controller.signal,
    now: () => timestamp,
    async wait(duration) { timestamp += duration; },
    async prune({ now }) {
      cleanupTimes.push(now);
      if (cleanupTimes.length === 1) throw new Error("cleanup unavailable");
      return 1;
    },
    log: {
      error: (...args) => errors.push(args.join(" ")),
      log: (...args) => messages.push(args.join(" ")),
    },
  });

  assert.deepEqual(checkTimes, [
    firstCheck,
    Date.parse("2026-11-17T23:45:00Z"),
    Date.parse("2026-11-18T00:00:00Z"),
    Date.parse("2026-11-18T00:15:00Z"),
  ]);
  assert.deepEqual(cleanupTimes, [firstCheck, Date.parse("2026-11-18T00:00:00Z")]);
  assert.equal(errors.length, 2);
  assert.match(errors[0], /cleanup unavailable/);
  assert.match(errors[1], /backend unavailable/);
  assert.equal(messages.length, 1);
});

test("stopping watch aborts the active check without retrying or logging a failure", async () => {
  const controller = new AbortController();
  const errors = [];
  const unexpectedWaits = [];
  let checkSignal;

  await watchMatchdaySync(async (signal) => {
    checkSignal = signal;
    controller.abort();
    signal.throwIfAborted();
  }, {
    signal: controller.signal,
    prune: async () => 0,
    wait: async (...args) => unexpectedWaits.push(args),
    log: { error: (error) => errors.push(error) },
  });

  assert.notEqual(checkSignal, controller.signal);
  assert.equal(checkSignal.aborted, true);
  assert.deepEqual(unexpectedWaits, []);
  assert.deepEqual(errors, []);
});

test("stopping watch while it waits prevents the next check", async () => {
  const controller = new AbortController();
  let checks = 0;
  let waitSignal;

  await watchMatchdaySync(async () => { checks += 1; }, {
    signal: controller.signal,
    prune: async () => 0,
    async wait(_duration, signal) {
      waitSignal = signal;
      controller.abort();
      signal.throwIfAborted();
    },
  });

  assert.equal(waitSignal, controller.signal);
  assert.equal(waitSignal.aborted, true);
  assert.equal(checks, 1);
});

test("CLI rejects watch combined with another mode before starting the loop", () => {
  const script = fileURLToPath(new URL("./sync-api-football.mjs", import.meta.url));

  for (const flag of ["--matchday", "--standings"]) {
    const result = spawnSync(process.execPath, [script, "--league", "2", "--season", "2024", flag, "--watch"], {
      encoding: "utf8",
      shell: false,
      windowsHide: true,
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Użycie:.*--watch/);
    assert.equal(result.stdout, "");
  }
});
