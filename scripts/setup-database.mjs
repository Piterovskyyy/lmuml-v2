import { spawnSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import { applicationDatabase, importDatabase, migrationDatabase, projectDirectory, readLocalEnvironment } from "./local-environment.mjs";

const sqlLiteral = (value) => "'" + value.replaceAll("'", "''") + "'";
const sqlIdentifier = (value) => '"' + value.replaceAll('"', '""') + '"';

function sqlBlock(body) {
  let delimiter;
  do {
    delimiter = "$lmuml_" + randomBytes(12).toString("hex") + "$";
  } while (body.includes(delimiter));
  return `DO ${delimiter}\n${body}\n${delimiter};\n`;
}

function provisionRole(database) {
  const roleName = sqlLiteral(database.username);
  const roleIdentifier = sqlIdentifier(database.username);
  const password = sqlLiteral(database.password);

  return sqlBlock(`
DECLARE existing_role record;
BEGIN
  SELECT oid, rolsuper, rolcreatedb, rolcreaterole, rolreplication, rolbypassrls
    INTO existing_role FROM pg_roles WHERE rolname = ${roleName};
  IF FOUND THEN
    IF existing_role.rolsuper OR existing_role.rolcreatedb OR existing_role.rolcreaterole
       OR existing_role.rolreplication OR existing_role.rolbypassrls
       OR EXISTS (SELECT 1 FROM pg_auth_members WHERE member = existing_role.oid) THEN
      RAISE EXCEPTION 'Existing application role has elevated privileges; refusing to change it';
    END IF;
    ALTER ROLE ${roleIdentifier} WITH LOGIN NOINHERIT PASSWORD ${password};
  ELSE
    CREATE ROLE ${roleIdentifier} WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE
      NOINHERIT NOREPLICATION NOBYPASSRLS PASSWORD ${password};
  END IF;
END;
`);
}

export function provisioningSql(application, migration, importer) {
  const databases = [application, migration, ...(importer ? [importer] : [])];
  if (new Set(databases.map((database) => database.username)).size !== databases.length
      || databases.some((database) => database.name !== application.name)) {
    throw new Error("Aplikacja, migracje i importer wymagają oddzielnych ról w tej samej bazie.");
  }
  const schema = sqlBlock(`
DECLARE schema_owner oid;
BEGIN
  SELECT nspowner INTO schema_owner FROM pg_namespace WHERE nspname = 'lmuml';
  IF FOUND THEN
    IF schema_owner <> (SELECT oid FROM pg_roles WHERE rolname = ${sqlLiteral(migration.username)}) THEN
      RAISE EXCEPTION 'Existing lmuml schema belongs to another role; refusing to change it';
    END IF;
  ELSE
    CREATE SCHEMA lmuml AUTHORIZATION ${sqlIdentifier(migration.username)};
  END IF;
END;
`);

  return `SET standard_conforming_strings = on;
BEGIN;
${provisionRole(application)}
${provisionRole(migration)}
${importer ? provisionRole(importer) : ""}
${schema}
GRANT CONNECT ON DATABASE ${sqlIdentifier(application.name)}
  TO ${databases.map((database) => sqlIdentifier(database.username)).join(", ")};
GRANT USAGE ON SCHEMA lmuml TO ${sqlIdentifier(application.username)}${importer ? ", " + sqlIdentifier(importer.username) : ""};
COMMIT;
`;
}

async function main() {
  const environment = await readLocalEnvironment();
  const application = applicationDatabase(environment);
  const migration = migrationDatabase(environment);
  const importer = importDatabase(environment);
  const result = spawnSync("docker", [
    "compose", "exec", "-T", "postgres", "sh", "-c",
    'PGPASSWORD="$POSTGRES_PASSWORD" exec psql -h 127.0.0.1 -U "$POSTGRES_USER" -d "$POSTGRES_DB" -X -q -v ON_ERROR_STOP=1',
  ], {
    cwd: projectDirectory,
    input: provisioningSql(application, migration, importer),
    encoding: "utf8",
    shell: false,
    windowsHide: true,
    timeout: 15_000,
    maxBuffer: 64 * 1024,
  });
  if (result.error || result.status !== 0) {
    // PostgreSQL errors may repeat SQL containing credentials. Never forward them.
    throw new Error("Nie udało się przygotować ról i schematu. Sprawdź lokalną bazę, uprawnienia ról i właściciela schematu lmuml.");
  }
  console.log("Przygotowano role API, migracji i importera oraz schemat lmuml. Nie zmieniono tabel ani danych.");
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(error.code ? "Nie udało się odczytać lokalnego .env. Uruchom najpierw init-env.mjs." : error.message);
    process.exitCode = 1;
  });
}
