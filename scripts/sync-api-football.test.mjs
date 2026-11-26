import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { parseImportArguments } from "./import-api-football.mjs";
import { parseFixtureDetailsList, parseProbeArguments } from "./probe-api-football.mjs";
import {
  recordMatchdayAttempt,
  syncApiFootball,
  syncFixtureDetails,
  syncMatchdayCatalog,
} from "./sync-api-football.mjs";

const scope = { leagueId: "2", season: "2024" };
const localEnvironment = {
  LMUML_API_FOOTBALL_ENABLED: "false",
  LMUML_API_FOOTBALL_API_KEY: "fake-provider-key",
  LMUML_DB_NAME: "lmuml_dev",
  LMUML_DB_PORT: "5433",
  LMUML_DB_PASSWORD: "fake-admin-password",
  LMUML_APP_DB_PASSWORD: "fake-app-password",
  LMUML_MIGRATION_DB_PASSWORD: "fake-migration-password",
  LMUML_IMPORT_DB_USER: "lmuml_importer",
  LMUML_IMPORT_DB_PASSWORD: "test-import-password",
};
const inheritedEnvironment = {
  PATH: "tools",
  lmuml_api_football_api_key: "fake-inherited-key",
  LMUML_IMPORT_DB_PASSWORD: "fake-inherited-import-password",
  SPRING_DATASOURCE_PASSWORD: "fake-inherited-db-password",
  SPRING_PROFILES_ACTIVE: "migration",
};

const successfulAttempt = {
  seasonCode: "api-football-2-2024",
  startedAt: "2024-10-22T19:00:00.000Z",
  finishedAt: "2024-10-22T19:00:11.000Z",
  outcome: "SUCCEEDED",
};

test("reports the outcome of an attempted matchday import and preserves the original failure", async () => {
  const failure = new Error("provider request failed");

  for (const shouldFail of [false, true]) {
    const submitted = [];
    const timestamps = [successfulAttempt.startedAt, successfulAttempt.finishedAt].map(Date.parse);
    const sync = syncMatchdayCatalog(scope, {
      async synchronize(season) {
        assert.deepEqual(season, scope);
        submitted.push("download and import");
        if (shouldFail) throw failure;
      },
      async recordAttempt(attempt) { submitted.push(attempt); },
      now: () => timestamps.shift(),
    });
    if (shouldFail) await assert.rejects(sync, failure);
    else await sync;
    assert.deepEqual(submitted, ["download and import", {
      ...successfulAttempt, outcome: shouldFail ? "FAILED" : "SUCCEEDED",
    }]);
  }
});

test("a reporting error does not change the result of a completed import", async () => {
  const errors = [];
  await syncMatchdayCatalog(scope, {
    async synchronize() {},
    async recordAttempt() { throw new Error("private database detail"); },
    log: { error(message) { errors.push(message); } },
  });
  assert.deepEqual(errors, ["Nie udało się zapisać wyniku próby synchronizacji w panelu administratora."]);
});

test("matchday status uses an isolated Java profile with only importer credentials", async () => {
  await recordMatchdayAttempt(successfulAttempt, {
    localEnvironment,
    inheritedEnvironment,
    async runJava(args, environment, signal) {
      assert.ok(args.includes("--lmuml.api-football.sync-status.season-code=api-football-2-2024"));
      assert.ok(args.includes(`--lmuml.api-football.sync-status.started-at=${successfulAttempt.startedAt}`));
      assert.ok(args.includes(`--lmuml.api-football.sync-status.finished-at=${successfulAttempt.finishedAt}`));
      assert.ok(args.includes("--lmuml.api-football.sync-status.outcome=SUCCEEDED"));
      assert.ok(!args.some((arg) => arg.includes(localEnvironment.LMUML_API_FOOTBALL_API_KEY)
        || arg.includes(localEnvironment.LMUML_IMPORT_DB_PASSWORD)));
      assert.equal(environment.SPRING_PROFILES_ACTIVE, "api-football-sync-status");
      assert.equal(environment.SPRING_MAIN_WEB_APPLICATION_TYPE, "none");
      assert.equal(environment.SPRING_FLYWAY_ENABLED, "false");
      assert.equal(environment.SPRING_DATASOURCE_USERNAME, localEnvironment.LMUML_IMPORT_DB_USER);
      assert.equal(environment.SPRING_DATASOURCE_PASSWORD, localEnvironment.LMUML_IMPORT_DB_PASSWORD);
      assert.equal(environment.LMUML_API_FOOTBALL_ENABLED, "false");
      assert.ok(!Object.keys(environment).some((key) => /API_FOOTBALL_API_KEY$/i.test(key)));
      assert.equal(signal.aborted, false);
    },
  });
});

async function testPaths(t) {
  const directory = await mkdtemp(path.join(tmpdir(), "lmuml-football-sync-test-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const jarPath = path.join(directory, "test.jar");
  await writeFile(jarPath, "");
  return { jarPath, samplesRoot: path.join(directory, "samples") };
}

async function writeSample(args) {
  const prefix = "--lmuml.api-football.probe.samples-root=";
  const samplesRootArg = args.find((arg) => arg.startsWith(prefix));
  assert.ok(samplesRootArg);
  return mkdtemp(path.join(samplesRootArg.slice(prefix.length), "sample-"));
}

test("matchday enrichment imports one claimed batch into the same archive after the catalog", async (t) => {
  const paths = await testPaths(t);
  const { signal } = new AbortController();
  const fixtureIds = ["1371730", "1371731"];
  const samples = [];
  const calls = [];

  await syncMatchdayCatalog(scope, {
    withDetails: true, samplesRoot: paths.samplesRoot, signal,
    now: () => Date.parse(successfulAttempt.startedAt),
    async synchronize(parameters, options) {
      assert.equal(options.signal, signal);
      assert.equal(options.samplesRoot, paths.samplesRoot);
      return syncApiFootball(parameters, {
        ...paths, ...options, localEnvironment, inheritedEnvironment,
        async runJava(args, environment) {
          if (environment.SPRING_PROFILES_ACTIVE === "api-football-probe") {
            const directory = await writeSample(args);
            samples.push(directory);
            if (parameters.fixtureDetail === "details") {
              assert.ok(args.includes(`--lmuml.api-football.probe.fixture-ids=${fixtureIds.join(",")}`));
              calls.push("details probe");
            } else {
              assert.deepEqual(parameters, scope);
              await writeFile(path.join(directory, "fixtures.metadata.json"), JSON.stringify({
                quota: { dailyRemaining: 98, minuteRemaining: 8 },
              }));
              calls.push("catalog probe");
            }
          } else if (parameters.fixtureDetail === "details") {
            assert.ok(args.includes("--lmuml.api-football.import.fixture-details=true"));
            assert.ok(!args.some((arg) => arg.includes(".auto-details-at=")));
            calls.push("details import");
          } else {
            assert.ok(args.includes(`--lmuml.api-football.import.auto-details-at=${successfulAttempt.startedAt}`));
            await writeFile(path.join(samples.at(-1), "auto-details.json"), JSON.stringify(fixtureIds));
            calls.push("catalog import");
          }
        },
      });
    },
    async recordAttempt(attempt) { calls.push(attempt.outcome); },
  });

  assert.deepEqual(calls, ["catalog probe", "catalog import", "SUCCEEDED", "details probe", "details import"]);
  assert.deepEqual(samples.map((sample) => path.dirname(path.dirname(sample))), [paths.samplesRoot, paths.samplesRoot]);
});

const enrichmentError = "Wyniki zostały zapisane. Nie ukończono automatycznego importu szczegółów meczów.";

for (const { name, manifest, withDetails = true, error = false } of [
  { name: "opt-in is disabled", manifest: '["1371730"]', withDetails: false },
  { name: "there is no manifest" },
  { name: "the manifest is empty", manifest: "[]" },
  { name: "the manifest is malformed", manifest: "[", error: true },
  { name: "the manifest has numeric IDs", manifest: "[1371730]", error: true },
  { name: "the manifest has duplicate IDs", manifest: '["1371730","1371730"]', error: true },
  { name: "the manifest exceeds one batch", manifest: JSON.stringify(Array.from({ length: 21 }, (_, index) => String(index + 1))), error: true },
]) {
  test(`matchday submits no details requests when ${name}`, async (t) => {
    const { samplesRoot: directory } = await testPaths(t);
    await mkdir(directory);
    if (manifest !== undefined) await writeFile(path.join(directory, "auto-details.json"), manifest);
    const calls = [];
    const outcomes = [];
    const errors = [];

    await syncMatchdayCatalog(scope, {
      withDetails,
      async synchronize(parameters) {
        calls.push(parameters);
        return directory;
      },
      async recordAttempt(attempt) { outcomes.push(attempt.outcome); },
      log: { error(message) { errors.push(message); } },
    });

    assert.deepEqual(calls, [scope]);
    assert.deepEqual(outcomes, ["SUCCEEDED"]);
    assert.deepEqual(errors, error ? [enrichmentError] : []);
  });
}

test("a failed matchday details request preserves the successful catalog status", async (t) => {
  const { samplesRoot: directory } = await testPaths(t);
  await mkdir(directory);
  await writeFile(path.join(directory, "auto-details.json"), '["1371730"]');
  const calls = [];
  const outcomes = [];
  const errors = [];

  await syncMatchdayCatalog(scope, {
    withDetails: true,
    async synchronize(parameters) {
      calls.push(parameters);
      if (parameters.fixtureDetail === "details") throw new Error("private provider detail");
      return directory;
    },
    async recordAttempt(attempt) { outcomes.push(attempt.outcome); },
    log: { error(message) { errors.push(message); } },
  });

  assert.deepEqual(calls, [scope, { fixtureId: "1371730", fixtureDetail: "details" }]);
  assert.deepEqual(outcomes, ["SUCCEEDED"]);
  assert.deepEqual(errors, [enrichmentError]);
});

for (const limit of ["dailyRemaining", "minuteRemaining"]) {
  test(`catalog import still runs without claiming details when ${limit} reaches zero`, async (t) => {
    const paths = await testPaths(t);
    const calls = [];

    const directory = await syncApiFootball(scope, {
      ...paths, localEnvironment, inheritedEnvironment, autoDetailsAt: successfulAttempt.startedAt,
      async runJava(args, environment) {
        calls.push(args);
        if (environment.SPRING_PROFILES_ACTIVE === "api-football-probe") {
          const sampleDirectory = await writeSample(args);
          await writeFile(path.join(sampleDirectory, "fixtures.metadata.json"), JSON.stringify({
            quota: { [limit]: 0 },
          }));
        }
      },
    });

    assert.equal(calls.length, 2);
    assert.ok(calls[1].includes(`--lmuml.api-football.import.directory=${directory}`));
    assert.ok(!calls[1].some((arg) => arg.includes(".auto-details-at=")));
  });
}

test("sync imports only the new sample directory and isolates child credentials", async (t) => {
  const paths = await testPaths(t);
  await mkdir(path.join(paths.samplesRoot, "sample-old"), { recursive: true });
  const calls = [];
  let sampleDirectory;

  const result = await syncApiFootball({ ...scope, standings: true }, {
    ...paths, localEnvironment, inheritedEnvironment,
    async runJava(args, env) {
      calls.push({ args, env });
      if (env.SPRING_PROFILES_ACTIVE === "api-football-probe") {
        sampleDirectory = await writeSample(args);
      }
    },
  });

  assert.equal(calls.length, 2);
  assert.equal(result, sampleDirectory);
  assert.equal(path.dirname(path.dirname(sampleDirectory)), paths.samplesRoot);
  const [probe, importer] = calls;
  assert.ok(probe.args.includes("--lmuml.api-football.probe.league-id=2"));
  assert.ok(probe.args.includes("--lmuml.api-football.probe.season=2024"));
  assert.ok(probe.args.includes("--lmuml.api-football.probe.standings=true"));
  assert.ok(importer.args.includes(`--lmuml.api-football.import.directory=${sampleDirectory}`));
  assert.ok(importer.args.includes("--lmuml.api-football.import.standings=true"));

  assert.equal(probe.env.LMUML_API_FOOTBALL_API_KEY, localEnvironment.LMUML_API_FOOTBALL_API_KEY);
  assert.equal(probe.env.LMUML_API_FOOTBALL_ENABLED, "true");
  assert.ok(!Object.keys(probe.env).some((key) => /^SPRING_DATASOURCE_/i.test(key)));
  assert.ok(!Object.values(probe.env).includes(localEnvironment.LMUML_IMPORT_DB_PASSWORD));
  assert.equal(importer.env.SPRING_PROFILES_ACTIVE, "api-football-import");
  assert.equal(importer.env.SPRING_DATASOURCE_USERNAME, localEnvironment.LMUML_IMPORT_DB_USER);
  assert.equal(importer.env.SPRING_DATASOURCE_PASSWORD, localEnvironment.LMUML_IMPORT_DB_PASSWORD);
  assert.equal(importer.env.LMUML_API_FOOTBALL_ENABLED, "false");
  assert.ok(!Object.keys(importer.env).some((key) => /API_FOOTBALL_API_KEY$/i.test(key)));
  for (const { args, env } of calls) {
    assert.equal(env.PATH, "tools");
    assert.ok(!Object.values(env).some((value) => /^fake-(?:admin|app|migration|inherited)-/.test(value)));
    assert.ok(!args.some((arg) => arg.includes(localEnvironment.LMUML_API_FOOTBALL_API_KEY)
      || arg.includes(localEnvironment.LMUML_IMPORT_DB_PASSWORD)));
  }
});

test("sync stops before import when the probe fails even if it created a directory", async (t) => {
  const paths = await testPaths(t);
  const calls = [];

  await assert.rejects(syncApiFootball(scope, {
    ...paths, localEnvironment, inheritedEnvironment,
    async runJava(args, env) {
      calls.push({ args, env });
      await writeSample(args);
      throw new Error("failed probe");
    },
  }));

  assert.equal(calls.length, 1);
  assert.equal(calls[0].env.SPRING_PROFILES_ACTIVE, "api-football-probe");
  assert.ok(calls[0].args.includes("--lmuml.api-football.probe.standings=false"));
});

const fixtureDetails = ["statistics", "events", "lineups", "players", "details"];
for (const fixtureDetail of fixtureDetails) {
  const flag = `--fixture-${fixtureDetail}`;
  test(`sync routes one fixture-${fixtureDetail} sample through the isolated profiles`, async (t) => {
    const paths = await testPaths(t);
    const parameters = parseProbeArguments([flag, "1374812"]);
    const calls = [];
    const directory = await syncApiFootball(parameters, {
      ...paths, localEnvironment, inheritedEnvironment,
      async runJava(args, env) {
        calls.push({ args, env });
        if (env.SPRING_PROFILES_ACTIVE === "api-football-probe") await writeSample(args);
      },
    });

    const [probe, importer] = calls;
    assert.deepEqual(calls.map(({ env }) => env.SPRING_PROFILES_ACTIVE), ["api-football-probe", "api-football-import"]);
    assert.ok(probe.args.includes("--lmuml.api-football.probe.fixture-id=1374812"));
    assert.ok(!probe.args.some((arg) => arg.startsWith("--lmuml.api-football.probe.league-id=")));
    assert.ok(importer.args.includes(`--lmuml.api-football.import.directory=${directory}`));
    for (const detail of fixtureDetails) {
      assert.equal(probe.args.includes(`--lmuml.api-football.probe.fixture-${detail}=true`),
        detail === fixtureDetail && detail !== "statistics");
      assert.equal(importer.args.includes(`--lmuml.api-football.import.fixture-${detail}=true`), detail === fixtureDetail);
    }
    assert.equal(importer.env.LMUML_API_FOOTBALL_API_KEY, undefined);
    assert.deepEqual(parseImportArguments(["--directory", directory, flag]), { directory, fixtureDetail });
    assert.throws(() => parseProbeArguments([flag, "9223372036854775808"]));
    assert.throws(() => parseProbeArguments([flag, "1374812", "--standings"]));
    assert.throws(() => parseImportArguments(["--directory", directory, "--standings", flag]));
  });

  test(`fixture-${fixtureDetail} sync is manual and will not start the matchday watcher`, () => {
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("./sync-api-football.mjs", import.meta.url)),
      flag, "1374812", "--watch",
    ], { encoding: "utf8", shell: false, windowsHide: true });

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Użycie: node scripts\/sync-api-football\.mjs/);
  });
}

const fixtureIdsForTwoBatches = Array.from({ length: 21 }, (_, index) => String(1371730 + index));
const firstTwenty = fixtureIdsForTwoBatches.slice(0, 20);
const lastFixtureId = fixtureIdsForTwoBatches.at(-1);

for (const { name, batches, flags } of [
  { name: "20 fixtures in one request", batches: [firstTwenty], flags: [] },
  { name: "21 fixtures with a single-fixture remainder", batches: [firstTwenty, [lastFixtureId]], flags: [] },
  { name: "two fixtures sequentially on Free", batches: [["1371730"], ["1371731"]], flags: ["--sequential"] },
]) {
  test(`sync imports details for ${name}`, async (t) => {
    const paths = await testPaths(t);
    const commands = [];
    const samples = [];
    const signal = new AbortController().signal;
    const { fixtureIds, sequential } = parseFixtureDetailsList(["--fixture-details", ...batches.flat(), ...flags]);

    await syncFixtureDetails(fixtureIds, {
      sequential, signal,
      synchronize(parameters, options) {
        return syncApiFootball(parameters, {
          ...paths, ...options, localEnvironment, inheritedEnvironment,
          async runJava(args, env, childSignal) {
            assert.equal(childSignal, signal);
            if (env.SPRING_PROFILES_ACTIVE === "api-football-probe") {
              assert.ok(args.includes("--lmuml.api-football.probe.fixture-details=true"));
              assert.equal(env.LMUML_API_FOOTBALL_API_KEY, localEnvironment.LMUML_API_FOOTBALL_API_KEY);
              assert.equal(env.SPRING_DATASOURCE_PASSWORD, undefined);
              const scope = args.filter((arg) => arg.startsWith("--lmuml.api-football.probe.fixture-id"));
              assert.equal(scope.length, 1);
              commands.push(scope[0]);
              const sample = await writeSample(args);
              await writeFile(path.join(sample, "details.metadata.json"), JSON.stringify({
                quota: { dailyRemaining: 98, minuteRemaining: 8 },
              }));
              samples.push(sample);
            } else {
              assert.ok(args.includes("--lmuml.api-football.import.fixture-details=true"));
              assert.ok(args.includes(`--lmuml.api-football.import.directory=${samples.at(-1)}`));
              assert.equal(env.LMUML_API_FOOTBALL_API_KEY, undefined);
              commands.push("import");
            }
          },
        });
      },
      async wait(milliseconds, _, options) {
        assert.equal(options.signal, signal);
        assert.equal(milliseconds, 7_000);
        commands.push("wait");
      },
    });

    const expected = batches.flatMap((batch, index) => [
      ...(index > 0 ? ["wait"] : []),
      `--lmuml.api-football.probe.fixture-${batch.length === 1 ? "id" : "ids"}=${batch.join(",")}`,
      "import",
    ]);
    assert.deepEqual(commands, expected);
    assert.equal(new Set(samples).size, batches.length);
  });
}

for (const limit of ["dailyRemaining", "minuteRemaining"]) {
  test(`fixture details list stops when ${limit} reaches zero`, async (t) => {
    const directory = await mkdtemp(path.join(tmpdir(), "lmuml-fixture-quota-test-"));
    t.after(() => rm(directory, { recursive: true, force: true }));
    await writeFile(path.join(directory, "details.metadata.json"), JSON.stringify({ quota: { [limit]: 0 } }));
    const imported = [];

    await assert.rejects(syncFixtureDetails(fixtureIdsForTwoBatches, {
      async synchronize(parameters) {
        imported.push(parameters);
        return directory;
      },
      wait() { assert.fail("No further requests should be scheduled."); },
    }), { message: `Limit API-Football wyczerpany. Pozostałe mecze do pobrania: ${lastFixtureId}.` });
    assert.deepEqual(imported, [{ fixtureIds: firstTwenty, fixtureDetail: "details" }]);
  });
}

test("fixture details batch failure stops without falling back to individual requests", async () => {
  const attempted = [];
  const failure = new Error("Fixture details probe failed");

  await assert.rejects(syncFixtureDetails(fixtureIdsForTwoBatches, {
    async synchronize(parameters) {
      attempted.push(parameters);
      throw failure;
    },
    wait() { assert.fail("No further requests should be scheduled."); },
  }), failure);
  assert.deepEqual(attempted, [{ fixtureIds: firstTwenty, fixtureDetail: "details" }]);
});

test("fixture details cancellation prevents the next batch", async () => {
  const controller = new AbortController();
  const attempted = [];

  await assert.rejects(syncFixtureDetails(fixtureIdsForTwoBatches, {
    signal: controller.signal,
    async synchronize(parameters) {
      attempted.push(parameters);
      controller.abort();
    },
    wait() { assert.fail("No further requests should be scheduled."); },
  }), { name: "AbortError" });
  assert.deepEqual(attempted, [{ fixtureIds: firstTwenty, fixtureDetail: "details" }]);
});

test("fixture details list cannot run as a matchday sync or watcher", () => {
  for (const mode of ["--matchday", "--watch"]) {
    const result = spawnSync(process.execPath, [
      fileURLToPath(new URL("./sync-api-football.mjs", import.meta.url)),
      "--fixture-details", "1371730", "1371731", mode,
    ], { encoding: "utf8", shell: false, windowsHide: true });

    assert.equal(result.status, 2);
    assert.equal(result.stdout, "");
    assert.match(result.stderr, /Użycie: node scripts\/sync-api-football\.mjs/);
  }
});

test("CLI accepts details opt-in only for an automatic mode following the active season", () => {
  const mockActiveSeasonLookup = `data:text/javascript,${encodeURIComponent(`
    globalThis.fetch = async (url) => {
      console.log(String(url));
      process.exit(0);
    };
  `)}`;
  const script = fileURLToPath(new URL("./sync-api-football.mjs", import.meta.url));

  for (const mode of ["--watch", "--matchday"]) {
    const run = (...argumentsList) => spawnSync(process.execPath, [
      "--permission", "--allow-fs-read=*", "--import", mockActiveSeasonLookup, script, ...argumentsList,
    ], { encoding: "utf8", shell: false, windowsHide: true, timeout: 5000 });

    const requested = run(mode, "--with-details");
    assert.equal(requested.status, 0);
    assert.match(requested.stdout, /http:\/\/127\.0\.0\.1:8080\/api\/v1\/seasons\/active/);

    const pinned = run("--league", "2", "--season", "2024", mode, "--with-details");
    assert.equal(pinned.status, 2);
    assert.equal(pinned.stdout, "");
    assert.match(pinned.stderr, /Użycie: node scripts\/sync-api-football\.mjs/);
  }
});

test("sync skips import when cancelled just before a successful probe returns", async (t) => {
  const paths = await testPaths(t);
  const controller = new AbortController();
  const profiles = [];

  await assert.rejects(syncApiFootball(scope, {
    ...paths, localEnvironment, inheritedEnvironment, signal: controller.signal,
    async runJava(args, env, signal) {
      assert.equal(signal, controller.signal);
      const profile = env.SPRING_PROFILES_ACTIVE;
      profiles.push(profile);
      if (profile === "api-football-probe") {
        await writeSample(args);
        controller.abort();
      }
    },
  }), { name: "AbortError" });

  assert.deepEqual(profiles, ["api-football-probe"]);
});

test("sync reports import failure and keeps the downloaded samples", async (t) => {
  const paths = await testPaths(t);
  let sampleDirectory;
  const calls = [];

  await assert.rejects(syncApiFootball(scope, {
    ...paths, localEnvironment, inheritedEnvironment,
    async runJava(args, env) {
      const profile = env.SPRING_PROFILES_ACTIVE;
      calls.push({ args, profile });
      if (profile === "api-football-probe") {
        sampleDirectory = await writeSample(args);
        await writeFile(path.join(sampleDirectory, "fixtures.json"), "{}");
        return;
      }
      throw new Error("failed import");
    },
  }));

  assert.deepEqual(calls.map(({ profile }) => profile), ["api-football-probe", "api-football-import"]);
  assert.ok(calls[1].args.includes("--lmuml.api-football.import.standings=false"));
  assert.deepEqual(await readdir(sampleDirectory), ["fixtures.json"]);
});

test("sync checks importer configuration and JAR availability before launching the probe", async (t) => {
  const paths = await testPaths(t);
  let calls = 0;
  const options = {
    ...paths, localEnvironment, inheritedEnvironment,
    async runJava() { calls += 1; },
  };

  await assert.rejects(syncApiFootball(scope, {
    ...options, localEnvironment: { ...localEnvironment, LMUML_IMPORT_DB_PASSWORD: "" },
  }));
  await assert.rejects(syncApiFootball(scope, { ...options, jarPath: paths.jarPath + ".missing" }));
  assert.equal(calls, 0);
});

test("sync CLI rejects invalid arguments before startup and does not print the argument values", () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("./sync-api-football.mjs", import.meta.url)),
    "--league", "2", "--season", "2024", "--api-key", "fake-cli-token",
  ], { encoding: "utf8", shell: false, windowsHide: true });

  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Użycie: node scripts\/sync-api-football\.mjs/);
  assert.ok(!result.stderr.includes("fake-cli-token"));
});
