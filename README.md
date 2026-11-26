# LMuML

Aplikacja do typowania wyników meczów piłkarskich i porównywania punktów graczy.

Spring Boot udostępnia katalog sezonu, opublikowane rundy, konta graczy, zapis typów i rankingi. PostgreSQL przechowuje dane aplikacji, a Flyway wersjonuje schemat. Importer API-Football zapisuje migawki i aktualizuje katalog w jednej transakcji. Zmiana wersji meczów jest dostępna również przez WebSocket.

## Weryfikacja

Po instalacji narzędzi z `mise.toml` uruchom Docker i wykonaj:

```sh
mise exec java -- sh backend/mvnw --batch-mode --no-transfer-progress -f backend/pom.xml verify
mise exec node -- node --test 'scripts/*.test.mjs'
```

Na Windows użyj `.\backend\mvnw.cmd` w miejscu `sh backend/mvnw`. Testy integracyjne uruchamiają odizolowane PostgreSQL i Redis przez Testcontainers.
