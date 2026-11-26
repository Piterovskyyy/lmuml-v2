import { mkdir, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { projectDirectory } from "./local-environment.mjs";
import { parseProbeArguments } from "./probe-api-football.mjs";

const minute = 60_000;
export const matchdayIntervalMs = 15 * minute;
const beforeKickoff = 15 * minute;
const afterKickoff = 180 * minute;
const maxDailyAttempts = 32;
const statesToRefresh = new Set(["SCHEDULED", "LIVE", "BREAK", "SUSPENDED", "FINISHED", "AWARDED"]);

async function readLocalJson(resource, description, request, signal) {
  const timeout = AbortSignal.timeout(5_000);
  let response;
  try {
    response = await request(`http://127.0.0.1:8080/api/v1/seasons/${resource}`, {
      redirect: "error",
      cache: "no-store",
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (error) {
    signal?.throwIfAborted();
    throw new Error(`Nie udało się odczytać ${description} z lokalnego API na porcie 8080.`, { cause: error });
  }
  if (!response.ok) throw new Error(`Lokalny odczyt ${description} zwrócił HTTP ${response.status}.`);

  try {
    return await response.json();
  } catch (error) {
    signal?.throwIfAborted();
    throw new Error(`Nieprawidłowa odpowiedź podczas odczytu ${description} z lokalnego API.`, { cause: error });
  }
}

async function loadActiveScope(request, signal) {
  const selection = await readLocalJson("active", "aktywnego sezonu", request, signal);
  const code = selection?.seasonCode;
  if (code === null) return null;

  const match = typeof code === "string" ? /^api-football-(\d+)-(\d+)$/.exec(code) : null;
  const invalidCode = "Aktywny sezon musi mieć kod z importu API-Football, np. api-football-2-2024.";
  if (!match || match[0] !== code) throw new Error(invalidCode);
  try {
    return parseProbeArguments(["--league", match[1], "--season", match[2]]);
  } catch {
    throw new Error(invalidCode);
  }
}

async function loadSchedule(parameters, request, signal) {
  const code = `api-football-${parameters.leagueId}-${parameters.season}`;
  const schedule = await readLocalJson(`${code}/matches`, `meczów sezonu ${code}`, request, signal);
  if (schedule?.season?.code !== code || !Array.isArray(schedule.matches)) {
    throw new Error(`Nieprawidłowy terminarz sezonu ${code} z lokalnego API.`);
  }

  return schedule.matches.map((match) => {
    if (typeof match?.status?.state !== "string"
        || (match.kickoffAt !== null && typeof match.kickoffAt !== "string")) {
      throw new Error(`Nieprawidłowy mecz sezonu ${code} z lokalnego API.`);
    }
    const kickoff = match.kickoffAt === null ? null : Date.parse(match.kickoffAt);
    if (kickoff !== null && !Number.isFinite(kickoff)) {
      throw new Error(`Nieprawidłowy termin meczu sezonu ${code} z lokalnego API.`);
    }
    return { kickoff, state: match.status.state };
  });
}

async function reserveSlot(stateDirectory, timestamp) {
  const utcDate = new Date(timestamp).toISOString().slice(0, 10);
  const dayDirectory = path.join(stateDirectory, utcDate);
  const slot = Math.floor(timestamp / matchdayIntervalMs);

  await mkdir(dayDirectory, { recursive: true });
  try {
    await writeFile(path.join(dayDirectory, `${slot}.slot`), "", { flag: "wx" });
  } catch (error) {
    if (error.code === "EEXIST") return "slot-used";
    throw error;
  }

  // Count after claiming so simultaneous processes cannot exceed the shared daily budget.
  const reservations = (await readdir(dayDirectory)).filter((name) => /^\d+\.slot$/.test(name));
  return reservations.length <= maxDailyAttempts ? "reserved" : "daily-limit";
}

export async function runMatchdaySync(parameters, sync, {
  request = fetch,
  now = Date.now,
  stateDirectory = path.join(projectDirectory, ".local", "api-football", "matchday"),
  signal,
} = {}) {
  signal?.throwIfAborted();
  const scope = parameters ?? await loadActiveScope(request, signal);
  signal?.throwIfAborted();
  if (!scope) return "no-active-season";

  const schedule = await loadSchedule(scope, request, signal);
  signal?.throwIfAborted();
  const timestamp = now();
  const hasMatchInWindow = schedule.some(({ kickoff, state }) =>
    kickoff !== null && statesToRefresh.has(state)
    && timestamp >= kickoff - beforeKickoff && timestamp <= kickoff + afterKickoff);
  if (!hasMatchInWindow) return "outside-window";

  const reservation = await reserveSlot(stateDirectory, timestamp);
  if (reservation !== "reserved") return reservation;

  signal?.throwIfAborted();
  await sync(scope, { signal });
  return "synced";
}
