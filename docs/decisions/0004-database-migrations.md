# ADR 0004 — Flyway i pierwszy schemat meczów

Status: przyjęta 31 października 2026 r. Flyway wybrano po porównaniu z Liquibase; zakres etapu obejmuje migracje i bazę, bez endpointu oraz frontendu.

Aktualizacja: [ADR 0005](0005-football-data-boundary.md) i [analiza API-Football](../research/2026-10-31-api-football.md) wskazują ograniczenia demonstracyjnego modelu V1. Runda, statusy i pewność terminu wymagają weryfikacji przed importerem oraz endpointem. Treści wykonanej migracji nie zmieniono.

Aktualizacja 2 listopada: po sprawdzeniu rzeczywistych próbek i przyjęciu modelu [ADR 0008](0008-football-catalog-schema.md) wprowadza V2. Poniższy opis pierwszego modelu i testów jest zapisem etapu V1; bieżący katalog ma rozgrywki, sezony, drużyny i mecze, bez przypisania do własnych kolejek. Konto API ma SELECT czterech tabel.

## Kontekst i wybór

Zmiany struktury muszą być powtarzalne, wersjonowane i sprawdzane przed uruchomieniem nowego kodu. Ręczne tworzenie tabel na każdej bazie utrudnia ustalenie, która wersja schematu faktycznie działa.

Wybieramy **Flyway i pliki SQL**. Liquibase oferuje dodatkowe formaty opisu zmian, ale w tym projekcie korzystamy z PostgreSQL i chcemy utrzymywać bezpośredni, czytelny SQL. Nie łączymy migracji z automatycznym tworzeniem tabel przez Hibernate ani `schema.sql`.

- Migracje znajdują się w `backend/src/main/resources/db/migration/`.
- `V1__create_match_schedule.sql` tworzy pierwsze tabele i indeks.
- Wykonane wersje i ich checksum zapisuje `lmuml.flyway_schema_history`.
- Po użyciu migracji nie zmieniamy jej treści; kolejna zmiana otrzymuje nową wersję.
- Automatyczny baseline i polecenie clean są wyłączone. Zastaną niezgodność wyjaśniamy; nie naprawiamy jej usunięciem danych.
- Wersję Flyway oraz modułu PostgreSQL dobiera parent Spring Boota. Używamy `spring-boot-starter-flyway` i `org.flywaydb:flyway-database-postgresql`.

## Uruchamianie i uprawnienia

Migracje wykonuje **osobny, jednorazowy proces** tego samego JAR-a z profilem `migration`, bez serwera HTTP. Zwykły start backendu ma Flyway wyłączony.

| Rola | Odpowiedzialność |
| --- | --- |
| Administrator lokalny | Przygotowanie ograniczonych ról i schematu |
| `lmuml_migrator` | Właściciel schematu `lmuml`; wykonuje migracje |
| `lmuml_app` | USAGE schematu i SELECT trzech tabel aplikacji |

Żadna z dwóch ról aplikacyjnych nie jest administratorem klastra. Konto API nie jest członkiem roli migracji i nie dostaje jej hasła. Skrypt konfiguracji odmawia przejęcia istniejącego schematu należącego do innej roli.

Lokalne `run-backend.mjs --migrate` wybiera dane migratora, uruchamia profil bez HTTP i kończy proces po migracji. Zwykłe `run-backend.mjs` używa tylko roli API. Nazwa roli API jest przekazywana migracjom jako walidowany placeholder `runtime`, aby jawnie nadać SELECT właściwej roli, bez wpisywania lokalnej nazwy do SQL.

W przyszłym wdrożeniu migracja ma poprzedzać start nowego backendu. Mechanizm dostarczenia sekretów i uruchomienia procesu na hostingu pozostaje osobnym etapem. Obecne skrypty odczytujące `.env` są narzędziami lokalnymi.

## Pierwszy model

| Tabela | Minimalne dane |
| --- | --- |
| `seasons` | Własny UUID, unikalny kod sezonu, nazwa |
| `teams` | Własny UUID i nazwa |
| `matches` | UUID, sezon, numer kolejki, gospodarze, goście, termin i status |

UUID są niezależne od dostawcy wyników. Nie ustalamy jeszcze sposobu generowania identyfikatorów ani kontraktu HTTP. Kod sezonu, np. `demo-2026`, jest osobnym polem. Nie tworzymy odrębnej tabeli kolejek, dopóki nie ma danych wymagających takiej odpowiedzialności.

Baza wymusza:

- niepuste nazwy i poprawny, unikalny kod sezonu;
- dodatni numer kolejki oraz różne drużyny gospodarzy i gości;
- istnienie sezonu i drużyn przez klucze obce, bez kaskadowego usuwania historii;
- znany termin jako `TIMESTAMPTZ`, czyli jednoznaczny moment w czasie;
- na tym etapie wyłącznie status `SCHEDULED`.

Ten sam numer kolejki może istnieć w wielu sezonach. Indeks `(season_id, matchday, kickoff_at, id)` przygotowuje filtrowanie i stabilną kolejność przyszłego odczytu. Nazwy drużyn nie są identyfikatorami ani polami unikalnymi.

Pełny słownik statusów, nieznany termin po przełożeniu, fazy turnieju, wyniki i mapowanie dostawcy wymagają kolejnych ustaleń oraz migracji. Nie wprowadzamy ich jako domyślnych reguł na podstawie starego kodu.

## Dane i granice

Migracja tworzy **puste tabele**. Syntetyczne sezony i mecze znajdują się wyłącznie w zasobie testowym, poza lokalizacją migracji oraz produkcyjnym JAR-em. Nie odczytujemy danych starej aplikacji.

Pierwszy odczyt będzie osobnym etapem: ustalimy kontrakt i sposób persystencji. Wybór Flyway nie oznacza wyboru JPA, Spring Data JDBC ani architektury całego modułu.

## Weryfikacja etapu

Na Windows `verify` zakończyło się sukcesem: osiem testów integracyjnych, w tym pięć nowych testów migracji, bez pominięć. Sprawdzono pustą bazę, brak powtórnego wykonania V1 i zachowanie rekordów, ograniczenia SQL, uprawnienia API, dwa sezony z kolejką 1, momenty czasu przy zmianie zegara oraz odmowę walidacji zmodyfikowanej migracji.

Dziewięć testów narzędzi Node przeszło. Lokalny provisioning utworzył role i schemat bez resetowania wolumenu. Gotowy JAR wykonał V1, zakończył proces z kodem 0, a drugi przebieg potwierdził brak potrzebnych zmian. Tabele lokalne pozostały puste; właścicielem tabel i historii jest migrator, API ma SELECT wyłącznie tabel aplikacji.

Inspekcja JAR-a potwierdziła obecność migracji i brak fixture oraz klas testowych. Zwykły backend uruchomił się bez profilu migracji; liveness i readiness zwróciły `200 / UP`. Po teście został zatrzymany. Na Linux/macOS nie wykonywano tych komend.

## Źródła

- [Spring Boot: inicjalizacja i migracje](https://docs.spring.io/spring-boot/how-to/data-initialization.html).
- [Flyway: moduł i obsługa PostgreSQL](https://documentation.red-gate.com/flyway/reference/database-driver-reference/postgresql-database).
- [PostgreSQL: ograniczenia i klucze obce](https://www.postgresql.org/docs/18/ddl-constraints.html).
- [PostgreSQL: typy daty i czasu](https://www.postgresql.org/docs/18/datatype-datetime.html).
