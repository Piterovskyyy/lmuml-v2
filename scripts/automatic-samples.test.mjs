import assert from "node:assert/strict";
import { mkdir, mkdtemp, readdir, readFile, realpath, rm, symlink, utimes, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pruneAutomaticSamples } from "./automatic-samples.mjs";

const now = Date.UTC(2026, 10, 17, 12);
const cutoff = now - 7 * 24 * 60 * 60 * 1_000;
const expired = new Date(cutoff);
const fresh = new Date(cutoff + 1_000);

async function testPaths(t) {
  const tempRoot = await realpath(tmpdir());
  const directory = await mkdtemp(path.join(tempRoot, "lmuml-automatic-samples-test-"));
  t.after(async () => {
    const resolved = await realpath(directory);
    assert.equal(path.relative(tempRoot, resolved), path.basename(directory));
    await rm(resolved, { recursive: true });
  });
  return { directory, samplesRoot: path.join(directory, "automatic") };
}

async function writeRun(samplesRoot, name, fileTime) {
  const run = path.join(samplesRoot, name);
  const sample = path.join(run, "sample-123");
  const file = path.join(sample, "fixtures.json");
  await mkdir(sample, { recursive: true });
  await writeFile(file, "{}");
  await utimes(file, fileTime, fileTime);
  await utimes(sample, expired, expired);
  await utimes(run, expired, expired);
  return file;
}

test("retention removes only expired automatic runs and keeps recent samples for retry", async (t) => {
  const { directory, samplesRoot } = await testPaths(t);
  const manualFile = await writeRun(directory, "sync-Manual", expired);
  await writeRun(samplesRoot, "sync-Old123", expired);
  const freshFile = await writeRun(samplesRoot, "sync-New123", fresh);
  const otherFile = await writeRun(samplesRoot, "archive", expired);
  const matchingFile = path.join(samplesRoot, "sync-NotDir");
  await writeFile(matchingFile, "artifact");
  await utimes(matchingFile, expired, expired);
  const emptyRun = path.join(samplesRoot, "sync-Empty0");
  await mkdir(emptyRun);
  await utimes(emptyRun, expired, expired);

  assert.equal(await pruneAutomaticSamples({ samplesRoot, now }), 2);
  assert.deepEqual((await readdir(samplesRoot)).sort(), ["archive", "sync-New123", "sync-NotDir"]);
  for (const file of [manualFile, freshFile, otherFile]) {
    assert.equal(await readFile(file, "utf8"), "{}");
  }
  assert.equal(await readFile(matchingFile, "utf8"), "artifact");
  assert.equal(await pruneAutomaticSamples({ samplesRoot, now }), 0);
});

test("retention skips linked roots, directory entries and nested links", async (t) => {
  const { directory, samplesRoot } = await testPaths(t);
  const manualRoot = path.join(directory, "manual");
  const manualFile = await writeRun(manualRoot, "sync-Manual", expired);
  const linkType = process.platform === "win32" ? "junction" : "dir";
  const linkedRoot = path.join(directory, "linked-automatic");
  await symlink(manualRoot, linkedRoot, linkType);

  assert.equal(await pruneAutomaticSamples({ samplesRoot: linkedRoot, now }), 0);
  await mkdir(samplesRoot);
  await symlink(path.join(manualRoot, "sync-Manual"), path.join(samplesRoot, "sync-Linked"), linkType);
  const linkedRunFile = await writeRun(samplesRoot, "sync-Nested", expired);
  const linkedRun = path.join(samplesRoot, "sync-Nested");
  await symlink(manualRoot, path.join(linkedRun, "linked-directory"), linkType);
  await utimes(linkedRun, expired, expired);

  assert.equal(await pruneAutomaticSamples({ samplesRoot, now }), 0);
  assert.equal(await readFile(manualFile, "utf8"), "{}");
  assert.equal(await readFile(linkedRunFile, "utf8"), "{}");
  assert.deepEqual((await readdir(samplesRoot)).sort(), ["sync-Linked", "sync-Nested"]);
});

test("retention tolerates a missing root and rejects invalid timestamps", async (t) => {
  const { samplesRoot } = await testPaths(t);
  assert.equal(await pruneAutomaticSamples({ samplesRoot, now }), 0);
  const file = await writeRun(samplesRoot, "sync-Old123", expired);
  await assert.rejects(pruneAutomaticSamples({ samplesRoot, now: NaN }), /Nieprawidłowy czas/);
  assert.equal(await readFile(file, "utf8"), "{}");
});
