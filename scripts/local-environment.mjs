import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { parseEnv } from "node:util";

export const projectDirectory = fileURLToPath(new URL("../", import.meta.url));
export const backendJarPath = fileURLToPath(new URL("../backend/target/lmuml-backend.jar", import.meta.url));

export async function readLocalEnvironment() {
  return parseEnv(await readFile(new URL("../.env", import.meta.url), "utf8"));
}

const defaultRoles = {
  LMUML_APP_DB: "lmuml_app",
  LMUML_MIGRATION_DB: "lmuml_migrator",
  LMUML_IMPORT_DB: "lmuml_importer",
};

function validateRole(environment, rolePrefix, username) {
  const roleNames = Object.entries(defaultRoles)
    .map(([prefix, fallback]) => environment[prefix + "_USER"] ?? fallback);
  const allRoles = [environment.LMUML_DB_USER ?? "lmuml_dev_admin", ...roleNames];
  if (!/^lmuml_[a-z][a-z0-9_]{0,56}$/.test(username ?? "")
      || roleNames.some((role) => !/^lmuml_[a-z][a-z0-9_]{0,56}$/.test(role))
      || new Set(allRoles).size !== allRoles.length) {
    throw new Error(rolePrefix + "_USER musi być oddzielną rolą z prefiksem lmuml_.");
  }
  return username;
}

function databaseConfiguration(environment, rolePrefix, socketTimeout = 3) {
  const name = environment.LMUML_DB_NAME;
  const port = environment.LMUML_DB_PORT;
  const username = environment[rolePrefix + "_USER"];
  const password = environment[rolePrefix + "_PASSWORD"];

  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name ?? "")) {
    throw new Error("Nieprawidłowe LMUML_DB_NAME w lokalnym .env.");
  }
  if (!/^\d{1,5}$/.test(port ?? "") || Number(port) < 1 || Number(port) > 65535) {
    throw new Error("Nieprawidłowe LMUML_DB_PORT w lokalnym .env.");
  }
  validateRole(environment, rolePrefix, username);
  if (typeof password !== "string" || password.length < 16 || password.length > 256
      || /[\x00-\x1f\x7f]/.test(password)) {
    throw new Error(rolePrefix + "_PASSWORD wymaga 16–256 znaków bez znaków sterujących.");
  }

  return {
    name,
    username,
    password,
    url: `jdbc:postgresql://127.0.0.1:${port}/${name}?currentSchema=lmuml&connectTimeout=3&socketTimeout=${socketTimeout}`,
  };
}

export function applicationDatabase(environment) {
  return databaseConfiguration(environment, "LMUML_APP_DB");
}

export function migrationDatabase(environment) {
  const application = applicationDatabase(environment);
  return {
    // DDL can legitimately take longer than a runtime health check.
    ...databaseConfiguration(environment, "LMUML_MIGRATION_DB", 0),
    runtimeRole: application.username,
    importRole: validateRole(environment, "LMUML_IMPORT_DB",
      environment.LMUML_IMPORT_DB_USER ?? defaultRoles.LMUML_IMPORT_DB),
  };
}

export function importDatabase(environment) {
  return databaseConfiguration(environment, "LMUML_IMPORT_DB", 30);
}

export function apiFootballEnvironment(localEnvironment, { migrate = false } = {}) {
  const enabled = localEnvironment.LMUML_API_FOOTBALL_ENABLED ?? "";
  if (!["", "false", "true"].includes(enabled)) {
    throw new Error("LMUML_API_FOOTBALL_ENABLED wymaga true albo false.");
  }
  if (migrate || enabled !== "true") {
    return { LMUML_API_FOOTBALL_ENABLED: "false" };
  }

  const apiKey = localEnvironment.LMUML_API_FOOTBALL_API_KEY;
  if (typeof apiKey !== "string" || apiKey.length === 0 || apiKey.length > 512 || /[^\x21-\x7e]/.test(apiKey)) {
    throw new Error("Włączone API-Football wymaga klucza o długości 1–512 znaków ASCII bez spacji.");
  }
  return {
    LMUML_API_FOOTBALL_ENABLED: "true",
    LMUML_API_FOOTBALL_API_KEY: apiKey,
  };
}

function sanitizedEnvironment(inheritedEnvironment) {
  return Object.fromEntries(
    Object.entries(inheritedEnvironment).filter(([key]) =>
      !/^(LMUML_|POSTGRES_|FLYWAY_|SPRING_DATASOURCE_|SPRING_FLYWAY_|SPRING_PROFILES_|SPRING_CONFIG_|SPRING_MAIN_|SPRING_MAIL_|SPRING_DATA_REDIS_|SPRING_APPLICATION_JSON$)/i.test(key)),
  );
}

export function probeBackendEnvironment(inheritedEnvironment, localEnvironment) {
  return {
    ...sanitizedEnvironment(inheritedEnvironment),
    ...apiFootballEnvironment({ ...localEnvironment, LMUML_API_FOOTBALL_ENABLED: "true" }),
    SPRING_FLYWAY_ENABLED: "false",
    SPRING_PROFILES_ACTIVE: "api-football-probe",
    SPRING_MAIN_WEB_APPLICATION_TYPE: "none",
    SPRING_MAIN_KEEP_ALIVE: "false",
    SPRING_AUTOCONFIGURE_EXCLUDE: "org.springframework.boot.jdbc.autoconfigure.DataSourceAutoConfiguration",
  };
}

export function importBackendEnvironment(inheritedEnvironment, database) {
  return {
    ...sanitizedEnvironment(inheritedEnvironment),
    SPRING_DATASOURCE_URL: database.url,
    SPRING_DATASOURCE_USERNAME: database.username,
    SPRING_DATASOURCE_PASSWORD: database.password,
    SPRING_PROFILES_ACTIVE: "api-football-import",
    SPRING_MAIN_WEB_APPLICATION_TYPE: "none",
    SPRING_MAIN_KEEP_ALIVE: "false",
    SPRING_FLYWAY_ENABLED: "false",
    SPRING_AUTOCONFIGURE_EXCLUDE: "",
    LMUML_API_FOOTBALL_ENABLED: "false",
  };
}

function localCatalogCache(inheritedEnvironment, localEnvironment) {
  const enabled = inheritedEnvironment.LMUML_CATALOG_CACHE_ENABLED ?? localEnvironment.LMUML_CATALOG_CACHE_ENABLED ?? "false";
  if (enabled === "" || enabled === "false") {
    return {};
  }
  if (enabled !== "true") {
    throw new Error("LMUML_CATALOG_CACHE_ENABLED wymaga true albo false.");
  }
  const port = (inheritedEnvironment.LMUML_REDIS_PORT ?? localEnvironment.LMUML_REDIS_PORT) || "6380";
  if (!/^\d{1,5}$/.test(port) || Number(port) < 1 || Number(port) > 65535) {
    throw new Error("Nieprawidłowe LMUML_REDIS_PORT dla lokalnego Redis.");
  }
  return {
    LMUML_CATALOG_CACHE_ENABLED: "true",
    SPRING_DATA_REDIS_HOST: "127.0.0.1",
    SPRING_DATA_REDIS_PORT: port,
  };
}

export function backendEnvironment(inheritedEnvironment, database, { migrate = false, localMail = false, localEnvironment = {} } = {}) {
  // Each Java process receives only its own role credentials and explicit startup mode.
  return {
    ...sanitizedEnvironment(inheritedEnvironment),
    SPRING_DATASOURCE_URL: database.url,
    SPRING_DATASOURCE_USERNAME: database.username,
    SPRING_DATASOURCE_PASSWORD: database.password,
    SPRING_FLYWAY_ENABLED: migrate ? "true" : "false",
    SPRING_PROFILES_ACTIVE: migrate ? "migration" : "",
    ...(migrate ? {} : localCatalogCache(inheritedEnvironment, localEnvironment)),
    ...(localMail && !migrate ? {
      SPRING_MAIL_HOST: "127.0.0.1",
      SPRING_MAIL_PORT: "1025",
      LMUML_PLAYER_PASSWORD_RESET_ENABLED: "true",
      LMUML_PLAYER_PASSWORD_RESET_PUBLIC_URL: "http://127.0.0.1:4173",
      LMUML_PLAYER_PASSWORD_RESET_FROM: "no-reply@lmuml.test",
    } : {}),
    ...(migrate ? {
      LMUML_RUNTIME_ROLE: database.runtimeRole,
      LMUML_IMPORT_ROLE: database.importRole ?? defaultRoles.LMUML_IMPORT_DB,
      SPRING_MAIN_WEB_APPLICATION_TYPE: "none",
      SPRING_MAIN_KEEP_ALIVE: "false",
    } : {}),
  };
}
