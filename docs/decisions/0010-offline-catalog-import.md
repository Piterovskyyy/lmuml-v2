# ADR 0010 — powtarzalny import katalogu z zachowanych próbek

Status: przyjęta 2 listopada 2026 r. Użytkownik zaakceptował import zapisanych plików, dedykowane konto zapisu, wspólną transakcję i kontrolę ponownego uruchomienia bez duplikatów.

## Przepływ

`ApiFootballSampleReader` czyta z jawnie wskazanego katalogu `leagues.json`, `fixtures.json` i dwa pliki `*.metadata.json`. Wymaga ograniczonych rozmiarów zwykłych plików, kompletnego JSON-a, zgodności metadanych i zakresu oraz oryginalnego `capturedAt`. Nie odczytuje klucza i nie pobiera danych przez HTTP.

`ApiFootballImportMapper` zamienia kontrakty dostawcy na osobny `ApiFootballImportBatch`. Przed otwarciem transakcji sprawdza wymagane identyfikatory/nazwy/statusy, daty, nieujemne wyniki/minuty, różne drużyny, duplikaty meczów i sprzeczne metadane tej samej drużyny. Zachowuje nullable wartości, niezależne pary bramek i oryginalne wskazanie zwycięzcy. Coverage pochodzi z pełnego źródłowego JSON-a, więc nieznane flagi nie giną przy konwersji DTO.

`ApiFootballCatalogImporter` otwiera jedną transakcję: snapshot rozgrywek → snapshot meczów → zapis katalogu. Błąd lub konflikt wycofuje cały zakres. `ApiFootballCatalogWriter` wykonuje SQL przez JdbcClient, bez kontrolera, JPA lub dodatkowej warstwy interfejsów.

## Tożsamość i aktualizacje

- Rozgrywki i drużyny dopasowujemy po `api_football_id`, sezon po rozgrywkach i roku, mecz po `api_football_id`.
- UUID jest kandydatem przy INSERT. Konflikt aktualizuje dane bez zastępowania istniejącego UUID lub kodu.
- Początkowe kody to `api-football-{leagueId}` i `api-football-{leagueId}-{year}`. Zmiana nazwy dostawcy nie zmienia kodu.
- Wspólne drużyny i rozgrywki mają `source_captured_at`. Starsza obserwacja z innego sezonu może dodać jego mecze, ale nie nadpisze nowszej nazwy/logo wspólnego obiektu. Istniejące rekordy bez znanej chwili źródłowej przyjmują pierwszą obserwację.
- Mecz z istniejącym ID dostawcy nie jest automatycznie przenoszony do innego sezonu: konflikt zatrzymuje import.
- Brak meczu w odpowiedzi nie powoduje DELETE. Poprawna pusta lista nie usuwa historii.
- Metadane pochodzące z API są zarządzane przez importer; ponowny import może zastąpić ich ręczne lokalne poprawki. Osobny mechanizm własnych nadpisań nie jest częścią tego etapu.

Nie wyliczamy punktów, własnych kolejek, reguł przełożeń ani dostępności typowania. Nie interpretujemy brakujących wyników jako zera.

## Odrębny proces i rola

Profil `api-football-import` uruchamia zadanie jednorazowo bez serwera HTTP, Flyway i klienta API. Launcher przekazuje wyłącznie konfigurację bazy importera. `LMUML_IMPORT_DB_USER/PASSWORD` są odrębne od administratora, migratora i runtime. Generator dopisuje brakujące dane bez rotacji istniejących haseł i kluczy.

[V5](../../backend/src/main/resources/db/migration/V5__grant_catalog_import_access.sql) dodaje źródłowe czasy wspólnych obiektów oraz SELECT/INSERT/UPDATE katalogu i snapshotów dla roli importera. Ta rola nie ma DELETE/TRUNCATE, DDL ani odczytu historii Flyway. Provisioning tworzy rolę, CONNECT i USAGE; właściciel migracji nadaje prawa do tabel. Rola runtime pozostaje tylko do odczytu katalogu, bez snapshotów i sekretów importera.

Lokalnie: przygotowanie środowiska i ról → budowa/testy → migracje → jawna komenda importu. W przyszłym pobieraniu te same mapper, writer i transakcja mogą obsłużyć odpowiedzi klienta HTTP; pierwszy etap korzysta z zachowanych próbek bez kolejnego zużycia API.

## Weryfikacja i ograniczenia

Pełne `Maven verify` przeszło: 65 testów jednostkowych i 37 integracyjnych, bez pominięć. Siedem przypadków importera sprawdza metadane/snapshoty, stabilność identyfikatorów przy powtórce, nowsze i starsze źródła, odrzucenie błędnych danych, rollback po konflikcie sezonu, ochronę wspólnych metadanych między sezonami, brak usuwania przy pustej odpowiedzi i ograniczenia roli. Przeszły też 24 testy narzędzi Node.

Po zachowaniu lokalnej kopii wykonano V5, a następnie import rzeczywistych próbek sezonu 2024: 1 rozgrywka, 1 sezon, 81 drużyn, 279 meczów i 2 snapshoty. Powtórzono tę samą komendę; porównanie treści wszystkich pięciu tabel potwierdziło zachowanie wartości i UUID oraz brak dodatkowych rekordów. Oba procesy zakończyły się kodem 0. Nie wykonano nowych żądań API ani zapisów do starej aplikacji.

Importer nie działa jeszcze cyklicznie. Dane to historyczna Liga Mistrzów 2024/25 dostępna na koncie Free; nie potwierdzają obsługi zmian live, odwołań i korekt w trakcie rzeczywistego sezonu. Logi błędów komendy nie powtarzają surowych plików ani komunikatów SQL. Szczegółowa diagnoza błędnych wejść odbywa się w lokalnych próbkach/testach.
