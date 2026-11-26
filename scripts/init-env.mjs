import { randomBytes } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";

const templatePath = new URL("../.env.example", import.meta.url);
const environmentPath = new URL("../.env", import.meta.url);
const randomPassword = () => randomBytes(24).toString("hex");

export function prepareEnvironment(existing, template) {
  let content = existing ?? template;
  const values = parseEnv(content);
  const lineEnding = content.includes("\r\n") ? "\r\n" : "\n";

  function setMissingValue(key, value, fillBlank = false) {
    if (Object.hasOwn(values, key)) {
      if (!fillBlank || values[key] !== "") return;
      const lines = content.split(/\r?\n/);
      const matchingLines = lines.filter((line) => new RegExp(`^\\s*(?:export\\s+)?${key}\\s*=`).test(line));
      if (matchingLines.length !== 1) throw new Error("Niejednoznaczna konfiguracja .env.");
      content = lines.map((line) => line === matchingLines[0] ? `${key}=${value}` : line).join(lineEnding);
    } else {
      content += (content.endsWith("\n") ? "" : lineEnding) + `${key}=${value}` + lineEnding;
    }
  }

  // An initialized database keeps its current administrator password.
  if (existing === undefined) setMissingValue("LMUML_DB_PASSWORD", randomPassword(), true);
  setMissingValue("LMUML_APP_DB_USER", "lmuml_app");
  setMissingValue("LMUML_APP_DB_PASSWORD", randomPassword(), true);
  setMissingValue("LMUML_MIGRATION_DB_USER", "lmuml_migrator");
  setMissingValue("LMUML_MIGRATION_DB_PASSWORD", randomPassword(), true);
  setMissingValue("LMUML_IMPORT_DB_USER", "lmuml_importer");
  setMissingValue("LMUML_IMPORT_DB_PASSWORD", randomPassword(), true);
  return content;
}

async function main() {
  const template = await readFile(templatePath, "utf8");
  let existing;
  try {
    existing = await readFile(environmentPath, "utf8");
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }
  const content = prepareEnvironment(existing, template);
  if (content !== existing) {
    await writeFile(environmentPath, content, {
      encoding: "utf8",
      flag: existing === undefined ? "wx" : "w",
      mode: 0o600,
    });
  }
  console.log(existing === undefined
    ? "Utworzono lokalny .env z oddzielnymi hasłami administratora, aplikacji, migracji i importera."
    : content === existing
      ? "Lokalny .env jest kompletny; zachowano jego zawartość."
      : "Uzupełniono brakujące ustawienia; dotychczasowe dane dostępu zachowano.");
}

if (import.meta.main) {
  main().catch(() => {
    console.error("Nie udało się przygotować lokalnego .env. Sprawdź plik i uprawnienia.");
    process.exitCode = 1;
  });
}
