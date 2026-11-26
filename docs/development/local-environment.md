# Środowisko lokalne

Status: narzędzia, lokalna baza, backend, migracje V1–V5, importer próbek i odczyt meczów sezonu skonfigurowane. Decyzje opisują [katalog w ADR 0008](../decisions/0008-football-catalog-schema.md), [snapshoty w ADR 0009](../decisions/0009-provider-metadata-and-snapshots.md) i [import w ADR 0010](../decisions/0010-offline-catalog-import.md). Działa również [responsywny frontend](frontend.md).

## Pierwsze uruchomienie

Wymagane są Git, mise i działający Docker z Compose. Polecenia wykonujemy z katalogu nowego projektu.

```sh
mise trust mise.toml
mise install
mise exec -- node scripts/init-env.mjs
docker compose up --detach --wait
mise exec -- node scripts/setup-database.mjs
mise exec -- node scripts/doctor.mjs
```

Zaufanie dotyczy konfiguracji narzędzi tego repozytorium; przed użyciem konfiguracji obcego projektu należy ją przeczytać. `mise install` pobiera JDK i Node przypięte w `mise.toml`, bez zmiany globalnego PATH.

Na Windows, jeśli Docker Desktop nie działa, można go uruchomić przez `docker desktop start`. Na Linux należy mieć działający Docker Engine. Nie zmieniamy kontekstu Dockera automatycznie.

### Maven Wrapper

Windows / PowerShell:

```powershell
mise exec -- .\backend\mvnw.cmd --version
```

Linux / macOS:

```sh
mise exec -- sh backend/mvnw --version
```

Wrapper pobiera Maven 3.10.0 i sprawdza checksum dystrybucji. Projekt Maven znajduje się w `backend/pom.xml`. Opcja `-f backend/pom.xml` pozwala budować go z katalogu głównego repozytorium.

### Lokalny PostgreSQL

| Parametr | Wartość |
| --- | --- |
| Adres i port | `127.0.0.1:5433`, jeśli nie zmieniono portu w lokalnym .env |
| Baza | `lmuml_dev` |
| Rola administracyjna dev | `lmuml_dev_admin` |
| Schemat aplikacji | `lmuml` |
| Rola API | `lmuml_app`, USAGE schematu i SELECT tabel aplikacji |
| Rola migracji | `lmuml_migrator`, właściciel schematu `lmuml`, bez praw administratora klastra |
| Rola importu | `lmuml_importer`, SELECT/INSERT/UPDATE katalogu i snapshotów, bez DDL i kasowania |
| Hasło | W lokalnym `.env`, poza Gitem |
| Dane | Nazwany wolumen projektu Compose |

Generator tworzy `.env` z losowymi hasłami. Przy aktualizacji zachowuje istniejące dane i klucz API, uzupełniając brakujące pola migratora/importera. Haseł nie wypisuje. Skrypt `setup-database.mjs` przygotowuje ograniczone role oraz schemat także na istniejącym wolumenie; nie tworzy tabel. Odmawia zmiany zastanej uprzywilejowanej roli lub przejęcia schematu innego właściciela.

```sh
docker compose ps
docker compose stop
docker compose up --detach --wait
```

`stop` zatrzymuje usługę, a ponowne `up` ją uruchamia. `docker compose down` usuwa kontener i sieć, zachowując nazwany wolumen. Opcja `-v` usuwa dane i nie jest zwykłą komendą zatrzymania. Wolumen nie zastępuje kopii zapasowej.

Zmienne `POSTGRES_*` inicjalizują pusty wolumen. Zmiana hasła administratora w `.env` nie zmienia istniejącego hasła bazy; nie rozwiązujemy takiej rozbieżności przez automatyczne usuwanie danych. Po świadomej zmianie hasła roli API lub migratora trzeba ponownie uruchomić `setup-database.mjs`, a potem odpowiedni proces.

### Lokalna poczta do odzyskiwania hasła

Po zbudowaniu JAR-a i wykonaniu migracji uruchom Mailpit oraz backend z lokalną konfiguracją SMTP. Jeśli backend już działa, zatrzymaj go przed uruchomieniem tej wersji.

```sh
docker compose --profile mail up --detach mailpit
mise exec -- node scripts/run-backend.mjs --local-mail
```

W drugim terminalu uruchom frontend poleceniem `mise exec -- npm --prefix frontend run dev -- --port 4173 --strictPort`. Linki z wiadomości otworzą ten adres. W koncie testowym użyj adresu z domeną `example.test`. Odebraną wiadomość zobaczysz w [lokalnej skrzynce Mailpit](http://127.0.0.1:8025/). Mailpit zatrzymuje wiadomości na komputerze. Aby zatrzymać skrzynkę, uruchom `docker compose --profile mail stop mailpit`.

Na wdrożeniu skonfiguruj adres HTTPS frontendu w `LMUML_PLAYER_PASSWORD_RESET_PUBLIC_URL`, nadawcę w `LMUML_PLAYER_PASSWORD_RESET_FROM` i parametry SMTP przez standardowe ustawienia `spring.mail`. Włącz funkcję przez `LMUML_PLAYER_PASSWORD_RESET_ENABLED=true` po konfiguracji nadawcy i SMTP.

### Lokalny Redis do Rozgrywek

```sh
docker compose --profile cache up --detach --wait redis
docker compose exec -T redis redis-cli ping
```

Ustaw `LMUML_CATALOG_CACHE_ENABLED=true` w `.env` i uruchom backend z aktualnego JAR-a. Zmienna ustawiona w bieżącej powłoce ma pierwszeństwo przed `.env`. Domyślny adres lokalny to `127.0.0.1:6380`. Port można zmienić jednocześnie dla Compose i lokalnego launchera przez `LMUML_REDIS_PORT`.

Dwa odczyty tego samego sezonu z zaimportowanymi meczami ponownie wykorzystają wersję przez 30 sekund. Zatrzymanie lokalnej usługi przez `docker compose --profile cache stop redis` pozwala sprawdzić odczyt awaryjny z PostgreSQL. [Zasady cache](../decisions/0014-season-catalog-cache.md).

Przy wdrożeniu adres, dane dostępu i pozostałe parametry Redis ustawia się przez `spring.data.redis.*`. Cache można włączyć po uruchomieniu usługi w prywatnej sieci aplikacji. [Ustawienia Spring Boot](https://docs.spring.io/spring-boot/4.1/appendix/application-properties/index.html).

## Budowa i testy backendu

Windows / PowerShell, z katalogu głównego repozytorium:

```powershell
mise exec -- .\backend\mvnw.cmd -f backend/pom.xml verify
```

Linux / macOS:

```sh
mise exec -- sh backend/mvnw -f backend/pom.xml verify
```

`verify` kompiluje kod, buduje wykonywalny JAR i uruchamia testy integracyjne przez Maven Failsafe. `test` nie obejmuje testów `*IT`; samo `package` również ich nie uruchamia. Raporty: `backend/target/failsafe-reports/`.

Testy wymagają działającego Dockera. Testcontainers uruchamia PostgreSQL 18.6 na losowych portach, bez `.env` i bez wolumenu bazy deweloperskiej. Sprawdzamy SQL jako ograniczona rola, HTTP, utratę i odzyskanie połączenia oraz migracje, ograniczenia danych i strefy czasu. Kontenery testowe są sprzątane po testach. Przy pierwszym uruchomieniu Maven i Docker pobierają zależności oraz obrazy.

Testy lokalnych narzędzi:

```sh
mise exec -- node --test 'scripts/*.test.mjs'
```

## Migracje bazy

Po przygotowaniu ról i udanym `verify`:

```sh
mise exec -- node scripts/run-backend.mjs --migrate
```

To osobny proces bez serwera HTTP. Używa roli migracji, wykonuje brakujące pliki z `backend/src/main/resources/db/migration/` i kończy działanie. Historia jest w `lmuml.flyway_schema_history`. Ponowne wykonanie przy aktualnym schemacie nie powiela zmian.

Migracje nie uruchamiają się podczas zwykłego startu API. Backend nie otrzymuje hasła migratora/importera. Przy następnym wydaniu kolejność lokalna to: budowa i testy → migracja → start nowego JAR-a. Profil migracji można uruchomić bez lokalnego skryptu: `java -jar backend/target/lmuml-backend.jar --spring.profiles.active=migration` z trzema `SPRING_DATASOURCE_*` migratora i nazwami ról w `LMUML_RUNTIME_ROLE` oraz `LMUML_IMPORT_ROLE`.

Przed zmianą istniejącej bazy sprawdź adres i kopię odpowiednią do wartości danych. Nie edytuj już wykonanej migracji ani nie usuwaj jej historii, aby ominąć błąd checksum; dodaj kolejną wersję. Domyślnie clean oraz automatyczny baseline są wyłączone. Cofnięcie JAR-a nie cofa migracji.

V1 tworzy demonstracyjne `seasons`, `teams` i `matches`. V2 dodaje `competitions`, identyfikatory API, powiązanie sezonu z rozgrywkami/rokiem oraz osobne wyniki. Zastępuje `status` przez `provider_status`, usuwa demonstracyjny `matchday` i dopuszcza nieznany termin. Przed tym przejściem odmawia wykonania, jeśli którakolwiek z trzech tabel V1 ma rekordy: potrzebny jest wtedy jawny plan mapowania, bez usuwania danych. Nie dotyczy to ponownego uruchomienia już wykonanej V2.

Dane demonstracyjne są tylko w `src/test/resources/db/fixtures/` i nie trafiają do produkcyjnego JAR-a. Nie ma automatycznego seeda lokalnego ani produkcyjnego. Migracje nie importują próbek API, więc wszystkie cztery tabele pozostają puste do etapu importera.

V3 dodaje opcjonalny `logo_url` do `teams` i `competitions`; zachowuje istniejące rekordy i nie pobiera obrazów ani danych API.

V4 dodaje metadane rozgrywek/sezonu/meczu oraz wewnętrzną `api_football_snapshots`. Jeden snapshot oznacza pełną ostatnią poprawną odpowiedź na konkretny zakres zapytania, bez powielania listy meczów w każdym `matches`. Kod magazynu SQL wymaga wspólnej transakcji z importerem; sam nie uruchamia pobierania ani zapisu przy starcie aplikacji. Rola runtime nie ma dostępu do tej tabeli.

V5 dodaje `source_captured_at` do wspólnych rozgrywek/drużyn i nadaje ograniczone prawa zapisu importerowi. Role trzeba przygotować przez `init-env.mjs` i `setup-database.mjs` przed uruchomieniem migracji, również podczas aktualizacji wcześniejszego środowiska.

V6 dodaje `season_standings` z pozycjami drużyn i dopuszcza snapshot `standings`. Rola runtime może odczytywać pozycje tabeli, a zapis odbywa się przez importer.

V7 przygotowuje kolejki typowania, bloki i przypisania meczów. V8 udostępnia runtime zapis w tych trzech tabelach dla operacji panelu administratora. Uprawnienia do katalogu meczów pozostają w rolach odczytu i importu.

Do przeglądania w DBeaver odśwież połączenie administracyjne i otwórz `Schemas → lmuml → Tables`. Zobaczysz cztery tabele katalogu, `season_standings`, `api_football_snapshots` oraz historię `flyway_schema_history`. Po samych migracjach tabele danych są puste. Zmiany rekordów w lokalnej bazie i wersjonowane zmiany struktury przez Flyway to odrębne operacje.

## Synchronizacja sezonu

Po zbudowaniu JAR-a, przygotowaniu ról bazy i wykonaniu migracji można pobrać i zapisać terminarz oraz wyniki sezonu jednym poleceniem. Poniższy przykład używa sezonu Ligi Mistrzów 2024/25.

```sh
mise exec -- node scripts/sync-api-football.mjs --league 2 --season 2024
```

Polecenie korzysta z klucza w lokalnym `.env`. Pobiera metadane rozgrywek i mecze, zapisuje odpowiedzi w osobnym katalogu pod `.local/api-football`, a po udanym pobraniu uruchamia import w drugim procesie. Otwarte Rozgrywki i Ranking reagują na nową wersję wyników z backendu. Przycisk odświeżania działa również przy niedostępnym połączeniu WebSocket. [Kontrakt aktualizacji](season-matches-api.md#aktualizacje-wyników).

Żeby odświeżyć tabelę rozgrywek istniejącego sezonu, dodaj `--standings`. Ten tryb pobiera i importuje samą tabelę.

```sh
mise exec -- node scripts/sync-api-football.mjs --league 2 --season 2024 --standings
```

W razie błędu zapisu użyj katalogu wypisanego przy `Import próbek z` jako argumentu `--directory` w poniższym poleceniu. Przy imporcie tabeli dodaj `--standings`. Wznowienie z plików pomija pobieranie.

### Szczegóły spotkań

Po imporcie terminarza możesz pobrać przebieg, składy oraz statystyki drużyn i zawodników wybranego meczu razem. Skrypt odpyta API-Football raz przez `/fixtures?id=…`. Argument to identyfikator meczu u dostawcy. Przykład dotyczy meczu Barcelona–Bayern z sezonu 2024/25.

```sh
mise exec -- node scripts/sync-api-football.mjs --fixture-details 1299032
```

Możesz podać kilka identyfikatorów, np. obie części dwumeczu Arsenal–PSG. Na planie z dostępem do parametru `ids` skrypt dzieli listę na paczki do 20 meczów. Wysyła jedno żądanie `/fixtures?ids=…` dla każdej paczki, także gdy obejmuje skład, przebieg i oba rodzaje statystyk. Jeśli w ostatniej paczce jest jeden mecz, skrypt używa `/fixtures?id=…`. [Przewodnik API-Football](https://www.api-football.com/news/post/how-to-get-all-data-from-a-league-with-api-football)

```sh
mise exec -- node scripts/sync-api-football.mjs --fixture-details 1371730 1371731
```

Na planie Free dodaj `--sequential` na końcu polecenia, aby pobierać po jednym meczu na żądanie. Skrypt odczekuje 7 sekund między paczkami i kończy pracę przy błędzie albo po informacji od dostawcy o wyczerpaniu limitu. Błąd planu wymaga jawnego wyboru trybu `--sequential`. Zaimportowane paczki pozostają w bazie. Po usunięciu przyczyny błędu możesz podać identyfikatory pozostałych meczów.

Każda paczka dostaje osobny katalog z odpowiedzią `details.json` i metadanymi `details.metadata.json`. Sam import można ponowić z katalogu wypisanego przy `Import próbek z`, bez kolejnego zapytania do dostawcy. To samo polecenie odczytuje wcześniejsze próbki pojedynczych meczów.

```sh
mise exec -- node scripts/import-api-football.mjs --directory .local/api-football/katalog-probki --fixture-details
```

Importer sprawdza zgodność otrzymanych identyfikatorów i uczestników z katalogiem. Każda paczka jest zapisywana w jednej transakcji. Pusta lub nieobecna sekcja pozostawia wcześniej zapisane szczegóły. Błąd walidacji lub zapisu wycofuje całą paczkę. Wynik i terminarz aktualizuje osobna synchronizacja sezonu.

### Statystyki pojedynczego spotkania

Po migracji V16 można wykonać jedno zapytanie o mecz, który już jest w katalogu. Przykład dotyczy finału PSG–Inter z sezonu 2024/25. Argument jest identyfikatorem meczu z API-Football.

```sh
mise exec -- node scripts/sync-api-football.mjs --fixture-statistics 1374812
```

Pobranie zapisuje `statistics.json` i `statistics.metadata.json` w tym samym katalogu próbki. Żeby ponowić sam zapis do PostgreSQL, użyj wskazanego katalogu oraz flagi `--fixture-statistics`.

```sh
mise exec -- node scripts/import-api-football.mjs --directory .local/api-football/katalog-probki --fixture-statistics
```

Importer dopasowuje dane do obu drużyn z katalogu. Pusta, niepełna lub starsza odpowiedź nie zastępuje poprawnej pary. Karta meczu odczytuje statystyki z LMuML. Można je zaimportować ręcznie lub włączyć automatyczny import pakietu szczegółów po meczu.

### Zdarzenia pojedynczego spotkania

Po imporcie terminarza można pobrać przebieg jednego meczu. Argumentem jest identyfikator spotkania z API-Football. Polecenie wykonuje jedno żądanie z tego endpointu i zapisuje odpowiedź oraz czas pobrania jako `events.json` i `events.metadata.json`.

```sh
mise exec -- node scripts/sync-api-football.mjs --fixture-events 1374812
```

Ponowny import z katalogu próbki korzysta wyłącznie z PostgreSQL i zapisanych plików.

```sh
mise exec -- node scripts/import-api-football.mjs --directory .local/api-football/katalog-probki --fixture-events
```

Import zastępuje oś w jednej transakcji. Zmianę uczestników wykrywa na podstawie aktualnej pary drużyn w katalogu. Zapisana pusta lista oznacza, że dostawca zwrócił poprawną odpowiedź bez zdarzeń. Szczegóły meczu odczytują zdarzenia z naszej bazy.

### Składy pojedynczego spotkania

Po imporcie terminarza pobierz składy dla wskazanego identyfikatora API-Football. Polecenie pobiera `lineups.json`, zapisuje metadane w `lineups.metadata.json` i importuje składy obu drużyn do PostgreSQL.

```sh
mise exec -- node scripts/sync-api-football.mjs --fixture-lineups 1374812
```

Sam import można ponowić lokalnie, wskazując utworzony katalog próbki.

```sh
mise exec -- node scripts/import-api-football.mjs --directory .local/api-football/katalog-probki --fixture-lineups
```

Import wymaga danych obu drużyn i co najmniej jednego zawodnika pierwszego składu z każdej strony. Niekompletna odpowiedź nie zastępuje poprzedniej próbki. Składy odświeża się ręcznie, również przed meczem, gdy dostawca już je opublikuje.

Po migracji V21 przy starszych składach i przebiegu można uzupełnić identyfikatory zawodników przez ponowny import zapisanych próbek `--fixture-lineups` i `--fixture-events`. Zachowany czas pobrania wystarcza, jeśli pozostałe wartości są zgodne z aktualnym zapisem. Dzięki temu oceny, gole, asysty i minuty zmian są widoczne przy właściwych zawodnikach. Do ocen potrzebna jest również próbka `--fixture-players`.

### Statystyki zawodników pojedynczego spotkania

Po imporcie terminarza pobierz statystyki zawodników dla wskazanego identyfikatora meczu z API-Football. Synchronizacja zapisuje odpowiedź w `players.json`, czas pobrania w `players.metadata.json` i importuje dane do PostgreSQL.

```sh
mise exec -- node scripts/sync-api-football.mjs --fixture-players 1374812
```

Przy ponownym imporcie wczytaj zapisane pliki. Ten tryb nie pobiera nowej próbki.

```sh
mise exec -- node scripts/import-api-football.mjs --directory .local/api-football/katalog-probki --fixture-players
```

Import wymaga danych obu drużyn. Zapisuje obie strony w jednej transakcji, zachowuje kolejność zawodników i chroni przed zastąpieniem nowszej próbki starszą. Harmonogram wyników pozostaje niezależny od ręcznej synchronizacji statystyk zawodników.

### Synchronizacja w dni meczowe

Tryb `--matchday` wykonuje jedno sprawdzenie. Można wywoływać je co 15 minut z harmonogramu na tym samym hoście, z którego dostępny jest backend pod `127.0.0.1:8080`. Sezon musi już istnieć w katalogu.

```sh
mise exec -- node scripts/sync-api-football.mjs --league 2 --season 2024 --matchday
```

Podstaw identyfikator ligi i rok początku aktywnego sezonu. Tryb odczytuje terminy z aplikacji i uruchamia zwykłą synchronizację, gdy co najmniej jeden mecz mieści się w oknie od 15 minut przed rozpoczęciem do 3 godzin po rozpoczęciu. Zakończone spotkania wciąż mieszczą się w oknie, dzięki czemu kolejna próba może przyjąć korektę wyniku. Poza oknem terminarz oraz tabelę można odświeżyć ręcznie.

Zadanie rezerwuje najwyżej jedną próbę w kwadransie i maksymalnie 32 próby na dobę UTC we wspólnym katalogu `.local/api-football/matchday`. Wiele meczów w oknie oznacza jedną próbę. Każda uruchamia najwyżej dwa żądania do dostawcy, więc budżet prób to 64 żądania, z zapasem względem 100 dziennie w planie Free. Nieudana próba również zużywa rezerwację. Ręczne synchronizacje i inne użycia tego samego klucza korzystają z pozostałego limitu dostawcy. [Limity API-Football](https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage), [reset limitu na koncie bezpośrednim](https://www.api-football.com/terms).

### Cykliczne uruchamianie

Uruchom `--watch`, żeby synchronizacja korzystała z aktywnego sezonu ustawionego w panelu administratora.

```sh
mise exec -- node scripts/sync-api-football.mjs --watch
```

Proces odczytuje wybór z lokalnego backendu przed każdym sprawdzeniem. Zmiana w panelu obowiązuje od następnego cyklu. Przy braku wyboru proces czeka na ustawienie sezonu. Wybierz sezon zaimportowany z API-Football, o kodzie `api-football-<liga>-<rok>`.

Podanie ligi i sezonu przypina proces do tego zakresu. Przykład z archiwum 2024/25 pozwala sprawdzić działanie bez pobierania wyników dostawcy.

```sh
mise exec -- node scripts/sync-api-football.mjs --league 2 --season 2024 --watch
```

Proces sprawdza terminarz przy starcie, a potem na kolejnych kwadransach UTC. Sprawdzenia wykonuje kolejno i po błędzie czeka na następny kwadrans. Jedna próba ma trzy minuty na ukończenie. `Ctrl+C` zatrzymuje czekanie lub przerywa trwającą próbę.

Po próbie automatycznego pobrania tryby `--watch` i `--matchday` zapisują wynik dla tego sezonu w PostgreSQL jako rola importera. Odczyt stanu nie wykonuje żądania do dostawcy. Jeśli zapis stanu się nie uda, proces wypisze osobny komunikat. Stan w panelu zmieni się po kolejnym udanym zapisie.

Uruchom jeden proces dla aktywnego sezonu na hoście, który ma dostęp do backendu na `127.0.0.1:8080` oraz do lokalnej bazy. Zachowaj `.local/api-football/matchday` przy restarcie, żeby utrzymać rezerwacje limitu. Proces można podpiąć do menedżera usług wybranego hosta, żeby wznowił pracę po restarcie.

Próbki z `--watch` trafiają do `.local/api-football/automatic`. Przy starcie i przy pierwszym sprawdzeniu nowej doby UTC usuwane są katalogi uruchomień po siedmiu dniach od ostatniej modyfikacji ich zawartości. Próbki z błędem zapisu są dostępne przez ten sam okres. Jeśli potrzebujesz ich dłużej, przenieś je poza `automatic`. Próbki ręczne i rezerwacje limitu mają osobne katalogi.

### Automatyczne szczegóły zakończonych meczów

Na planie z dostępem do `ids` dopisz `--with-details` do polecenia dla aktywnego sezonu. `--watch` sprawdza cyklicznie, a `--matchday` wykonuje jedno sprawdzenie.

```sh
mise exec -- node scripts/sync-api-football.mjs --watch --with-details
mise exec -- node scripts/sync-api-football.mjs --matchday --with-details
```

Po zapisaniu terminarza worker wybiera zakończone mecze, które rozpoczęły się w ostatnich 24 godzinach i mają braki w przebiegu, składach albo statystykach. Sekcje oznaczone przez dostawcę jako niedostępne dla sezonu pomija. W jednym cyklu pobiera najwyżej jedną paczkę do 20 meczów. PostgreSQL zachowuje liczbę prób po restarcie. Brakujące dane mogą trafić do jednej ponownej próby po co najmniej godzinie, w kolejnym cyklu spełniającym warunki okna meczowego. Starsze mecze można uzupełnić przez ręczny `--fixture-details`. [Przewodnik API-Football](https://www.api-football.com/news/post/how-to-get-all-data-from-a-league-with-api-football)

Opcja dodaje najwyżej jedno żądanie do limitu cyklu, czyli do 96 żądań na 32 zarezerwowane cykle w dobie UTC. Jeżeli odpowiedź terminarza zgłosi zero żądań pozostałych w puli minutowej lub dziennej, szczegóły zostaną pominięte. Błąd szczegółów jest logowany osobno. Terminarz, ranking i status synchronizacji wyników są już wówczas zapisane. Pakiety z `--watch` korzystają z tej samej retencji co terminarz.

## Import zapisanych próbek

Po `verify`, przygotowaniu ról i migracji wskaż katalog utworzony przez probe:

```sh
mise exec -- node scripts/import-api-football.mjs --directory .local/api-football/sample-2375181883551177067
```

Powyższa nazwa jest przykładem istniejącej lokalnej próbki; świeży checkout wymaga własnego katalogu z czterema plikami: `leagues.json`, `fixtures.json`, `leagues.metadata.json`, `fixtures.metadata.json`. Importer nie potrzebuje klucza API. Zachowuje czas pobrania z metadanych i nie wysyła żądań HTTP.

Profil `api-football-import` używa `LMUML_IMPORT_DB_USER/PASSWORD`, jednego połączenia transakcyjnego do zapisu katalogu/snapshotów i nie uruchamia HTTP ani Flyway. Ponowienie tej samej komendy nie tworzy duplikatów i nie zmienia UUID. Starsza próbka lub konflikt sezonu meczu wycofują całą transakcję. Brakujące mecze nie są usuwane.

Komunikat podaje liczbę przetworzonych elementów wejściowych, nie liczbę nowo dodanych rekordów. Lokalny import próbki Ligi Mistrzów 2024/25 dał 1 rozgrywkę, 1 sezon, 81 drużyn, 279 meczów i 2 snapshoty. Powtórka zachowała wszystkie wartości. Metadane API są aktualizowane przez importer, więc ręczne poprawki tych samych pól mogą zostać nadpisane przy kolejnym imporcie.

Przepływ do przeglądu: `ApiFootballSampleReader → ApiFootballImportMapper → ApiFootballCatalogImporter → SnapshotStore + CatalogWriter`. Sprawdzenie danych następuje przed transakcją; źródłowe snapshoty i upserty są zatwierdzane wspólnie. Szczegóły: [ADR 0010](../decisions/0010-offline-catalog-import.md).

### Tabela rozgrywek

Po V6 i imporcie katalogu wskaż katalog z `standings.json` i `standings.metadata.json`, utworzony przez tryb `--standings` opisany niżej. Podstaw nazwę swojego katalogu w poleceniu.

```sh
mise exec -- node scripts/import-api-football.mjs --directory .local/api-football/sample-tabela --standings
```

`ApiFootballStandingsImporter` obsługuje jedną niepustą grupę tabeli. Łączy identyfikatory drużyn z katalogiem danego sezonu oraz zapisuje pozycję, bilans, punkty i formę. Pełny JSON i wiersze tabeli zapisuje w tej samej transakcji. Import działa offline i odrzuca starsze, sprzeczne oraz krótsze próbki.

## Uruchomienie backendu

Po przygotowaniu bazy, udanym `verify` i wykonaniu migracji:

```sh
mise exec -- node scripts/run-backend.mjs
```

Skrypt uruchamia `backend/target/lmuml-backend.jar` przez lokalną Javę wybraną w mise. Wczytuje lokalną konfigurację i przekazuje Javie dane roli API jako standardowe zmienne Spring; nie przekazuje jej haseł administratora ani migratora z `.env`. Ustawia schemat `lmuml` i wymusza zwykły tryb bez migracji. Nie buduje kodu automatycznie. Zatrzymanie: `Ctrl+C`.

| Adres lokalny | Oczekiwana odpowiedź przy działającej bazie |
| --- | --- |
| [Liveness](http://127.0.0.1:8080/actuator/health/liveness) | `200` i `{"status":"UP"}` |
| [Readiness](http://127.0.0.1:8080/actuator/health/readiness) | `200` i `{"status":"UP"}` |
| [Łączny stan](http://127.0.0.1:8080/actuator/health) | `200`, status `UP` |

Przy awarii bazy readiness i łączny stan zwracają `503 / DOWN`, a liveness pozostaje `200 / UP`. Pula połączeń może odzyskać gotowość bez restartowania Javy. Readiness sygnalizuje problem — nie zastępuje obsługi błędów w przyszłych endpointach biznesowych.

## Klient API-Football

Integracja HTTP jest domyślnie wyłączona. Klient Java udostępnia `leagues(leagueId, season)`, `fixtures(leagueId, season)` i `standings(leagueId, season)`. Próbki pobiera osobna komenda, a ich importer działa bez sieci. Frontend pobiera dane katalogu i tabeli z naszego backendu. [Kontrakt API sezonu](season-matches-api.md)

Opcjonalne pola dodaj w lokalnym `.env`, poza Gitem:

```dotenv
LMUML_API_FOOTBALL_ENABLED=false
LMUML_API_FOOTBALL_API_KEY=
```

Po dodaniu prawdziwego klucza lokalnie można ustawić `true`. Nie wpisuj klucza do kodu, parametrów komendy ani czatu. Launcher przekazuje go wyłącznie włączonej aplikacji; migrator dostaje integrację wyłączoną. Sam generator haseł bazy nie tworzy klucza dostawcy. Poza lokalnym launcherem te same dwie zmienne należy ustawić w środowisku procesu.

Przepływ: przyszły przypadek użycia → `ApiFootballClient` → HTTP dostawcy → sprawdzenie statusu i koperty → typowane elementy, paginacja i quota. Odpowiedź błędna nie zamienia się w pustą listę.

- Stały adres HTTPS; klucz tylko w `x-apisports-key`; przekierowania wyłączone.
- Timeout połączenia 3 s i odpowiedzi 10 s, limit treści 4 MiB.
- Brak ponowień, harmonogramu, automatycznego pobierania kolejnych stron i zapisu do bazy.
- `ApiFootballException` rozróżnia błąd HTTP, błąd koperty API, niepoprawną odpowiedź i błąd transportu. Nie zawiera surowej treści ani pierwotnego wyjątku.
- Metadane dziennego i minutowego limitu są dostępne dla przyszłego importera; obecny klient nie jest jeszcze mechanizmem rezerwacji budżetu ani rate limiterem. Brak/uszkodzenie nagłówka daje `null`, nie znosi limitu dostawcy.

Testy klienta uruchamiają lokalny serwer HTTP, bez klucza i puli API-Football. Sprawdzają także 200 z błędem API, 429, niepoprawny JSON, wielkość odpowiedzi, timeout nagłówków/treści oraz brak przekierowań. Dotychczasowe testy PostgreSQL nadal są częścią `verify`.

Spring zaleca `RestClient` dla imperatywnej aplikacji; starter zapewnia skonfigurowany `RestClient.Builder`. [Dokumentacja Spring Boot](https://docs.spring.io/spring-boot/reference/io/rest-client.html), [nagłówki limitów API-Football](https://www.api-football.com/news/post/how-ratelimit-works).

### Jednorazowe pobranie próbek

Po `Maven verify` ustaw prawdziwy `LMUML_API_FOOTBALL_API_KEY` w lokalnym `.env`. Flaga `LMUML_API_FOOTBALL_ENABLED` może pozostać `false`: jawna komenda włącza integrację tylko dla własnego procesu.

```sh
mise exec -- node scripts/probe-api-football.mjs --league 2 --season 2024
```

ID `2` oznacza Ligę Mistrzów w API v3; parametr sezonu `2024` wskazuje sezon rozpoczynający się w 2024 r. [Oficjalny opis identyfikatorów](https://www.api-football.com/news/post/how-to-find-ids). Ten konkretny zestaw był dostępny na koncie Free 2 listopada 2026 r.; dostęp do innych sezonów nie został sprawdzony.

Komenda uruchamia ten sam JAR z profilem `api-football-probe`, bez datasource, Flyway i serwera HTTP. Nie wymaga działającego PostgreSQL ani jego haseł. Nie zmienia `.env` i nie otrzymuje sekretów ról bazy z launchera.

Przebieg: utworzenie nowego katalogu → jedno `leagues` → zapis oryginału i sprawdzenie DTO/ligi/sezonu/limitu → 7 sekund przerwy → jedno `fixtures` → zapis oryginału i sprawdzenie DTO/zakresu/paginacji. Nie ma ponowień, szukania innych sezonów ani pobierania dalszych stron. Każde ponowne uruchomienie komendy może zużyć następne dwa żądania.

Wynik trafia do nowego `.local/api-football/sample-*/`, poza Gitem również w świeżym klonie:

- `leagues.json`, `fixtures.json` — oryginalne bajty odpowiedzi z poprawną kopertą, z zachowaniem nieopisanych pól;
- `*.metadata.json` — czas zapisu, parametry, paginacja i limity raportowane przez dostawcę;
- `summary.json` — liczba elementów po udanej konwersji obu próbek.

Oryginał zapisuje się przed konwersją DTO, więc pozostaje do diagnozy po jej niepowodzeniu. Niepoprawny HTTP/JSON/koperta nie są zapisywane jako udana próbka. Błąd daje niezerowy kod wyjścia i może pozostawić częściowy katalog bez `summary.json`; nie uruchamiaj automatycznej pętli ponowień. Poprzednie próbki nie są nadpisywane.

Konwersja DTO i zgodność ligi/sezonu nie potwierdzają pełnej poprawności biznesowej ani dostępności wszystkich funkcji. [Wnioski z pierwszej rzeczywistej próbki](../research/2026-10-31-api-football.md#pierwsza-próbka-z-konta-free--2-listopada-2026-r).

Osobna komenda pobiera wyłącznie tabelę. Wykonuje jedno żądanie i zapisuje `standings.json` oraz `standings.metadata.json` w nowym katalogu próbki. Dostawca zwraca listę grup tabel, a obecny importer zapisuje pojedynczą grupę. [Referencja API-Football](https://www.api-football.com/documentation_v3#tag/Standings)

```sh
mise exec -- node scripts/probe-api-football.mjs --league 2 --season 2024 --standings
```

## Nawigacja po kodzie

- `backend/pom.xml` — zależności, wersja Java, pakowanie i faza testów.
- `backend/src/main/java/pl/lmuml/LmumlApplication.java` — wejście do aplikacji i konfiguracja automatyczna Springa.
- `backend/src/main/resources/application.yaml` — pula połączeń, lokalny serwer i polityka health.
- `backend/src/main/resources/application-migration.yaml` — jednorazowy tryb Flyway bez HTTP.
- `backend/src/main/resources/db/migration/` — wersjonowane zmiany struktury i uprawnień do tabel.
- `backend/src/test/java/pl/lmuml/ApplicationHealthIT.java` — test całej ścieżki HTTP → Spring → PostgreSQL.
- `backend/src/test/java/pl/lmuml/DatabaseMigrationsIT.java` — migracje od pustej bazy, ograniczenia i rozdział uprawnień.
- `scripts/setup-database.mjs` — przygotowanie lokalnych ról i schematu, poza runtime aplikacji.
- `scripts/run-backend.mjs` — lokalne uruchomienie już zbudowanego JAR-a lub jawna migracja.
- `backend/src/main/java/pl/lmuml/football/apifootball/` — klient HTTP, kontrakty, odczyt próbek, walidacja/mapowanie i transakcyjny importer katalogu.
- `backend/src/main/java/pl/lmuml/football/apifootball/ApiFootballSnapshot.java` — kompletna poprawna koperta i zakres wspieranego zapytania.
- `backend/src/main/java/pl/lmuml/football/apifootball/ApiFootballSnapshotStore.java` — zapis ostatniej odpowiedzi JSONB w transakcji wywołującego, bez samodzielnego uruchamiania.
- `scripts/probe-api-football.mjs` — jawne pobranie próbek, bez przekazywania danych bazy.
- `scripts/sync-api-football.mjs` — pobranie i import danych wskazanego sezonu w osobnych procesach.
- `backend/src/main/resources/application-api-football-probe.yaml` — jednorazowy tryb diagnostyki dostawcy, bez HTTP i datasource.

Katalog ma importer próbek i endpoint meczów sezonu. Nie ma jeszcze tabel graczy, typów ani rozliczania punktów. Wyniki źródłowe są przechowywane przy meczach.

## Pierwszy odczyt meczów

Po budowie i uruchomieniu backendu otwórz [listę sezonu 2024](http://127.0.0.1:8080/api/v1/seasons/api-football-2-2024/matches), jeśli ten sezon został wcześniej zaimportowany. Otrzymasz JSON z 279 historycznymi meczami, drużynami i logo, terminami, statusami oraz oddzielnymi wynikami. Odczyt nie zużywa zapytań API-Football i nie zapisuje danych.

[Kontrakt](season-matches-api.md) opisuje pola, sortowanie i odpowiedzi 400/404/503/500. Kod znajduje się w `football/matches/`: kontroler → zapytanie JdbcClient → model odpowiedzi. Test `SeasonMatchesIT` przechodzi przez rzeczywisty HTTP i PostgreSQL jako ograniczona rola runtime. Pierwszy odczyt nie wymaga nowej migracji po V5.

## Panel administratora

Po budowie backendu i wykonaniu migracji można utworzyć lokalne hasło:

```powershell
mise exec -- node scripts/local-admin.mjs
mise exec -- node scripts/run-backend.mjs
```

W otwartym frontendzie przejdź do `/admin/`. Login to `admin`, a hasło jest w ignorowanym przez Git pliku `.local/admin-password.txt`. Skrypt tworzy ten plik tylko raz. Launcher przekazuje Springowi skrót PBKDF2. Po publikacji lub odrzuceniu szkicu panel odświeża bloki. Konflikt oznacza, że przed zapisem trzeba ponownie sprawdzić wybór.

Aby ustawić domyślny sezon dla graczy, wybierz istniejący sezon z listy, użyj przycisku ustawienia aktywnego sezonu i potwierdź. Wybór zapisuje się w PostgreSQL. Odczytują go gracze przy otwarciu aplikacji i proces `--watch` uruchomiony bez wskazania ligi i sezonu.

Sekcja „Synchronizacja wyników” pokazuje dla wybranego sezonu czas pobrania najnowszej zapisanej próbki terminarza i wynik ostatniej zakończonej próby automatycznej. Próbka może pochodzić także z ręcznego importu. Poza oknem meczowym, przy zajętym kwadransie lub wyczerpaniu limitu lokalnych prób proces pomija pobranie. Panel udostępnia niezależne odświeżenie statusu.

Przy uruchamianiu wdrożonej aplikacji konfiguracja używa sekretu `LMUML_ADMIN_PASSWORD_HASH` w formacie PBKDF2 Spring Security v5.8. Panel i API powinny działać pod tym samym adresem HTTPS, z `SERVER_SERVLET_SESSION_COOKIE_SECURE=true`. Bez skonfigurowanego hasha przestrzeń `/api/admin/` zwraca 404. [Format skrótu Spring Security](https://docs.spring.io/spring-security/site/docs/current/api/org/springframework/security/crypto/password/Pbkdf2PasswordEncoder.html)

## Szybka diagnoza

Z katalogu projektu:

```sh
mise exec -- node scripts/doctor.mjs
```

Wersja z wynikiem JSON:

```sh
mise exec -- node scripts/doctor.mjs --json
```

Skrypt sprawdza aktualnie uruchomiony Node.js, Git, Java runtime, kompilator Java, Docker CLI, Compose i odpowiedź Docker Engine. Nie instaluje programów, nie uruchamia usług, nie pobiera obrazów, nie odczytuje plików .env lub plików sekretów i nie zmienia konfiguracji. Narzędzia korzystają z własnej konfiguracji; raport wypisuje rozpoznaną wersję zamiast dowolnych komunikatów launchera. Każde polecenie ma limit 5 sekund.

| Wynik | Znaczenie |
| --- | --- |
| `available` / OK | Polecenie odpowiedziało; zgodność wersji trzeba ocenić osobno |
| `missing` / BRAK | Polecenia nie znaleziono w PATH; nie przesądza to o braku instalacji na dysku |
| `unavailable` / NIEDOSTĘPNE | Polecenie nie odpowiedziało albo zakończyło się błędem |

Kod wyjścia: `0` — wszystkie sprawdzane narzędzia odpowiedziały; `1` — co najmniej jedno jest niedostępne; `2` — nieprawidłowe argumenty. Pomoc jest dostępna przez `--help`. Nie jest to kontrola gotowości produkcyjnej.

## Kolejność przygotowania

1. Przejrzeć działający odczyt sezonu: HTTP → kontroler → JdbcClient/SQL → własny model odpowiedzi. Importer i endpoint już korzystają z katalogu; własne kolejki pozostają osobnym mechanizmem.
2. Uruchomić [frontend](frontend.md) z jego plikiem blokady i sprawdzić pierwszy widok z [planu implementacji](../planning/first-slice.md). Frontend jest już zaimplementowany; zgodnie z aktualną kolejnością można wrócić do przeglądu backendu po ocenie ekranu.
3. Przed zapisem typów ustalić przełożenia, ujawnianie i egzekwowanie terminu. Wynik 90 minut z doliczonym czasem oraz indywidualny termin backendu są przyjęte w ADR 0007.

Globalny Maven nie jest wymagany. Mise wybiera JDK i Node, a wrapper przypina Maven. Samo znalezienie narzędzia przez diagnozę nie potwierdza zgodności przyszłych bibliotek ani gotowości produkcyjnej.

## Spójne pliki

Plik `.editorconfig` ustala UTF-8, końcową nową linię i spacje. Java używa czterech spacji, pozostałe pliki domyślnie dwóch. Domyślne zakończenia to LF; skrypty Windows `.cmd` mają CRLF, również w `.gitattributes`. Nie definiuje to jeszcze formattera ani reguł lintowania aplikacji.

## Źródła poleceń

- [Node.js: statusy wydań i wsparcie LTS](https://nodejs.org/en/about/previous-releases).
- [Docker Engine: odczyt informacji i format wyniku](https://docs.docker.com/reference/cli/docker/system/info/).
- [Docker Compose: odczyt wersji](https://docs.docker.com/reference/cli/docker/compose/version/).
