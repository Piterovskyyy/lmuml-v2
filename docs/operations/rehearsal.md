# Local deployment rehearsal

The rehearsal runs the production React build and Spring Boot behind Caddy with HTTPS. Compose creates dedicated networks and volumes in the `lmuml-v2-rehearsal` project. The HTTPS endpoint binds to `127.0.0.1:8443`. PostgreSQL, Redis, and the Spring port are available on the container networks.

The environment contains fictional fixtures and test accounts. The database credentials in Compose are scoped to the local rehearsal.

## GitHub Actions verification

The [CI workflow](../../.github/workflows/ci.yml) runs on pull requests, pushes to `main`, and manual dispatch. On Ubuntu, one job verifies frontend formatting, tests, the build, and Node scripts. Another runs `Maven verify` with PostgreSQL and Redis in Testcontainers. Both use the runtime versions from `mise.toml`.

After both jobs succeed, CI builds the images, starts Compose with a fresh database, and verifies HTTPS, WSS, and prediction persistence. On failure it prints Compose logs. The final step shuts the stack down.

## Build and start

From the repository root, with Docker running:

```sh
docker compose -f deploy/rehearsal/compose.yaml build
docker compose -f deploy/rehearsal/compose.yaml up --detach --wait
docker compose -f deploy/rehearsal/compose.yaml ps --all
```

PostgreSQL creates the database roles. The `migrate` service runs Flyway as the schema owner, and `seed` loads the demo fixtures and selects the active season. Spring then starts with the runtime role. Caddy waits for Spring readiness, and the final health check verifies the API over HTTPS. [Compose startup order](https://docs.docker.com/compose/how-tos/startup-order/).

## Verify HTTPS and WebSocket

Caddy creates a local certificate authority. The commands below copy the public CA certificate and trust it only in the test process. With Node installed from `mise.toml`, run:

```sh
mkdir -p .local
docker compose -f deploy/rehearsal/compose.yaml cp web:/data/caddy/pki/authorities/local/root.crt .local/rehearsal-ca.crt
NODE_EXTRA_CA_CERTS="$PWD/.local/rehearsal-ca.crt" mise exec node -- node scripts/check-rehearsal.mjs
```

In PowerShell:

```powershell
New-Item -ItemType Directory -Force .local | Out-Null
docker compose -f deploy/rehearsal/compose.yaml cp web:/data/caddy/pki/authorities/local/root.crt .local/rehearsal-ca.crt
$env:NODE_EXTRA_CA_CERTS = (Resolve-Path .local/rehearsal-ca.crt).Path
mise exec node -- node scripts/check-rehearsal.mjs
Remove-Item Env:NODE_EXTRA_CA_CERTS
```

The script checks the frontend assets, the fixture catalog, and the REST/WSS revision after reconnecting. Add `--with-player` to also test registration, a Secure session cookie, saving and reading a 2:1 prediction, and logout. This mode creates a test player and prediction in the demo database.

To browse [localhost:8443](https://localhost:8443), trust the local CA in your browser profile. Caddy forwards the original public host and HTTPS scheme to Spring so WebSocket origin checks match the browser address. [Caddy reverse proxy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## Stop and restart

```sh
docker compose -f deploy/rehearsal/compose.yaml down
```

The demo database and CA volumes are retained. Starting again verifies the migrations and keeps existing demo data. The first seed sets the open fixture's kickoff 30 days into the future. [Compose down](https://docs.docker.com/reference/cli/docker/compose/down/).
