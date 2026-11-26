import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { parseEnv } from "node:util";
import { prepareEnvironment } from "./init-env.mjs";
import { apiFootballEnvironment, applicationDatabase, backendEnvironment, importBackendEnvironment, importDatabase, migrationDatabase, probeBackendEnvironment, projectDirectory } from "./local-environment.mjs";
import { parseImportArguments } from "./import-api-football.mjs";
import { parseFixtureDetailsList, parseProbeArguments } from "./probe-api-football.mjs";
import { provisioningSql } from "./setup-database.mjs";

const template = "LMUML_DB_PASSWORD=\nLMUML_APP_DB_USER=lmuml_app\nLMUML_APP_DB_PASSWORD=\nLMUML_MIGRATION_DB_USER=lmuml_migrator\nLMUML_MIGRATION_DB_PASSWORD=\n";
const settings = {
  LMUML_DB_NAME: "lmuml_dev",
  LMUML_DB_PORT: "5433",
  LMUML_DB_USER: "lmuml_dev_admin",
  LMUML_APP_DB_USER: "lmuml_app",
  LMUML_APP_DB_PASSWORD: "a".repeat(48),
  LMUML_MIGRATION_DB_USER: "lmuml_migrator",
  LMUML_MIGRATION_DB_PASSWORD: "b".repeat(48),
  LMUML_IMPORT_DB_USER: "lmuml_importer",
  LMUML_IMPORT_DB_PASSWORD: "c".repeat(48),
};

test("existing administrator and application credentials survive an idempotent update", () => {
  const existing = '# Keep this comment\r\nLMUML_DB_PASSWORD="existing-secret"\r\nLMUML_APP_DB_USER=lmuml_custom_app\r\nLMUML_APP_DB_PASSWORD="existing-app-secret"\r\nEXTRA=value\r\n';
  const updated = prepareEnvironment(existing, template);
  assert.ok(updated.startsWith(existing));
  assert.equal(parseEnv(updated).LMUML_DB_PASSWORD, "existing-secret");
  assert.equal(parseEnv(updated).LMUML_APP_DB_USER, "lmuml_custom_app");
  assert.equal(parseEnv(updated).LMUML_APP_DB_PASSWORD, "existing-app-secret");
  assert.match(parseEnv(updated).LMUML_MIGRATION_DB_PASSWORD, /^[a-f0-9]{48}$/);
  assert.equal(prepareEnvironment(updated, template), updated);
});

test("new files have four independent passwords and missing role passwords are filled", () => {
  const created = parseEnv(prepareEnvironment(undefined, template));
  assert.match(created.LMUML_DB_PASSWORD, /^[a-f0-9]{48}$/);
  assert.notEqual(created.LMUML_DB_PASSWORD, created.LMUML_APP_DB_PASSWORD);
  assert.equal(new Set([created.LMUML_DB_PASSWORD, created.LMUML_APP_DB_PASSWORD,
    created.LMUML_MIGRATION_DB_PASSWORD, created.LMUML_IMPORT_DB_PASSWORD]).size, 4);
  const updated = parseEnv(prepareEnvironment('LMUML_DB_PASSWORD=keep\nLMUML_APP_DB_PASSWORD=""\nLMUML_MIGRATION_DB_PASSWORD=\nLMUML_IMPORT_DB_PASSWORD=\n', template));
  assert.equal(updated.LMUML_DB_PASSWORD, "keep");
  assert.match(updated.LMUML_APP_DB_PASSWORD, /^[a-f0-9]{48}$/);
  assert.match(updated.LMUML_MIGRATION_DB_PASSWORD, /^[a-f0-9]{48}$/);
  assert.match(updated.LMUML_IMPORT_DB_PASSWORD, /^[a-f0-9]{48}$/);
});

test("existing migration and import credentials are never rotated by environment setup", () => {
  const existing = "LMUML_DB_PASSWORD=admin-keep\nLMUML_APP_DB_USER=lmuml_app\nLMUML_APP_DB_PASSWORD=app-keep\nLMUML_MIGRATION_DB_USER=lmuml_custom_migrator\nLMUML_MIGRATION_DB_PASSWORD=migration-keep\nLMUML_IMPORT_DB_USER=lmuml_custom_importer\nLMUML_IMPORT_DB_PASSWORD=import-keep\nLMUML_API_FOOTBALL_API_KEY=provider-keep\n";
  assert.equal(prepareEnvironment(existing, template), existing);
});

test("invalid role, database and port cannot enter local SQL or a JDBC URL", () => {
  for (const changes of [
    { LMUML_APP_DB_USER: "postgres" },
    { LMUML_APP_DB_USER: "lmuml_dev_admin" },
    { LMUML_APP_DB_USER: "lmuml_migrator" },
    { LMUML_DB_USER: undefined, LMUML_APP_DB_USER: "lmuml_dev_admin" },
    { LMUML_DB_NAME: "db?user=admin" },
    { LMUML_DB_PORT: "65536" },
    { LMUML_APP_DB_PASSWORD: "bad\npassword" },
  ]) {
    assert.throws(() => applicationDatabase({ ...settings, ...changes }));
  }
});

test("migration role must differ from administrator and runtime role", () => {
  for (const username of ["postgres", "lmuml_app", "lmuml_dev_admin", "bad;role"]) {
    assert.throws(() => migrationDatabase({ ...settings, LMUML_MIGRATION_DB_USER: username }));
  }
  assert.throws(() => migrationDatabase({ ...settings, LMUML_MIGRATION_DB_PASSWORD: "" }));
});

test("normal Java runtime cannot inherit migration credentials or activate the migration profile", () => {
  const database = applicationDatabase(settings);
  const environment = backendEnvironment({
    PATH: "tools", LMUML_DB_PASSWORD: "admin", POSTGRES_PASSWORD: "admin",
    lmuml_db_user: "admin", spring_datasource_password: "admin",
    LMUML_MIGRATION_DB_PASSWORD: "migration-secret", FLYWAY_PASSWORD: "migration-secret",
    spring_flyway_password: "migration-secret", SPRING_FLYWAY_ENABLED: "true",
    SPRING_PROFILES_ACTIVE: "migration", SPRING_MAIN_WEB_APPLICATION_TYPE: "none",
    SPRING_APPLICATION_JSON: '{"spring":{"flyway":{"enabled":true}}}',
  }, database);
  assert.equal(environment.PATH, "tools");
  assert.equal(environment.SPRING_DATASOURCE_USERNAME, "lmuml_app");
  assert.equal(environment.SPRING_DATASOURCE_PASSWORD, settings.LMUML_APP_DB_PASSWORD);
  assert.ok(Object.keys(environment).every((key) => !/^(LMUML_|POSTGRES_)/i.test(key)));
  assert.equal(environment.spring_datasource_password, undefined);
  assert.equal(environment.spring_flyway_password, undefined);
  assert.equal(environment.SPRING_APPLICATION_JSON, undefined);
  assert.equal(environment.SPRING_MAIN_WEB_APPLICATION_TYPE, undefined);
  assert.equal(environment.SPRING_FLYWAY_ENABLED, "false");
  assert.equal(environment.SPRING_PROFILES_ACTIVE, "");
  assert.ok(!Object.values(environment).includes("migration-secret"));
  assert.ok(database.url.includes("currentSchema=lmuml"));
  assert.ok(database.url.includes("socketTimeout=3"));
});

test("migration process gets only its own credentials and explicit non-web mode", () => {
  const database = migrationDatabase(settings);
  assert.ok(database.url.includes("socketTimeout=0"));
  const environment = backendEnvironment({
    LMUML_DB_PASSWORD: "admin", LMUML_APP_DB_PASSWORD: "runtime-secret",
    SPRING_FLYWAY_PASSWORD: "ambient-secret", SPRING_PROFILES_ACTIVE: "wrong",
  }, database, { migrate: true });
  assert.equal(environment.SPRING_DATASOURCE_USERNAME, "lmuml_migrator");
  assert.equal(environment.SPRING_DATASOURCE_PASSWORD, settings.LMUML_MIGRATION_DB_PASSWORD);
  assert.equal(environment.LMUML_RUNTIME_ROLE, "lmuml_app");
  assert.equal(environment.LMUML_IMPORT_ROLE, "lmuml_importer");
  assert.equal(environment.SPRING_FLYWAY_PASSWORD, undefined);
  assert.equal(environment.SPRING_PROFILES_ACTIVE, "migration");
  assert.equal(environment.SPRING_MAIN_WEB_APPLICATION_TYPE, "none");
  assert.equal(environment.SPRING_MAIN_KEEP_ALIVE, "false");
  assert.ok(!Object.values(environment).includes("runtime-secret"));
  assert.ok(!Object.values(environment).includes(settings.LMUML_IMPORT_DB_PASSWORD));
});

test("provider integration is disabled by default and disabled credentials are not forwarded", () => {
  for (const flag of [undefined, "", "false"]) {
    assert.deepEqual(apiFootballEnvironment({
      LMUML_API_FOOTBALL_ENABLED: flag,
      LMUML_API_FOOTBALL_API_KEY: "unused-secret",
    }), { LMUML_API_FOOTBALL_ENABLED: "false" });
  }
});

test("enabled provider uses only explicitly selected local credentials", () => {
  const local = {
    LMUML_API_FOOTBALL_ENABLED: "true",
    LMUML_API_FOOTBALL_API_KEY: "local-provider-token",
  };
  const environment = {
    ...backendEnvironment({
      LMUML_API_FOOTBALL_ENABLED: "true",
      LMUML_API_FOOTBALL_API_KEY: "ambient-provider-token",
      lmuml_api_football_api_key: "lowercase-ambient-token",
    }, applicationDatabase(settings)),
    ...apiFootballEnvironment(local),
  };
  assert.equal(environment.LMUML_API_FOOTBALL_ENABLED, "true");
  assert.equal(environment.LMUML_API_FOOTBALL_API_KEY, "local-provider-token");
  assert.equal(environment.lmuml_api_football_api_key, undefined);
  assert.ok(!Object.values(environment).includes("ambient-provider-token"));
  assert.ok(!Object.values(environment).includes("lowercase-ambient-token"));
});

test("inherited provider settings cannot enable integration absent from local configuration", () => {
  const environment = {
    ...backendEnvironment({
      LMUML_API_FOOTBALL_ENABLED: "true",
      LMUML_API_FOOTBALL_API_KEY: "ambient-provider-token",
    }, applicationDatabase(settings)),
    ...apiFootballEnvironment({}),
  };
  assert.equal(environment.LMUML_API_FOOTBALL_ENABLED, "false");
  assert.equal(environment.LMUML_API_FOOTBALL_API_KEY, undefined);
});

test("migration never receives provider credentials even when integration is enabled", () => {
  const environment = {
    ...backendEnvironment({ LMUML_API_FOOTBALL_API_KEY: "ambient-provider-token" },
      migrationDatabase(settings), { migrate: true }),
    ...apiFootballEnvironment({
      LMUML_API_FOOTBALL_ENABLED: "true",
      LMUML_API_FOOTBALL_API_KEY: "local-provider-token",
    }, { migrate: true }),
  };
  assert.equal(environment.LMUML_API_FOOTBALL_ENABLED, "false");
  assert.equal(environment.LMUML_API_FOOTBALL_API_KEY, undefined);
  assert.equal(environment.LMUML_RUNTIME_ROLE, "lmuml_app");
});

test("provider validation rejects malformed settings without exposing their values", () => {
  for (const invalidFlag of ["TRUE", "yes", " true", "false "]) {
    assert.throws(() => apiFootballEnvironment({ LMUML_API_FOOTBALL_ENABLED: invalidFlag }),
      (error) => error.message === "LMUML_API_FOOTBALL_ENABLED wymaga true albo false.");
  }
  for (const invalidKey of [undefined, "", "secret with-space", "secret\nwith-newline", "secret\u0000with-control",
    "secret\u0085with-control", "secret\u200bwith-format", "secret\ud83d\ude00with-emoji", "x".repeat(513)]) {
    assert.throws(() => apiFootballEnvironment({
      LMUML_API_FOOTBALL_ENABLED: "true",
      LMUML_API_FOOTBALL_API_KEY: invalidKey,
    }), (error) => error.message === "Włączone API-Football wymaga klucza o długości 1–512 znaków ASCII bez spacji.");
  }
  for (const validKey of ["x", "x".repeat(512)]) {
    assert.equal(apiFootballEnvironment({
      LMUML_API_FOOTBALL_ENABLED: "true", LMUML_API_FOOTBALL_API_KEY: validKey,
    }).LMUML_API_FOOTBALL_API_KEY, validKey);
  }
});

test("explicit provider probe receives only local provider credentials without database roles", () => {
  const local = { ...settings, LMUML_API_FOOTBALL_ENABLED: "false", LMUML_API_FOOTBALL_API_KEY: "local-provider-key" };
  const environment = probeBackendEnvironment({
    PATH: "tools", LMUML_DB_PASSWORD: "admin", POSTGRES_PASSWORD: "admin",
    LMUML_APP_DB_PASSWORD: "runtime", LMUML_MIGRATION_DB_PASSWORD: "migrator",
    SPRING_DATASOURCE_URL: "jdbc:unwanted", spring_datasource_password: "ambient-db",
    FLYWAY_PASSWORD: "migration-secret", SPRING_FLYWAY_ENABLED: "true",
    LMUML_API_FOOTBALL_API_KEY: "ambient-provider-key", LMUML_RUNTIME_ROLE: "lmuml_app",
    SPRING_PROFILES_ACTIVE: "migration", SPRING_CONFIG_LOCATION: "unwanted-config",
    SPRING_AUTOCONFIGURE_EXCLUDE: "unwanted-exclusion",
    SPRING_MAIN_WEB_APPLICATION_TYPE: "servlet", SPRING_MAIN_KEEP_ALIVE: "true",
    SPRING_APPLICATION_JSON: '{"spring":{"datasource":{"password":"hidden"}}}',
  }, local);
  assert.deepEqual(environment, {
    PATH: "tools",
    LMUML_API_FOOTBALL_ENABLED: "true",
    LMUML_API_FOOTBALL_API_KEY: "local-provider-key",
    SPRING_FLYWAY_ENABLED: "false",
    SPRING_PROFILES_ACTIVE: "api-football-probe",
    SPRING_MAIN_WEB_APPLICATION_TYPE: "none",
    SPRING_MAIN_KEEP_ALIVE: "false",
    SPRING_AUTOCONFIGURE_EXCLUDE: "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration",
  });
  assert.equal(local.LMUML_API_FOOTBALL_ENABLED, "false");
});

test("provider probe requires a local key even when an inherited key exists", () => {
  assert.throws(() => probeBackendEnvironment({ LMUML_API_FOOTBALL_API_KEY: "ambient-key" }, {}),
    /Włączone API-Football wymaga klucza/);
});

test("probe arguments require a positive Long league and four-digit season in either order", () => {
  assert.deepEqual(parseProbeArguments(["--league", "2", "--season", "2024"]), { leagueId: "2", season: "2024" });
  assert.deepEqual(parseProbeArguments(["--season", "2024", "--league", "9223372036854775807"]),
    { leagueId: "9223372036854775807", season: "2024" });
  assert.deepEqual(parseProbeArguments(["--league", "2", "--season", "2024", "--standings"]),
    { leagueId: "2", season: "2024", standings: true });
});

test("probe arguments reject missing duplicate unknown and malformed values without echoing input", () => {
  for (const argumentsList of [
    [], ["--league", "2"], ["--league", "2", "--league", "3"],
    ["--league", "2", "--season", "2024", "--api-key", "secret"],
    ["--api-key", "secret", "--season", "2024"],
    ["--league", "0", "--season", "2024"], ["--league", "-1", "--season", "2024"],
    ["--league", "2.5", "--season", "2024"], ["--league", "2x", "--season", "2024"],
    ["--league", "9223372036854775808", "--season", "2024"],
    ["--league", "99999999999999999999999999", "--season", "2024"],
    ["--league", "2", "--season", "024"], ["--league", "2", "--season", "20240"],
    ["--league", "2", "--season", "2024.0"], ["--league", "2", "--season", "0000"],
  ]) {
    assert.throws(() => parseProbeArguments(argumentsList),
      (error) => error.message === "Użycie: node scripts/probe-api-football.mjs --league <ID> --season <RRRR> [--standings] lub (--fixture-statistics | --fixture-events | --fixture-lineups | --fixture-players | --fixture-details) <ID_MECZU>");
  }
});

test("a manual details list accepts distinct positive Long IDs in the requested order", () => {
  const fixtureIds = ["1374812", "9223372036854775807", "1299032"];
  assert.deepEqual(parseFixtureDetailsList(["--fixture-details", ...fixtureIds]), { fixtureIds });
  assert.deepEqual(parseFixtureDetailsList(["--fixture-details", ...fixtureIds, "--sequential"]),
    { fixtureIds, sequential: true });
  assert.deepEqual(parseFixtureDetailsList(["--fixture-details", "1374812", "--sequential"]),
    { fixtureIds: ["1374812"], sequential: true });
  assert.equal(parseFixtureDetailsList(["--fixture-details", "1374812"]), undefined);
  assert.equal(parseFixtureDetailsList(["--fixture-events", ...fixtureIds]), undefined);
  assert.throws(() => parseProbeArguments(["--fixture-details", ...fixtureIds]));
});

test("a manual details list rejects duplicate or invalid IDs without echoing them", () => {
  for (const invalid of ["1374812", "0", "-1", "0123", "123.5", "9223372036854775808", "--watch", "secret", " 123"]) {
    assert.throws(() => parseFixtureDetailsList(["--fixture-details", "1374812", invalid]),
      { message: "Podaj różne, dodatnie identyfikatory meczów." });
  }
  assert.throws(() => parseFixtureDetailsList(["--fixture-details", "--sequential", "1374812"]));
  assert.throws(() => parseFixtureDetailsList(["--fixture-details", "1374812", "--sequential", "--sequential"]));
});

test("probe launcher rejects unknown arguments before configuration or Java startup", () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("./probe-api-football.mjs", import.meta.url)), "--api-key", "secret",
  ], { encoding: "utf8", shell: false, windowsHide: true });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Użycie:/);
  assert.ok(!result.stderr.includes("secret"));
});

test("provisioning quotes password literals and guards existing privileged roles", () => {
  const sql = provisioningSql(
    applicationDatabase({ ...settings, LMUML_APP_DB_PASSWORD: "long'password\\literal;--" }),
    migrationDatabase(settings),
    importDatabase(settings),
  );
  assert.ok(sql.includes("PASSWORD 'long''password\\literal;--'"));
  assert.ok(sql.includes("existing_role.rolsuper"));
  assert.ok(sql.includes("pg_auth_members"));
  assert.ok(sql.includes('TO "lmuml_app", "lmuml_migrator", "lmuml_importer"'));
  assert.ok(sql.includes('GRANT USAGE ON SCHEMA lmuml TO "lmuml_app", "lmuml_importer"'));
  assert.ok(sql.includes('CREATE SCHEMA lmuml AUTHORIZATION "lmuml_migrator"'));
  assert.ok(sql.includes("schema_owner <>"));
  assert.ok(!sql.includes("GRANT SELECT"));
  assert.ok(!sql.includes("CREATE TABLE"));
});

test("import database rejects role collisions and uses a bounded import timeout", () => {
  for (const username of ["postgres", "lmuml_app", "lmuml_migrator", "lmuml_dev_admin", "bad;role"]) {
    assert.throws(() => importDatabase({ ...settings, LMUML_IMPORT_DB_USER: username }));
  }
  assert.throws(() => applicationDatabase({ ...settings, LMUML_IMPORT_DB_USER: "lmuml_migrator" }));
  assert.throws(() => migrationDatabase({ ...settings, LMUML_IMPORT_DB_USER: "lmuml_app" }));
  assert.throws(() => importDatabase({ ...settings, LMUML_IMPORT_DB_PASSWORD: "" }));
  assert.ok(importDatabase(settings).url.includes("connectTimeout=3&socketTimeout=30"));
});

test("offline importer receives only its writer credentials and cannot enable HTTP API calls or migrations", () => {
  const database = importDatabase(settings);
  const environment = importBackendEnvironment({
    PATH: "tools",
    LMUML_DB_PASSWORD: "admin-secret", POSTGRES_PASSWORD: "admin-secret",
    LMUML_APP_DB_PASSWORD: "app-secret", LMUML_MIGRATION_DB_PASSWORD: "migration-secret",
    LMUML_IMPORT_DB_PASSWORD: "ambient-import-secret", LMUML_RUNTIME_ROLE: "lmuml_app",
    LMUML_IMPORT_ROLE: "ambient-role", LMUML_API_FOOTBALL_ENABLED: "true",
    LMUML_API_FOOTBALL_API_KEY: "provider-secret", lmuml_api_football_api_key: "lowercase-provider-secret",
    SPRING_DATASOURCE_PASSWORD: "ambient-db-secret", FLYWAY_PASSWORD: "flyway-secret",
    SPRING_PROFILES_ACTIVE: "migration", SPRING_CONFIG_LOCATION: "ambient-config",
    SPRING_MAIN_WEB_APPLICATION_TYPE: "servlet", SPRING_MAIN_KEEP_ALIVE: "true",
    SPRING_FLYWAY_ENABLED: "true", SPRING_AUTOCONFIGURE_EXCLUDE: "ambient-exclusion",
    SPRING_APPLICATION_JSON: '{"spring":{"flyway":{"enabled":true}}}',
  }, database);
  assert.deepEqual(environment, {
    PATH: "tools",
    SPRING_DATASOURCE_URL: database.url,
    SPRING_DATASOURCE_USERNAME: "lmuml_importer",
    SPRING_DATASOURCE_PASSWORD: settings.LMUML_IMPORT_DB_PASSWORD,
    SPRING_PROFILES_ACTIVE: "api-football-import",
    SPRING_MAIN_WEB_APPLICATION_TYPE: "none",
    SPRING_MAIN_KEEP_ALIVE: "false",
    SPRING_FLYWAY_ENABLED: "false",
    SPRING_AUTOCONFIGURE_EXCLUDE: "",
    LMUML_API_FOOTBALL_ENABLED: "false",
  });
});

test("import credentials cannot enter runtime migration or probe processes", () => {
  const inherited = { LMUML_IMPORT_DB_PASSWORD: "ambient-import-secret", LMUML_IMPORT_ROLE: "ambient-role" };
  for (const environment of [
    backendEnvironment(inherited, applicationDatabase(settings)),
    backendEnvironment(inherited, migrationDatabase(settings), { migrate: true }),
    probeBackendEnvironment(inherited, { LMUML_API_FOOTBALL_API_KEY: "synthetic-provider-key" }),
  ]) {
    assert.equal(environment.LMUML_IMPORT_DB_PASSWORD, undefined);
    assert.ok(!Object.values(environment).includes("ambient-import-secret"));
    assert.ok(!Object.values(environment).includes(settings.LMUML_IMPORT_DB_PASSWORD));
  }
});

test("local password-reset email can only use the explicit loopback inbox", () => {
  const inherited = {
    SPRING_MAIL_HOST: "ambient-mail.example.test",
    SPRING_MAIL_PASSWORD: "ambient-mail-secret",
    LMUML_PLAYER_PASSWORD_RESET_ENABLED: "true",
    LMUML_PLAYER_PASSWORD_RESET_PUBLIC_URL: "https://ambient.example.test",
  };
  const database = applicationDatabase(settings);
  const regular = backendEnvironment(inherited, database);
  const migration = backendEnvironment(inherited, migrationDatabase(settings), { migrate: true, localMail: true });
  for (const environment of [regular, migration]) {
    assert.equal(environment.SPRING_MAIL_HOST, undefined);
    assert.equal(environment.LMUML_PLAYER_PASSWORD_RESET_ENABLED, undefined);
  }

  const localMail = backendEnvironment(inherited, database, { localMail: true });
  assert.equal(localMail.SPRING_MAIL_HOST, "127.0.0.1");
  assert.equal(localMail.SPRING_MAIL_PORT, "1025");
  assert.equal(localMail.SPRING_MAIL_PASSWORD, undefined);
  assert.equal(localMail.LMUML_PLAYER_PASSWORD_RESET_ENABLED, "true");
  assert.equal(localMail.LMUML_PLAYER_PASSWORD_RESET_PUBLIC_URL, "http://127.0.0.1:4173");
});

test("local catalogue cache can use the Compose port from .env or a shell override", () => {
  const database = applicationDatabase(settings);
  const localEnvironment = { LMUML_CATALOG_CACHE_ENABLED: "true", LMUML_REDIS_PORT: "6381" };
  const ambient = { SPRING_DATA_REDIS_HOST: "unrelated.example.test", SPRING_DATA_REDIS_PASSWORD: "ambient-secret" };
  const local = backendEnvironment(ambient, database, { localEnvironment });
  assert.equal(local.LMUML_CATALOG_CACHE_ENABLED, "true");
  assert.equal(local.SPRING_DATA_REDIS_HOST, "127.0.0.1");
  assert.equal(local.SPRING_DATA_REDIS_PORT, "6381");
  assert.equal(local.SPRING_DATA_REDIS_PASSWORD, undefined);

  const shell = backendEnvironment({ LMUML_CATALOG_CACHE_ENABLED: "true", LMUML_REDIS_PORT: "6382" },
    database, { localEnvironment: { LMUML_CATALOG_CACHE_ENABLED: "false" } });
  assert.equal(shell.LMUML_CATALOG_CACHE_ENABLED, "true");
  assert.equal(shell.SPRING_DATA_REDIS_PORT, "6382");
  assert.equal(backendEnvironment({ LMUML_CATALOG_CACHE_ENABLED: "true" }, database).SPRING_DATA_REDIS_PORT, "6380");
  assert.equal(backendEnvironment({ LMUML_CATALOG_CACHE_ENABLED: "false" }, database, { localEnvironment })
    .LMUML_CATALOG_CACHE_ENABLED, undefined);
});

test("disabled cache, migration, importer and probe receive no Redis settings", () => {
  const inherited = {
    LMUML_CATALOG_CACHE_ENABLED: "true",
    LMUML_REDIS_PORT: "6381",
    SPRING_DATA_REDIS_URL: "redis://ambient.example.test:6379",
    spring_data_redis_password: "ambient-secret",
  };
  const database = applicationDatabase(settings);
  for (const environment of [
    backendEnvironment({ ...inherited, LMUML_CATALOG_CACHE_ENABLED: "false" }, database),
    backendEnvironment(inherited, migrationDatabase(settings), { migrate: true, localEnvironment: inherited }),
    importBackendEnvironment(inherited, importDatabase(settings)),
    probeBackendEnvironment(inherited, { LMUML_API_FOOTBALL_API_KEY: "synthetic-provider-key" }),
  ]) {
    assert.ok(Object.keys(environment).every((key) => !/^(LMUML_(CATALOG_CACHE_|REDIS_)|SPRING_DATA_REDIS_)/i.test(key)));
  }

  assert.throws(() => backendEnvironment({ LMUML_CATALOG_CACHE_ENABLED: "yes" }, database),
    /LMUML_CATALOG_CACHE_ENABLED wymaga true albo false/);
  assert.throws(() => backendEnvironment({ LMUML_CATALOG_CACHE_ENABLED: "true", LMUML_REDIS_PORT: "65536" }, database),
    /Nieprawidłowe LMUML_REDIS_PORT/);
});

test("import arguments resolve one explicit directory and reject extra flags without echoing input", () => {
  assert.deepEqual(parseImportArguments(["--directory", ".local/api-football/sample-test"]),
    { directory: path.resolve(projectDirectory, ".local/api-football/sample-test") });
  assert.deepEqual(parseImportArguments(["--directory", ".local/api-football/sample-test", "--standings"]),
    { directory: path.resolve(projectDirectory, ".local/api-football/sample-test"), standings: true });
  for (const argumentsList of [[], ["--directory"], ["--directory", ""], ["--directory", "   "],
    ["--directory", "--api-key"], ["--api-key", "secret"], ["--directory", "dir", "--other", "secret"],
    ["--directory", "bad\npath"]]) {
    assert.throws(() => parseImportArguments(argumentsList), (error) =>
      error.message === "Użycie: node scripts/import-api-football.mjs --directory <KATALOG_PRÓBEK> [--standings | --fixture-statistics | --fixture-events | --fixture-lineups | --fixture-players | --fixture-details]");
  }
});

test("import launcher rejects unknown arguments before reading credentials or starting Java", () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("./import-api-football.mjs", import.meta.url)), "--api-key", "secret",
  ], { encoding: "utf8", shell: false, windowsHide: true });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Użycie:/);
  assert.ok(!result.stderr.includes("secret"));
});

test("launcher rejects unknown arguments before reading configuration or starting Java", () => {
  const result = spawnSync(process.execPath, [
    fileURLToPath(new URL("./run-backend.mjs", import.meta.url)), "--unknown",
  ], { encoding: "utf8", shell: false, windowsHide: true });
  assert.equal(result.status, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /Użycie:/);
});
