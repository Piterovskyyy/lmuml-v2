import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtemp, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { runMatchdaySync } from "./matchday-sync.mjs";

const scope = { leagueId: "2", season: "2024" };
const seasonCode = "api-football-2-2024";
const kickoffAt = "2024-11-27T18:00:00.000Z";
const quarterHour = 15 * 60 * 1000;
const activeSeasonUrl = "http://127.0.0.1:8080/api/v1/seasons/active";

function match(state, time = kickoffAt) {
  return { kickoffAt: time, status: { state } };
}

function schedule(matches, code = seasonCode) {
  return Response.json({ season: { code }, matches });
}

async function testDirectory(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "lmuml-matchday-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  return directory;
}

test("matchday sync is eligible from 15 minutes before kickoff through three hours after", async (t) => {
  const stateDirectory = await testDirectory(t);
  const runAt = (time, state) => runMatchdaySync(scope, async () => {}, {
    stateDirectory,
    now: () => Date.parse(time),
    request: async () => schedule([match(state)]),
  });

  assert.equal(await runAt("2024-11-27T17:44:59.999Z", "SCHEDULED"), "outside-window");
  assert.equal(await runAt("2024-11-27T17:45:00.000Z", "SCHEDULED"), "synced");
  assert.equal(await runAt("2024-11-27T21:00:00.000Z", "FINISHED"), "synced");
  assert.equal(await runAt("2024-11-27T21:00:00.001Z", "SUSPENDED"), "outside-window");
});

test("overlapping match windows use one sync for the requested season", async (t) => {
  const stateDirectory = await testDirectory(t);
  const { signal } = new AbortController();
  const syncCalls = [];
  const requestedUrls = [];

  const result = await runMatchdaySync(scope, async (parameters, options) => {
    syncCalls.push({ parameters, signal: options.signal });
  }, {
    stateDirectory,
    signal,
    now: () => Date.parse(kickoffAt),
    async request(url) {
      requestedUrls.push(String(url));
      return schedule([match("LIVE"), match("BREAK"), match("SCHEDULED", "2024-11-27T18:15:00Z")]);
    },
  });

  assert.equal(result, "synced");
  assert.deepEqual(requestedUrls, [`http://127.0.0.1:8080/api/v1/seasons/${seasonCode}/matches`]);
  assert.deepEqual(syncCalls, [{ parameters: scope, signal }]);
});

test("postponed, cancelled, undated and archived matches do not trigger a sync", async (t) => {
  const stateDirectory = await testDirectory(t);
  const result = await runMatchdaySync(scope, async () => assert.fail("Unexpected provider sync"), {
    stateDirectory,
    now: () => Date.parse(kickoffAt),
    request: async () => schedule([
      match("POSTPONED"), match("CANCELLED"), match("ABANDONED"), match("UNKNOWN"),
      match("TIME_UNCONFIRMED"), match("SCHEDULED", null),
      match("FINISHED", "2024-10-01T19:00:00Z"),
    ]),
  });

  assert.equal(result, "outside-window");
});

test("only one concurrent invocation claims a UTC slot and the claim persists across calls", async (t) => {
  const stateDirectory = await testDirectory(t);
  const seasonTwo = { ...scope, season: "2025" };
  let calls = 0;
  const run = (parameters) => runMatchdaySync(parameters, async () => { calls += 1; }, {
    stateDirectory,
    now: () => Date.parse(kickoffAt),
    request: async () => schedule([match("LIVE")], `api-football-2-${parameters.season}`),
  });

  const results = await Promise.all([run(scope), run(seasonTwo), run(scope)]);
  assert.deepEqual(results.sort(), ["slot-used", "slot-used", "synced"]);
  assert.equal(await run(scope), "slot-used");
  assert.equal(calls, 1);
});

test("failed sync consumes its slot and the daily limit resets at UTC midnight", async (t) => {
  const stateDirectory = await testDirectory(t);
  const utcMidnight = Date.parse("2024-11-27T00:00:00.000Z");
  const importerError = new Error("Unable to import the fixtures");
  let calls = 0;
  const runAtSlot = (slot, parameters = scope) => {
    const time = utcMidnight + slot * quarterHour;
    return runMatchdaySync(parameters, async () => {
      calls += 1;
      if (calls === 1) throw importerError;
    }, {
      stateDirectory,
      now: () => time,
      request: async () => schedule([match("LIVE", new Date(time).toISOString())], `api-football-2-${parameters.season}`),
    });
  };

  await assert.rejects(runAtSlot(0), importerError);
  assert.equal(await runAtSlot(0), "slot-used");
  for (let slot = 1; slot < 32; slot += 1) {
    assert.equal(await runAtSlot(slot), "synced");
  }
  assert.equal(await runAtSlot(32, { ...scope, season: "2025" }), "daily-limit");
  assert.equal(await runAtSlot(95), "daily-limit");
  assert.equal(calls, 32);
  assert.equal(await runAtSlot(96), "synced");
  assert.equal(calls, 33);
});

test("a failed or invalid local API response stops sync before claiming the slot", async (t) => {
  const stateDirectory = await testDirectory(t);
  const options = { stateDirectory, now: () => Date.parse(kickoffAt) };
  let calls = 0;
  const run = (request) => runMatchdaySync(scope, async () => { calls += 1; }, { ...options, request });

  await assert.rejects(run(async () => new Response(null, { status: 404 })));
  await assert.rejects(run(async () => new Response(null, { status: 503 })));
  await assert.rejects(run(async () => new Response("malformed JSON")));
  await assert.rejects(run(async () => schedule([match("LIVE")], "api-football-2-2025")));
  await assert.rejects(run(async () => schedule([match("LIVE"), { kickoffAt }])));
  await assert.rejects(run(async () => schedule([match("LIVE", "not a timestamp")])));
  assert.equal(calls, 0);
  assert.equal(await run(async () => schedule([match("LIVE")])), "synced");
  assert.equal(calls, 1);
});

test("automatic matchday sync reads the selected season again and shares the slot after a switch", async (t) => {
  const stateDirectory = await testDirectory(t);
  const previousFixturesUrl = `http://127.0.0.1:8080/api/v1/seasons/${seasonCode}/matches`;
  const nextSeasonCode = "api-football-3-2025";
  const nextFixturesUrl = `http://127.0.0.1:8080/api/v1/seasons/${nextSeasonCode}/matches`;
  const { signal } = new AbortController();
  const requestedUrls = [];
  const syncCalls = [];
  let selectedCode = seasonCode;
  let now = Date.parse(kickoffAt);

  const run = () => runMatchdaySync(null, async (parameters, options) => {
    syncCalls.push({ parameters, signal: options.signal });
  }, {
    stateDirectory,
    signal,
    now: () => now,
    async request(url) {
      const requested = String(url);
      requestedUrls.push(requested);
      if (requested === activeSeasonUrl) return Response.json({ seasonCode: selectedCode });
      assert.equal(requested, selectedCode === seasonCode ? previousFixturesUrl : nextFixturesUrl);
      return schedule([match("LIVE")], selectedCode);
    },
  });

  assert.equal(await run(), "synced");
  selectedCode = nextSeasonCode;
  assert.equal(await run(), "slot-used");
  now += quarterHour;
  assert.equal(await run(), "synced");
  assert.deepEqual(requestedUrls, [
    activeSeasonUrl, previousFixturesUrl,
    activeSeasonUrl, nextFixturesUrl,
    activeSeasonUrl, nextFixturesUrl,
  ]);
  assert.deepEqual(syncCalls, [
    { parameters: scope, signal },
    { parameters: { leagueId: "3", season: "2025" }, signal },
  ]);
});

test("automatic matchday sync without an active season leaves quota untouched", async (t) => {
  const stateDirectory = await testDirectory(t);
  const requestedUrls = [];

  const result = await runMatchdaySync(null, async () => assert.fail("Unexpected provider sync"), {
    stateDirectory,
    now: () => Date.parse(kickoffAt),
    async request(url) {
      requestedUrls.push(String(url));
      return Response.json({ seasonCode: null });
    },
  });

  assert.equal(result, "no-active-season");
  assert.deepEqual(requestedUrls, [activeSeasonUrl]);
  assert.deepEqual(await readdir(stateDirectory), []);
});

test("unavailable or malformed season selection stops automatic sync before fetching matches", async (t) => {
  const stateDirectory = await testDirectory(t);
  const responses = [
    new Response(null, { status: 503 }),
    new Response("malformed JSON"),
    Response.json({}),
    Response.json({ seasonCode: 2024 }),
    Response.json({ seasonCode: "demo-2024" }),
    Response.json({ seasonCode: "api-football-02-2024" }),
    Response.json({ seasonCode: "api-football-2-0999" }),
    Response.json({ seasonCode: "api-football-9223372036854775808-2024" }),
  ];
  const requestedUrls = [];
  let syncCalls = 0;

  for (const response of responses) {
    await assert.rejects(runMatchdaySync(null, async () => { syncCalls += 1; }, {
      stateDirectory,
      now: () => Date.parse(kickoffAt),
      async request(url) {
        requestedUrls.push(String(url));
        return response;
      },
    }));
  }

  assert.deepEqual(requestedUrls, responses.map(() => activeSeasonUrl));
  assert.equal(syncCalls, 0);
  assert.deepEqual(await readdir(stateDirectory), []);
});

test("CLI refuses to combine matchday with standings mode", () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("./sync-api-football.mjs", import.meta.url)),
    "--league", "2", "--season", "2024", "--standings", "--matchday",
  ], { encoding: "utf8", shell: false, windowsHide: true });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Użycie: node scripts\/sync-api-football\.mjs/);
});
