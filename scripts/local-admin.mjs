import { pbkdf2Sync, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const privateDirectory = new URL("../.local/", import.meta.url);
const passwordFile = new URL("admin-password.txt", privateDirectory);

export async function localAdminEnvironment(environment, { migrate = false } = {}) {
  if (migrate) return {};

  const configuredHash = environment.LMUML_ADMIN_PASSWORD_HASH;
  if (configuredHash) return { LMUML_ADMIN_PASSWORD_HASH: configuredHash };

  let password;
  try {
    password = (await readFile(passwordFile, "utf8")).trim();
  } catch (error) {
    if (error.code === "ENOENT") return {};
    throw error;
  }
  if (!/^[a-zA-Z0-9_-]{32}$/.test(password)) {
    throw new Error("Nieprawidłowy lokalny plik hasła administratora.");
  }
  // Format Spring Security PBKDF2 v5.8: hexadecimal salt followed by the derived key.
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(password, salt, 310_000, 32, "sha256");
  return { LMUML_ADMIN_PASSWORD_HASH: Buffer.concat([salt, hash]).toString("hex") };
}

if (import.meta.main) {
  try {
    await mkdir(privateDirectory, { recursive: true, mode: 0o700 });
    await writeFile(passwordFile, randomBytes(24).toString("base64url") + "\n", {
      flag: "wx",
      mode: 0o600,
    });
    console.log("Utworzono lokalne hasło administratora w .local/admin-password.txt.");
  } catch (error) {
    if (error.code === "EEXIST") {
      console.log("Lokalne hasło administratora jest już skonfigurowane.");
    } else {
      console.error("Nie udało się utworzyć lokalnego hasła administratora.");
      process.exitCode = 1;
    }
  }
}
