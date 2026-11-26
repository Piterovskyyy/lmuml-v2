# Lokalne próbne wdrożenie

Próba uruchamia gotowy build Reacta i Spring Boot przez Caddy z HTTPS. Compose tworzy osobne sieci i wolumeny projektu `lmuml-v2-rehearsal`. Na komputerze jest dostępne wejście HTTPS na `127.0.0.1:8443`. PostgreSQL, Redis i port Springa są dostępne w sieciach kontenerów.

Caddy jest używany w tej próbie jako kandydat z [planu wdrożenia](deployment-plan.md). Środowisko korzysta z syntetycznych meczów i testowych kont. Hasła ról bazy w pliku Compose mają zakres tej lokalnej próby.

## Weryfikacja w GitHub Actions

[Workflow CI](../../.github/workflows/ci.yml) jest przygotowany do uruchamiania dla pull requestów, zmian na `main` i ręcznych uruchomień. Na runnerze Ubuntu zadanie frontendu sprawdza format, testy, build oraz skrypty Node. W tym samym czasie backend przechodzi `Maven verify`, w tym testy PostgreSQL i Redis w Testcontainers. Wersje Node i Javy pochodzą z `mise.toml`.

Po zaliczeniu obu zadań runner buduje obrazy i uruchamia Compose ze świeżą bazą. Test korzysta z lokalnego CA Caddy i sprawdza HTTPS, WSS oraz zapis typu. Przy błędzie zadanie wypisuje logi Compose. Po zakończeniu zatrzymuje stos testowy. Uprawnienia tokenu ograniczają się do odczytu zawartości repozytorium.

## Budowa i start

Z katalogu głównego repozytorium, przy uruchomionym Dockerze:

```sh
docker compose -f deploy/rehearsal/compose.yaml build
docker compose -f deploy/rehearsal/compose.yaml up --detach --wait
docker compose -f deploy/rehearsal/compose.yaml ps --all
```

Backend i serwer statyczny mają osobne obrazy. PostgreSQL najpierw tworzy role, a zadanie `migrate` uruchamia Flyway z rolą właściciela schematu. Zadanie `seed` zapisuje mecze demonstracyjne i aktywny sezon. Po poprawnym zakończeniu obu zadań Spring startuje z ograniczoną rolą aplikacji. Caddy zaczyna przekazywać żądania po potwierdzeniu readiness Springa. Końcowy healthcheck odpytuje API przez HTTPS z weryfikacją certyfikatu. [Kolejność startu w Compose](https://docs.docker.com/compose/how-tos/startup-order/).

## Sprawdzenie HTTPS i WebSocket

Caddy wystawia certyfikat lokalny. Poniższe polecenia kopiują certyfikat CA i dodają go do zaufania wyłącznie na czas procesu Node. W PowerShell:

```powershell
New-Item -ItemType Directory -Force .local | Out-Null
docker compose -f deploy/rehearsal/compose.yaml cp web:/data/caddy/pki/authorities/local/root.crt .local/rehearsal-ca.crt
$env:NODE_EXTRA_CA_CERTS = (Resolve-Path .local/rehearsal-ca.crt).Path
mise exec -- node scripts/check-rehearsal.mjs
Remove-Item Env:NODE_EXTRA_CA_CERTS
```

Skrypt sprawdza stronę, zasoby z buildu, odczyt sezonu oraz zgodność wersji REST i `wss:` po ponownym połączeniu. Opcja `--with-player` dodatkowo rejestruje konto pod losowym adresem w domenie `example.test`, sprawdza ciasteczko `Secure`, zapisuje i odczytuje typ 2:1 przed wylogowaniem. Konto i typ zostają w demonstracyjnej bazie.

Przeglądarka potrzebuje lokalnego CA w swoim profilu, żeby otworzyć `https://localhost:8443` bez komunikatu o niezaufanym certyfikacie. Połączenie Caddy → Spring biegnie wewnątrz sieci Compose. Spring dostaje host i schemat z proxy, aby weryfikacja originu uwzględniała publiczny adres HTTPS. [Proxy Caddy](https://caddyserver.com/docs/caddyfile/directives/reverse_proxy).

## Zatrzymanie i ponowny start

```sh
docker compose -f deploy/rehearsal/compose.yaml down
```

Wolumen bazy demonstracyjnej i certyfikaty Caddy zostają. Ponowne `up` sprawdza migracje i zachowuje wpisy z poprzedniej próby. Termin otwartego meczu przy pierwszym zasileniu ustawiany jest 30 dni w przyszłość. [Compose down](https://docs.docker.com/reference/cli/docker/compose/down/).
