import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import { get } from "node:https";
import { getCACertificates } from "node:tls";

const defaultOrigin = "https://localhost:8443";
const timeoutMs = 5_000;
const seasonCode = "rehearsal-2026";
const updatesPath = "/api/v1/season-updates";
const playerPath = "/api/v1/player";
const roundId = "50000000-0000-0000-0000-000000000001";
const matchId = "30000000-0000-0000-0000-000000000001";

async function request(
  origin,
  path,
  { expectedStatus = 200, ...options } = {},
) {
  const response = await fetch(new URL(path, origin), {
    ...options,
    redirect: "error",
    signal: AbortSignal.timeout(timeoutMs),
  });
  assert.equal(
    response.status,
    expectedStatus,
    `Nieoczekiwana odpowiedź HTTP dla ${path}`,
  );
  return response;
}

async function checkFrontend(origin) {
  const page = await request(origin, "/");
  assert.match(page.headers.get("content-type") ?? "", /^text\/html\b/);
  const html = await page.text();
  assert.match(
    html,
    /<title>[^<]*LMuML<\/title>/,
    "Oczekiwano dokumentu HTML LMuML",
  );
  const script = html.match(/<script\b[^>]*\bsrc="(\/assets\/[^"]+\.js)"/)?.[1];
  assert.ok(script, "Oczekiwano pliku JavaScript z buildu Vite");
  const asset = await request(origin, script);
  assert.match(
    asset.headers.get("content-type") ?? "",
    /^(?:application|text)\/javascript\b/,
  );
  assert.ok(
    (await asset.arrayBuffer()).byteLength > 0,
    "Pusty plik JavaScript",
  );
}

async function receiveVersion(origin) {
  const url = new URL(updatesPath, origin);
  url.protocol = "wss:";
  const socket = new WebSocket(url, { headers: { Origin: origin } });
  let timer;
  try {
    const message = await new Promise((resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error("Nie odebrano wersji przez WebSocket")),
        timeoutMs,
      );
      socket.onopen = () =>
        socket.send(JSON.stringify({ type: "subscribe", seasonCode }));
      socket.onmessage = (event) => resolve(event.data);
      socket.onerror = (event) =>
        reject(
          new Error(event.message || "Połączenie WebSocket nie powiodło się"),
        );
      socket.onclose = (event) =>
        reject(
          new Error(
            `WebSocket zamknięty przed odpowiedzią (kod ${event.code})`,
          ),
        );
    });
    return JSON.parse(message);
  } finally {
    clearTimeout(timer);
    socket.close();
  }
}

async function checkForeignOrigin(origin) {
  const status = await new Promise((resolve, reject) => {
    const handshake = get(
      new URL(updatesPath, origin),
      {
        signal: AbortSignal.timeout(timeoutMs),
        headers: {
          Origin: "https://foreign.example.test",
          Connection: "Upgrade",
          Upgrade: "websocket",
          "Sec-WebSocket-Version": "13",
          "Sec-WebSocket-Key": randomBytes(16).toString("base64"),
        },
      },
      (response) => {
        response.resume();
        resolve(response.statusCode);
      },
    );
    handshake.once("upgrade", (response, socket) => {
      socket.destroy();
      resolve(response.statusCode);
    });
    handshake.once("error", reject);
  });
  assert.equal(status, 403, "WebSocket powinien odrzucić obcy Origin");
}

async function checkPlayer(origin) {
  const email = `rehearsal-${randomUUID()}@example.test`;
  const password = randomUUID();
  const displayName = "Test wdrożenia";
  const predictionsPath = `/betting-rounds/${roundId}/predictions`;
  const prediction = { matchId, homeGoals: 2, awayGoals: 1 };
  let cookie;

  // A new anonymous session supplies the token, and login rotates the session cookie.
  async function playerRequest(path, { headers, ...options } = {}) {
    const response = await request(origin, `${playerPath}${path}`, {
      ...options,
      headers: { ...headers, ...(cookie ? { Cookie: cookie } : {}) },
    });
    const session = response.headers
      .getSetCookie()
      .find((value) => value.startsWith("JSESSIONID="));
    if (session) {
      assert.match(
        session,
        /;\s*Secure(?:;|$)/i,
        "Ciasteczko sesji przez HTTPS powinno mieć Secure",
      );
      cookie = session.split(";", 1)[0];
    }
    return response;
  }

  const anonymous = await playerRequest("/session").then((response) =>
    response.json(),
  );
  assert.equal(anonymous.authenticated, false);
  assert.ok(
    anonymous.csrfToken && cookie,
    "Brak anonimowej sesji lub tokenu CSRF",
  );
  await playerRequest("/register", {
    method: "POST",
    expectedStatus: 201,
    headers: {
      "X-CSRF-TOKEN": anonymous.csrfToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, displayName, password }),
  });
  await playerRequest("/login", {
    method: "POST",
    expectedStatus: 204,
    headers: { "X-CSRF-TOKEN": anonymous.csrfToken },
    body: new URLSearchParams({ username: email, password }),
  });
  const authenticated = await playerRequest("/session").then((response) =>
    response.json(),
  );
  assert.equal(authenticated.authenticated, true);
  assert.equal(authenticated.player?.displayName, displayName);
  assert.ok(authenticated.csrfToken, "Brak tokenu CSRF po logowaniu");

  const save = await playerRequest(predictionsPath, {
    method: "POST",
    headers: {
      "X-CSRF-TOKEN": authenticated.csrfToken,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ predictions: [prediction] }),
  }).then((response) => response.json());
  assert.deepEqual(save.saved, [prediction], "Nie zapisano typu 2:1");
  const read = await playerRequest(predictionsPath).then((response) =>
    response.json(),
  );
  const stored = read.predictions.find(
    (candidate) => candidate.matchId === matchId,
  );
  assert.equal(stored?.homeGoals, prediction.homeGoals);
  assert.equal(stored?.awayGoals, prediction.awayGoals);

  await playerRequest("/logout", {
    method: "POST",
    expectedStatus: 204,
    headers: { "X-CSRF-TOKEN": authenticated.csrfToken },
  });
  console.log(
    "Konto testowe, logowanie, ciasteczko Secure i zapis typu 2:1 potwierdzone przez HTTPS.",
  );
}

async function run() {
  const args = process.argv.slice(2);
  const positional = args.filter((argument) => !argument.startsWith("--"));
  assert.ok(
    positional.length <= 1 &&
      args.every(
        (argument) =>
          argument === "--with-player" || !argument.startsWith("--"),
      ),
    `Użycie: node scripts/check-rehearsal.mjs [--with-player] [${defaultOrigin}]`,
  );

  const base = new URL(positional[0] ?? defaultOrigin);
  assert.ok(
    base.protocol === "https:" &&
      ["localhost", "127.0.0.1", "[::1]"].includes(base.hostname) &&
      base.href === `${base.origin}/`,
    "Podaj lokalny origin HTTPS, np. https://localhost:8443",
  );
  assert.notEqual(
    process.env.NODE_TLS_REJECT_UNAUTHORIZED,
    "0",
    "Wymagana jest weryfikacja certyfikatów TLS",
  );
  assert.ok(
    getCACertificates("extra").length > 0,
    "Przekaż lokalny certyfikat CA w NODE_EXTRA_CA_CERTS przed uruchomieniem Node",
  );

  await checkFrontend(base.origin);
  const catalogue = await request(
    base.origin,
    `/api/v1/seasons/${seasonCode}/matches`,
  ).then((response) => response.json());
  assert.equal(catalogue.season?.code, seasonCode);
  assert.ok(
    catalogue.matches.some((match) => match.id === matchId),
    "Brak meczu demonstracyjnego",
  );
  assert.equal(
    typeof catalogue.fixturesCapturedAt,
    "string",
    "Brak zapisanej wersji demonstracyjnych wyników",
  );
  const expectedUpdate = {
    type: "fixtures",
    fixturesCapturedAt: catalogue.fixturesCapturedAt,
  };
  assert.deepEqual(await receiveVersion(base.origin), expectedUpdate);
  assert.deepEqual(await receiveVersion(base.origin), expectedUpdate);
  await checkForeignOrigin(base.origin);
  console.log(
    `Sprawdzono HTTPS, zbudowany frontend, katalog meczów (${catalogue.matches.length}), ponowne połączenie WSS i odrzucenie obcego originu.`,
  );

  if (args.includes("--with-player")) await checkPlayer(base.origin);
}

try {
  await run();
} catch (error) {
  console.error(
    `Próba wdrożenia nie powiodła się. ${error.message}${error.cause?.code ? ` (${error.cause.code})` : ""}`,
  );
  process.exitCode = 1;
}
