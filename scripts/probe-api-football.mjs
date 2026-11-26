import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { backendJarPath, probeBackendEnvironment, projectDirectory, readLocalEnvironment } from "./local-environment.mjs";

const usage = "Użycie: node scripts/probe-api-football.mjs --league <ID> --season <RRRR> [--standings] lub (--fixture-statistics | --fixture-events | --fixture-lineups | --fixture-players | --fixture-details) <ID_MECZU>";

export function parseFixtureDetailFlag(flag) {
  return /^--fixture-(statistics|events|lineups|players|details)$/.exec(flag ?? "")?.[1];
}

export function isProviderId(value) {
  return typeof value === "string" && value.trim() === value
    && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}

export function parseFixtureDetailsList(argumentsList) {
  if (argumentsList[0] !== "--fixture-details" || argumentsList.length < 3) return undefined;

  const sequential = argumentsList.at(-1) === "--sequential";
  const fixtureIds = argumentsList.slice(1, sequential ? -1 : undefined);
  if (!fixtureIds.every(isProviderId) || new Set(fixtureIds).size !== fixtureIds.length) {
    throw new Error("Podaj różne, dodatnie identyfikatory meczów.");
  }
  return { fixtureIds, ...(sequential ? { sequential } : {}) };
}

export function parseProbeArguments(argumentsList) {
  const [flag, fixtureId] = argumentsList;
  const fixtureDetail = parseFixtureDetailFlag(flag);
  if (fixtureDetail) {
    if (argumentsList.length !== 2 || !isProviderId(fixtureId)) throw new Error(usage);
    return { fixtureId, fixtureDetail };
  }
  const standings = argumentsList.at(-1) === "--standings";
  const scope = standings ? argumentsList.slice(0, -1) : argumentsList;
  if (scope.length !== 4) throw new Error(usage);
  const values = new Map();
  for (let index = 0; index < scope.length; index += 2) {
    const flag = scope[index];
    if (!["--league", "--season"].includes(flag) || values.has(flag)) throw new Error(usage);
    values.set(flag, scope[index + 1]);
  }
  const league = values.get("--league");
  const season = values.get("--season");
  if (!isProviderId(league) || !/^[1-9]\d{3}$/.test(season ?? "")) {
    throw new Error(usage);
  }
  return { leagueId: league, season, ...(standings ? { standings } : {}) };
}

export function probeJavaArguments(parameters, { jarPath = backendJarPath, samplesRoot } = {}) {
  let scope;
  if (parameters.fixtureIds !== undefined) {
    scope = [`--lmuml.api-football.probe.fixture-ids=${parameters.fixtureIds.join(",")}`];
  } else if (parameters.fixtureId !== undefined) {
    scope = [`--lmuml.api-football.probe.fixture-id=${parameters.fixtureId}`];
  } else {
    scope = [
      `--lmuml.api-football.probe.league-id=${parameters.leagueId}`,
      `--lmuml.api-football.probe.season=${parameters.season}`,
      `--lmuml.api-football.probe.standings=${parameters.standings === true}`,
    ];
  }

  return [
    "-jar", jarPath,
    "--spring.profiles.active=api-football-probe",
    "--spring.main.web-application-type=none",
    "--spring.main.keep-alive=false",
    "--spring.flyway.enabled=false",
    "--spring.autoconfigure.exclude=org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration",
    "--lmuml.api-football.enabled=true",
    ...scope,
    ...(parameters.fixtureDetail && parameters.fixtureDetail !== "statistics"
      ? [`--lmuml.api-football.probe.fixture-${parameters.fixtureDetail}=true`] : []),
    ...(samplesRoot === undefined ? [] : ["--lmuml.api-football.probe.samples-root=" + samplesRoot]),
  ];
}

async function main() {
  let parameters;
  try {
    parameters = parseProbeArguments(process.argv.slice(2));
  } catch {
    console.error(usage);
    process.exitCode = 2;
    return;
  }

  let localEnvironment;
  try {
    localEnvironment = await readLocalEnvironment();
  } catch {
    console.error("Nie udało się odczytać lokalnego .env. Uruchom najpierw init-env.mjs.");
    process.exitCode = 1;
    return;
  }
  let environment;
  try {
    environment = probeBackendEnvironment(process.env, localEnvironment);
  } catch {
    console.error("Ustaw poprawny LMUML_API_FOOTBALL_API_KEY w lokalnym .env. Nie podawaj klucza w argumentach komendy.");
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

  const child = spawn("java", probeJavaArguments(parameters),
    { cwd: projectDirectory, env: environment, stdio: "inherit", shell: false, windowsHide: true });

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
    console.error("Nie udało się uruchomić sprawdzenia API-Football. Sprawdź lokalną konfigurację i zbudowany JAR.");
    process.exitCode = 1;
  });
}
