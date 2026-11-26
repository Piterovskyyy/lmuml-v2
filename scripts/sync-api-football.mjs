import { spawn } from "node:child_process";
import { access, constants, mkdir, mkdtemp, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { setTimeout } from "node:timers/promises";
import { automaticSamplesRoot } from "./automatic-samples.mjs";
import { importJavaArguments } from "./import-api-football.mjs";
import {
  backendJarPath,
  importBackendEnvironment,
  importDatabase,
  probeBackendEnvironment,
  projectDirectory,
  readLocalEnvironment,
} from "./local-environment.mjs";
import { runMatchdaySync } from "./matchday-sync.mjs";
import { isProviderId, parseFixtureDetailsList, parseProbeArguments, probeJavaArguments } from "./probe-api-football.mjs";
import { watchMatchdaySync } from "./watch-matchday-sync.mjs";

const usage = "Użycie: node scripts/sync-api-football.mjs (--watch | --matchday) [--with-details], --league <ID> --season <RRRR> [--standings | --matchday | --watch], --fixture-details <ID_MECZU> [<ID_MECZU> …] [--sequential] lub (--fixture-statistics | --fixture-events | --fixture-lineups | --fixture-players) <ID_MECZU>";
const maxFixturesPerRequest = 20;
const fixtureRequestIntervalMs = 7_000;
const matchdayMessages = {
  "no-active-season": "Brak aktywnego sezonu. Ustaw go w panelu administratora.",
  "outside-window": "Brak meczów w oknie synchronizacji.",
  "slot-used": "Synchronizację zarezerwowano już w tym kwadransie.",
  "daily-limit": "Wykorzystano dzienny limit automatycznej synchronizacji.",
  synced: "Wyniki sezonu zostały zsynchronizowane.",
};

function launchJava(argumentsList, environment, signal) {
  return new Promise((resolve, reject) => {
    const child = spawn("java", argumentsList, {
      cwd: projectDirectory,
      env: environment,
      signal,
      stdio: "inherit",
      shell: false,
      windowsHide: true,
    });
    let startFailed = false;
    child.once("error", () => { startFailed = true; });
    child.once("close", (code, childSignal) => {
      if (signal?.aborted) {
        reject(signal.reason);
      } else if (startFailed) {
        reject(new Error("Nie udało się uruchomić Javy. Uruchom skrypt przez mise exec."));
      } else if (code !== 0) {
        const reason = childSignal ? "po sygnale " + childSignal : "z kodem " + code;
        reject(new Error("Java zakończyła się " + reason + "."));
      } else {
        resolve();
      }
    });
  });
}

async function readSampleJson(directory, file, signal) {
  return JSON.parse(await readFile(path.join(directory, file), { encoding: "utf8", signal }));
}

async function quotaExhausted(directory, sample, signal) {
  const { quota } = await readSampleJson(directory, `${sample}.metadata.json`, signal);
  return quota?.dailyRemaining === 0 || quota?.minuteRemaining === 0;
}

export async function syncApiFootball(parameters, {
  localEnvironment,
  inheritedEnvironment = process.env,
  samplesRoot = path.join(projectDirectory, ".local", "api-football"),
  runJava = launchJava,
  signal,
  jarPath = backendJarPath,
  autoDetailsAt,
} = {}) {
  signal?.throwIfAborted();
  const local = localEnvironment ?? await readLocalEnvironment().catch(() => {
    throw new Error("Nie udało się odczytać lokalnego .env. Uruchom najpierw init-env.mjs.");
  });
  const probeEnvironment = probeBackendEnvironment(inheritedEnvironment, local);
  const importEnvironment = importBackendEnvironment(inheritedEnvironment, importDatabase(local));
  const jar = path.resolve(projectDirectory, jarPath);
  try {
    if (!(await stat(jar)).isFile()) throw new Error();
    await access(jar, constants.R_OK);
  } catch {
    throw new Error("Nie można odczytać backend/target/lmuml-backend.jar. Zbuduj projekt poleceniem Maven verify.");
  }

  const root = path.resolve(projectDirectory, samplesRoot);
  await mkdir(root, { recursive: true });
  const runDirectory = await mkdtemp(path.join(root, "sync-"));
  signal?.throwIfAborted();
  console.log("Pobieranie próbek do " + runDirectory);
  await runJava(probeJavaArguments(parameters, { jarPath: jar, samplesRoot: runDirectory }), probeEnvironment, signal);
  signal?.throwIfAborted();

  const entries = await readdir(runDirectory, { withFileTypes: true });
  const [sample] = entries;
  if (entries.length !== 1 || !sample.isDirectory() || !sample.name.startsWith("sample-")) {
    throw new Error("Nie znaleziono dokładnie jednego katalogu próbek w " + runDirectory);
  }
  const directory = path.join(runDirectory, sample.name);
  const planDetails = autoDetailsAt && !(await quotaExhausted(directory, "fixtures", signal));
  signal?.throwIfAborted();
  console.log("Import próbek z " + directory);
  await runJava(importJavaArguments({
    directory,
    standings: parameters.standings,
    fixtureDetail: parameters.fixtureDetail,
    autoDetailsAt: planDetails ? autoDetailsAt : undefined,
  }, { jarPath: jar }), importEnvironment, signal);
  signal?.throwIfAborted();
  return directory;
}

export async function syncFixtureDetails(fixtureIds, {
  sequential = false,
  signal,
  synchronize = syncApiFootball,
  wait = setTimeout,
} = {}) {
  const batchSize = sequential ? 1 : maxFixturesPerRequest;
  for (let offset = 0; offset < fixtureIds.length; offset += batchSize) {
    signal?.throwIfAborted();
    const batch = fixtureIds.slice(offset, offset + batchSize);
    const scope = batch.length === 1 ? { fixtureId: batch[0] } : { fixtureIds: batch };
    const nextOffset = offset + batch.length;
    console.log(`Pobieranie szczegółów (${nextOffset}/${fixtureIds.length}): ${batch.join(", ")}.`);
    const directory = await synchronize({ ...scope, fixtureDetail: "details" }, { signal });
    signal?.throwIfAborted();
    if (nextOffset === fixtureIds.length) break;

    if (await quotaExhausted(directory, "details", signal)) {
      const remaining = fixtureIds.slice(nextOffset).join(" ");
      throw new Error(`Limit API-Football wyczerpany. Pozostałe mecze do pobrania: ${remaining}.`);
    }
    await wait(fixtureRequestIntervalMs, undefined, { signal });
  }
}

export async function recordMatchdayAttempt(attempt, {
  localEnvironment,
  inheritedEnvironment = process.env,
  runJava = launchJava,
} = {}) {
  const local = localEnvironment ?? await readLocalEnvironment();
  const environment = {
    ...importBackendEnvironment(inheritedEnvironment, importDatabase(local)),
    SPRING_PROFILES_ACTIVE: "api-football-sync-status",
  };
  await runJava([
    "-jar", backendJarPath,
    `--lmuml.api-football.sync-status.season-code=${attempt.seasonCode}`,
    `--lmuml.api-football.sync-status.started-at=${attempt.startedAt}`,
    `--lmuml.api-football.sync-status.finished-at=${attempt.finishedAt}`,
    `--lmuml.api-football.sync-status.outcome=${attempt.outcome}`,
  ], environment, AbortSignal.timeout(15_000));
}

async function loadClaimedFixtureIds(directory, signal) {
  let ids;
  try {
    ids = await readSampleJson(directory, "auto-details.json", signal);
  } catch (error) {
    if (error.code === "ENOENT") return [];
    throw error;
  }
  if (!Array.isArray(ids) || ids.length > maxFixturesPerRequest
      || !ids.every(isProviderId) || new Set(ids).size !== ids.length) {
    throw new Error("Nieprawidłowa lista meczów do automatycznego pobrania szczegółów.");
  }
  return ids;
}

export async function syncMatchdayCatalog(scope, {
  signal,
  samplesRoot,
  withDetails = false,
  synchronize = syncApiFootball,
  recordAttempt = recordMatchdayAttempt,
  now = Date.now,
  log = console,
} = {}) {
  const startedAt = now();
  let outcome = "FAILED";
  let directory;
  try {
    directory = await synchronize(scope, {
      signal,
      samplesRoot,
      autoDetailsAt: withDetails ? new Date(startedAt).toISOString() : undefined,
    });
    outcome = "SUCCEEDED";
  } finally {
    try {
      await recordAttempt({
        seasonCode: `api-football-${scope.leagueId}-${scope.season}`,
        startedAt: new Date(startedAt).toISOString(),
        finishedAt: new Date(Math.max(startedAt, now())).toISOString(),
        outcome,
      });
    } catch {
      log.error("Nie udało się zapisać wyniku próby synchronizacji w panelu administratora.");
    }
  }

  if (withDetails && !signal?.aborted) {
    try {
      const fixtureIds = await loadClaimedFixtureIds(directory, signal);
      await syncFixtureDetails(fixtureIds, {
        signal,
        synchronize: (details, options) => synchronize(details, { ...options, samplesRoot }),
      });
    } catch {
      log.error("Wyniki zostały zapisane. Nie ukończono automatycznego importu szczegółów meczów.");
    }
  }
}

async function main() {
  const args = process.argv.slice(2);
  const withDetails = args.at(-1) === "--with-details";
  const argumentsList = withDetails ? args.slice(0, -1) : args;
  const mode = argumentsList.at(-1);
  const watch = mode === "--watch";
  const matchday = watch || mode === "--matchday";
  let parameters;
  try {
    if (withDetails && (!matchday || argumentsList.length !== 1)) throw new Error(usage);
    const scope = matchday ? argumentsList.slice(0, -1) : argumentsList;
    parameters = matchday && argumentsList.length === 1
      ? null
      : parseFixtureDetailsList(scope) ?? parseProbeArguments(scope);
    if (matchday && (parameters?.standings || parameters?.fixtureDetail || parameters?.fixtureIds)) {
      throw new Error(usage);
    }
  } catch {
    console.error(usage);
    process.exitCode = 2;
    return;
  }

  const controller = new AbortController();
  for (const [signal, exitCode] of Object.entries({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 })) {
    process.once(signal, () => {
      process.exitCode = exitCode;
      controller.abort();
    });
  }
  try {
    if (matchday) {
      const synchronize = (scope, options) => {
        console.log(`Synchronizacja ligi ${scope.leagueId}, sezon ${scope.season}.`);
        return syncMatchdayCatalog(scope, {
          ...options,
          samplesRoot: watch ? automaticSamplesRoot : undefined,
          withDetails,
        });
      };
      const check = async (signal) => {
        const result = await runMatchdaySync(parameters, synchronize, { signal });
        console.log(matchdayMessages[result]);
      };
      if (watch) {
        console.log(parameters
          ? `Uruchomiono cykliczną synchronizację ligi ${parameters.leagueId}, sezon ${parameters.season}.`
          : "Uruchomiono cykliczną synchronizację aktywnego sezonu.");
        await watchMatchdaySync(check, { signal: controller.signal });
        console.log("Zatrzymano cykliczną synchronizację.");
      } else {
        await check(controller.signal);
      }
    } else if (parameters.fixtureIds) {
      await syncFixtureDetails(parameters.fixtureIds, {
        sequential: parameters.sequential,
        signal: controller.signal,
      });
    } else {
      await syncApiFootball(parameters, { signal: controller.signal });
    }
  } catch (error) {
    if (controller.signal.aborted) {
      console.error("Przerwano synchronizację API-Football.");
      return;
    }
    console.error(error.message);
    process.exitCode = 1;
  }
}

if (import.meta.main) {
  await main();
}
