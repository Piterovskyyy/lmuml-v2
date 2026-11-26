import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { apiFootballEnvironment, applicationDatabase, backendEnvironment, migrationDatabase, projectDirectory, readLocalEnvironment } from "./local-environment.mjs";
import { localAdminEnvironment } from "./local-admin.mjs";

const argumentsList = process.argv.slice(2);
const [mode] = argumentsList;
if (argumentsList.length > 1 || (mode !== undefined && !["--migrate", "--local-mail"].includes(mode))) {
  console.error("Użycie: node scripts/run-backend.mjs [--migrate | --local-mail]");
  process.exit(2);
}
const migrate = mode === "--migrate";
const localMail = mode === "--local-mail";

try {
  const environment = await readLocalEnvironment();
  const database = migrate ? migrationDatabase(environment) : applicationDatabase(environment);
  const providerEnvironment = apiFootballEnvironment(environment, { migrate });
  const adminEnvironment = await localAdminEnvironment(environment, { migrate });
  const jarPath = new URL("../backend/target/lmuml-backend.jar", import.meta.url);
  await access(jarPath);
  const javaArguments = ["-jar", "backend/target/lmuml-backend.jar"];
  if (migrate) javaArguments.push("--spring.profiles.active=migration");
  const child = spawn("java", javaArguments, {
    cwd: projectDirectory,
    env: {
      ...backendEnvironment(process.env, database, { migrate, localMail, localEnvironment: environment }),
      ...providerEnvironment,
      ...adminEnvironment,
      ...(migrate ? {} : { LMUML_PLAYER_AUTH_ENABLED: environment.LMUML_PLAYER_AUTH_ENABLED ?? "true" }),
    },
    stdio: "inherit",
    shell: false,
    windowsHide: true,
  });

  let requestedExitCode;
  const signals = { SIGINT: 130, SIGTERM: 143, SIGHUP: 129 };
  for (const [signal, exitCode] of Object.entries(signals)) {
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
} catch {
  console.error("Brak poprawnej konfiguracji lokalnej lub zbudowanego JAR. Sprawdź .env, opcjonalny plik hasła administratora, role bazy oraz Maven verify.");
  process.exitCode = 1;
}
