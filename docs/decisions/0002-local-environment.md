# ADR 0002 — powtarzalne środowisko lokalne

Status: przyjęta 31 października 2026 r.

## Kontekst

Nowy projekt potrzebuje jednakowych narzędzi do lokalnej pracy i późniejszego CI. Instalacje nie powinny zmieniać konfiguracji starej aplikacji. Pierwszy etap obejmuje narzędzia i bazę, przed implementacją API oraz reguł typowania.

## Decyzja

- **Eclipse Temurin 25 LTS**, obecnie 25.0.5, i **Node 24 LTS**, obecnie 24.22.2, przypinamy w [mise.toml](../../mise.toml). Wykorzystujemy dostępny już menedżer mise. Polecenia uruchamiane przez `mise exec` otrzymują właściwy PATH i JAVA_HOME dla procesu.
- **Apache Maven 3.10.0** uruchamiamy przez oficjalny **Maven Wrapper 3.3.4**, wariant `only-script`, w katalogu `backend/`. Wersja i SHA-256 dystrybucji są zapisane w [properties wrappera](../../backend/.mvn/wrapper/maven-wrapper.properties). Globalny Maven nie jest wymagany.
- **PostgreSQL 18.6** uruchamiamy lokalnie przez [Compose](../../compose.yaml). Obraz jest przypięty do wersji i digestu. Dane są w nazwanym wolumenie pod `/var/lib/postgresql`, zgodnie z układem oficjalnego obrazu PG18.
- Port bazy publikujemy wyłącznie jako `127.0.0.1:5433`. Projekt Compose ma nazwę `lmuml-v2-dev`; kontener i wolumen są odseparowane od innych projektów.
- Lokalny plik `.env` tworzy [init-env.mjs](../../scripts/init-env.mjs) z losowym hasłem. Istniejącego pliku nie nadpisuje. Do repo trafia jedynie [.env.example](../../.env.example).

## Rozważone alternatywy

- **Java 21 LTS:** nadal realna, bardziej zachowawcza alternatywa. Dla projektu zaczynanego od podstaw wybrano nowszą linię 25; zgodność konkretnych bibliotek będzie sprawdzana przy ich dodawaniu.
- **Gradle:** elastyczne narzędzie budowy, ale na tym etapie dodatkowy język konfiguracji nie rozwiązuje potrzeby projektu. Wybrano Maven i jego konwencje.
- **Globalna instalacja JDK i Mavena:** możliwa, lecz utrudnia rozdzielenie projektów oraz wersji. Mise i wrapper mają różne role: pierwszy wybiera JDK/Node, drugi przypina Maven.
- **Wspólna baza z innym projektem:** odrzucona na rzecz własnego kontenera i wolumenu deweloperskiego.

## Konsekwencje

- `mise install` pobiera przypięte narzędzia. Nie trzeba zmieniać globalnego PATH ani profilu PowerShell.
- Pierwsze uruchomienie wrappera pobiera Maven. Przy aktualizacji dystrybucji trzeba świadomie zaktualizować URL i checksum.
- Skrypty wrappera zachowują nagłówki, LICENSE i NOTICE Apache. Jest to kod zależności utrzymywany przez jej projekt.
- `docker compose down` usuwa kontener i sieć, zachowując nazwany wolumen. Nie używamy `down -v` w zwykłym cyklu pracy.
- Dane i role bazy są inicjalizowane tylko przy pustym wolumenie. Zmiana hasła w `.env` nie zmienia automatycznie hasła istniejącej bazy.
- Rola wskazana przez `POSTGRES_USER` jest administratorem lokalnej bazy. Przyszłe API otrzyma osobną rolę z właściwymi uprawnieniami; konfiguracja deweloperska nie jest plikiem wdrożenia produkcyjnego.
- Ten etap nie wybiera jeszcze wersji Spring Boot, narzędzia migracji, kontraktu API, logowania ani modelu domeny.

## Weryfikacja etapu

Na Windows sprawdzono narzędzia przez `mise exec` oraz `backend/mvnw.cmd --version`. Compose przeszedł walidację i osiągnął stan healthy. Logowanie SQL po TCP działało; kontrolny rekord przetrwał odtworzenie kontenera, po czym własna tabela kontrolna została usunięta. Ponowne uruchomienie generatora zachowało hash istniejącego `.env`.

Nie jest to potwierdzenie działania API ani pełnego wdrożenia. Budowa aplikacji i testy jej kodu dojdą w odpowiednim zadaniu.

## Źródła

- [Temurin i linie LTS](https://adoptium.net/support/).
- [Java w mise](https://mise.jdx.dev/lang/java.html).
- [Node: wydania wspierane](https://nodejs.org/en/about/previous-releases).
- [Maven Wrapper](https://maven.apache.org/tools/wrapper/) i [wydania Maven](https://maven.apache.org/download.cgi).
- [PostgreSQL: wspierane wersje](https://www.postgresql.org/support/versioning/).
- [Oficjalny obraz PostgreSQL](https://hub.docker.com/_/postgres).
