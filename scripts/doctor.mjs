import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const cliArguments = process.argv.slice(2);
const supportedArguments = new Set(["--json", "--help"]);

if (cliArguments.some((argument) => !supportedArguments.has(argument))) {
  console.error("Użycie: node scripts/doctor.mjs [--json] [--help]");
  process.exit(2);
}

if (cliArguments.includes("--help")) {
  console.log("Użycie: node scripts/doctor.mjs [--json]");
  console.log("Odczytuje wersje narzędzi i dostępność Dockera. Nie zmienia konfiguracji.");
  process.exit(0);
}

const projectDirectory = fileURLToPath(new URL("../", import.meta.url));
const timeoutMs = 5_000;

function probe(name, command, commandArguments, versionPattern) {
  const result = spawnSync(command, commandArguments, {
    cwd: projectDirectory,
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: timeoutMs,
    maxBuffer: 64 * 1024,
  });

  if (result.error) {
    const missing = result.error.code === "ENOENT";
    const detail = missing
      ? "Nie znaleziono polecenia w PATH."
      : result.error.code === "ETIMEDOUT"
        ? "Brak odpowiedzi w ciągu 5 sekund."
        : "Nie udało się uruchomić polecenia.";

    return { name, status: missing ? "missing" : "unavailable", detail };
  }

  if (result.status !== 0) {
    return {
      name,
      status: "unavailable",
      detail: "Polecenie nie powiodło się. Sprawdź dostępność i konfigurację narzędzia.",
    };
  }

  // Launchers may print configuration before the version. Return only the version.
  const output = (result.stdout || "") + "\n" + (result.stderr || "");
  const version = output.match(versionPattern)?.[1];

  return {
    name,
    status: "available",
    detail: version || "Polecenie odpowiedziało; nie rozpoznano formatu wersji.",
  };
}

const bareVersionPattern = /^v?(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?)\s*$/m;
const checks = [
  { name: "Node.js", status: "available", detail: process.version },
  probe("Git", "git", ["--version"], /^git version ([0-9][0-9A-Za-z.+_-]*)/m),
  probe(
    "Java runtime",
    "java",
    ["-version"],
    /^(?:openjdk|java) (?:version )?"?([0-9][0-9A-Za-z.+_-]*)/m,
  ),
  probe("Java compiler", "javac", ["-version"], /^javac ([0-9][0-9A-Za-z.+_-]*)/m),
  probe("Docker CLI", "docker", ["--version"], /^Docker version ([0-9][0-9A-Za-z.+_-]*)/m),
  probe("Docker Compose", "docker", ["compose", "version", "--short"], bareVersionPattern),
  probe("Docker Engine", "docker", ["info", "--format", "{{.ServerVersion}}"], bareVersionPattern),
];

const complete = checks.every((check) => check.status === "available");

if (cliArguments.includes("--json")) {
  console.log(JSON.stringify({ complete, checks }, null, 2));
} else {
  const labels = {
    available: "OK",
    missing: "BRAK",
    unavailable: "NIEDOSTĘPNE",
  };

  console.table(
    checks.map(({ name, status, detail }) => ({
      Narzędzie: name,
      Stan: labels[status],
      Wynik: detail,
    })),
  );
  console.log(
    complete
      ? "Wszystkie sprawdzane narzędzia odpowiadają. Zgodność wersji wymaga osobnego sprawdzenia."
      : "Część narzędzi jest niedostępna. Raport nie oznacza gotowości do budowy aplikacji.",
  );
}

process.exitCode = complete ? 0 : 1;
