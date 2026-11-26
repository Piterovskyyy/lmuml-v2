import { lstat, readdir, realpath, rm } from "node:fs/promises";
import path from "node:path";
import { projectDirectory } from "./local-environment.mjs";

const automaticSamplesPath = path.join(".local", "api-football", "automatic");
const retentionMs = 7 * 24 * 60 * 60 * 1_000;
const runName = /^sync-[a-zA-Z0-9]{6}$/;

export const automaticSamplesRoot = path.join(projectDirectory, automaticSamplesPath);

async function isExpired(entry, cutoff) {
  const metadata = await lstat(entry);
  if (metadata.mtimeMs > cutoff) return false;
  if (metadata.isFile()) return true;
  if (!metadata.isDirectory() || path.relative(entry, await realpath(entry)) !== "") return false;

  // A sample may have been written after the directory containing the run was created.
  for (const child of await readdir(entry)) {
    if (!await isExpired(path.join(entry, child), cutoff)) return false;
  }
  return true;
}

export async function pruneAutomaticSamples({ samplesRoot = automaticSamplesRoot, now = Date.now() } = {}) {
  if (!Number.isFinite(now)) throw new Error("Nieprawidłowy czas sprzątania automatycznych próbek.");
  const cutoff = now - retentionMs;
  const requestedRoot = path.resolve(samplesRoot);

  let root;
  let entries;
  try {
    if (!(await lstat(requestedRoot)).isDirectory()) return 0;
    root = await realpath(requestedRoot);
    const expectedRoot = path.relative(requestedRoot, automaticSamplesRoot) === ""
      ? path.join(await realpath(projectDirectory), automaticSamplesPath)
      : path.join(await realpath(path.dirname(requestedRoot)), path.basename(requestedRoot));
    if (path.relative(expectedRoot, root) !== "") return 0;
    entries = await readdir(root, { withFileTypes: true });
  } catch (error) {
    if (error.code === "ENOENT") return 0;
    throw error;
  }

  let removed = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || !runName.test(entry.name)) continue;
    const directory = path.join(root, entry.name);
    try {
      if (!await isExpired(directory, cutoff)) continue;
      // Verify the target is still the direct child of the intended root before recursive removal.
      if (path.relative(root, await realpath(directory)) !== entry.name) continue;
      await rm(directory, { recursive: true });
      removed += 1;
    } catch (error) {
      if (error.code !== "ENOENT") throw error;
    }
  }
  return removed;
}
