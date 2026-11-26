import { spawn } from "node:child_process";
import { access, stat } from "node:fs/promises";
import path from "node:path";
import { backendJarPath, importBackendEnvironment, importDatabase, projectDirectory, readLocalEnvironment } from "./local-environment.mjs";
import { parseFixtureDetailFlag } from "./probe-api-football.mjs";

const usage = "Użycie: node scripts/import-api-football.mjs --directory <KATALOG_PRÓBEK> [--standings | --fixture-statistics | --fixture-events | --fixture-lineups | --fixture-players | --fixture-details]";

export function parseImportArguments(argumentsList) {
  const mode = argumentsList.at(-1);
  const standings = mode === "--standings";
  const fixtureDetail = parseFixtureDetailFlag(mode);
  const scope = standings || fixtureDetail ? argumentsList.slice(0, -1) : argumentsList;
  const [flag, directory] = scope;
  if (scope.length !== 2 || flag !== "--directory"
      || typeof directory !== "string" || directory.trim() === ""
      || directory.startsWith("--") || /[\x00-\x1f\x7f]/.test(directory)) {
    throw new Error(usage);
  }
  return {
    directory: path.resolve(projectDirectory, directory),
    ...(standings ? { standings } : {}),
    ...(fixtureDetail ? { fixtureDetail } : {}),
  };
}

export function importJavaArguments(parameters, { jarPath = backendJarPath } = {}) {
  return [
    "-jar", jarPath,
    "--spring.profiles.active=api-football-import",
    "--spring.main.web-application-type=none",
    "--spring.main.keep-alive=false",
    "--spring.flyway.enabled=false",
    "--spring.autoconfigure.exclude=",
    "--lmuml.api-football.enabled=false",
    "--lmuml.api-football.import.directory=" + parameters.directory,
    "--lmuml.api-football.import.standings=" + (parameters.standings === true),
    ...(parameters.fixtureDetail ? [`--lmuml.api-football.import.fixture-${parameters.fixtureDetail}=true`] : []),
    ...(parameters.autoDetailsAt ? ["--lmuml.api-football.import.auto-details-at=" + parameters.autoDetailsAt] : []),
  ];
}

async function main() {
  let parameters;
  try {
    parameters = parseImportArguments(process.argv.slice(2));
  } catch {
    console.error(usage);
    process.exitCode = 2;
    return;
  }

  let database;
  try {
    database = importDatabase(await readLocalEnvironment());
  } catch {
    console.error("Brak poprawnej konfiguracji importera w lokalnym .env. Uruchom init-env.mjs i setup-database.mjs.");
    process.exitCode = 1;
    return;
  }
  try {
    if (!(await stat(parameters.directory)).isDirectory()) throw new Error();
  } catch {
    console.error("Katalog próbek nie istnieje lub nie jest katalogiem.");
    process.exitCode = 1;
    return;
  }
  try {
    await access(backendJarPath);
  } catch {
    console.error("Brak backend/target/lmuml-backend.jar. Najpierw zbuduj projekt poleceniem Maven verify.");
    process.exitCode = 1;
    return;
  }

  const child = spawn("java", importJavaArguments(parameters), {
    cwd: projectDirectory,
    env: importBackendEnvironment(process.env, database),
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });

  let requestedExitCode;
  for (const [signal, exitCode] of Object.entries({ SIGINT: 130, SIGTERM: 143, SIGHUP: 129 })) {
    process.on(signal, () => {
      requestedExitCode = exitCode;
      if (child.exitCode === null) child.kill(signal);
    });
  }
  process.on("exit", () => {
    if (child.exitCode === null && !child.killed) child.kill();
  });
  child.on("error", () => {
    console.error("Nie udało się uruchomić Javy. Uruchom skrypt przez mise exec.");
    process.exitCode = 1;
  });
  child.on("close", (code, signal) => {
    process.exitCode = requestedExitCode ?? code ?? (signal ? 1 : 0);
  });
}

if (import.meta.main) {
  main().catch(() => {
    console.error("Nie udało się uruchomić importera. Sprawdź lokalną konfigurację i zbudowany JAR.");
    process.exitCode = 1;
  });
}
