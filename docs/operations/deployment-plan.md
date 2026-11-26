# Plan wdrożenia i utrzymania

Stan: 29 października 2026 r., aktualizacja 31 października. **Propozycja do wspólnego wyboru, nie działająca infrastruktura.** Wybrano już [Flyway i osobny proces migracji](../decisions/0004-database-migrations.md). Hosting, domena, uwierzytelnianie, zadania i komunikacja na żywo nadal wymagają ustaleń. Dokument nie uruchamia zakupu ani wdrożenia.

## Granice

Potwierdzony kierunek to React/TypeScript, Java/Spring Boot, PostgreSQL i modularny monolit. Redis ma otrzymać rzeczywistą funkcję produkcyjną. Cel kosztowy: około 150 zł, maksymalnie 200 zł miesięcznie, bez statusu studenta i czasowych kredytów. Skala około 50 graczy nie zastępuje pomiaru obciążenia podczas meczu.

Stary projekt pozostaje dostępny i niezmieniony. Nowa aplikacja powstaje osobno; przeniesienie kont i historii wymaga odrębnego ustalenia. Nie zakładamy równoległego, niezależnego zapisu do obu systemów.

## Proponowana topologia

| Element | Rola i granica |
| --- | --- |
| Jeden VPS Linux, Docker Compose | Jeden host aplikacji i danych; prosty koszt i obsługa, lecz wspólny punkt awarii |
| Reverse proxy i statyczny frontend | Serwowanie plików Vite i przekazywanie żądań API; Caddy jest kandydatem, Nginx alternatywą |
| Jeden backend Spring Boot | API, logika oraz później uzgodnione zadania i aktualizacje na żywo |
| PostgreSQL w trwałym wolumenie | Autorytatywne typy, wyniki i rozliczenia; bez publicznego portu bazy |
| Redis w sieci wewnętrznej | Odbudowywalny cache katalogu Rozgrywek, działający lokalnie. [ADR 0014](../decisions/0014-season-catalog-cache.md) |
| Zaszyfrowane kopie poza VPS | Odtworzenie po utracie całego hosta; osobny dostawca lub niezależne miejsce przechowywania |

Proponujemy jedną domenę i trasę API pod tym samym originem. Proxy musi przekazać WebSocket na `/api/v1/season-updates` do Spring Boot. Jeśli proxy kończy TLS, Spring potrzebuje publicznego hosta i schematu HTTPS do sprawdzenia originu. Przekazywane nagłówki powinny pochodzić z proxy, które nadpisuje wartości przesłane przez klienta i jest jedyną publiczną drogą do backendu. Podczas próbnego wdrożenia sprawdzimy ustanowienie połączenia `wss:`, ping/pong i ponowne połączenie. Produkcja korzysta z gotowych obrazów. [ADR 0013](../decisions/0013-season-result-websocket.md), [Compose na jednym serwerze](https://docs.docker.com/compose/how-tos/production/).

Caddy potrafi uzyskiwać i odnawiać certyfikaty. Dla proponowanego wdrożenia przygotowujemy poprawny DNS, osiągalne porty 80/443 oraz trwały, zapisywalny katalog danych. Szczegóły wymagań zależą od wybranego sposobu walidacji certyfikatu. Sama instalacja kontenera nie potwierdza poprawnego HTTPS. [Automatic HTTPS](https://caddyserver.com/docs/automatic-https).

Nie obiecujemy wysokiej dostępności ani wdrożeń bez przerwy na jednym VPS. Krótkie okno obsługowe poza terminami typowania jest rozsądnym wariantem startowym. Wielkość maszyny, limity JVM, pula połączeń i zapas dysku wynikną z pomiarów, nie z samej liczby kont.

## Rozdzielenie build, release i deploy

| Krok | Wynik | Dostęp do produkcji |
| --- | --- | --- |
| CI dla zmiany | Sprawdzenie dokumentacji; wraz z kodem format/lint, testy, kompilacja i potrzebne integracje | Bez sekretów produkcyjnych |
| Build wydania | Obrazy backendu i frontendu z jednego sprawdzonego commita; identyfikator wersji oraz digest | Prawo zapisu wyłącznie do wybranego rejestru obrazów |
| Release | Manifest pary obrazów i wersji migracji, opis zmiany i dostępny poprzedni manifest | Samo wydanie nie przełącza użytkowników |
| Deploy | Ręcznie uruchamiane wdrożenie konkretnego manifestu, kontrola stanu, test podstawowej ścieżki | Dedykowany dostęp wdrożeniowy z ustalonym zakresem |

Pierwszy workflow CI obejmuje testy i budowę obrazów oraz sprawdzenie [próby HTTPS](rehearsal.md#github-actions-verification) na runnerze. Obrazy w tym zadaniu służą do sprawdzenia działania stosu. Manifest wydania i rejestr obrazów to osobny etap.

Obraz budujemy raz i wdrażamy ten sam digest; nie kompilujemy ponownie na VPS. Wydania nie opierają się wyłącznie na zmiennym tagu `latest`. Akcje zewnętrzne przypinamy do sprawdzonych SHA, uprawnienia workflow ograniczamy do jego zadania. [Publikowanie obrazów w GitHub Actions](https://docs.github.com/en/actions/tutorials/publish-packages/publish-docker-images).

Sekrety wdrożenia nie trafiają do zadań sprawdzających kod z nieufnej zmiany. Dostęp do hosta nie powinien wymagać używania osobistego klucza administratora. Sposób dostępu do Dockera trzeba świadomie ograniczyć, ponieważ możliwość sterowania daemonem ma szerokie uprawnienia.

Repozytorium jest prywatne. Nie opieramy planu na darmowej dostępności GitHub Environments i wymaganych reviewerów: zakres zależy od planu i widoczności repo. Na start można zachować ręczny deploy bez kupowania planu wyłącznie dla bramki. Należy także sprawdzić limity Actions, rejestru i retencji artefaktów. [Dostępność funkcji środowisk](https://docs.github.com/en/actions/how-tos/deploy/configure-and-manage-deployments/manage-environments).

## Konfiguracja i sekrety

| Wartość | Miejsce |
| --- | --- |
| Publiczny adres aplikacji, publiczna konfiguracja klienta | Jawna konfiguracja frontendu; nie traktujemy jej jako sekretu |
| Klucz dostawcy wyników, hasło bazy, ewentualne dane administracyjne Auth | Wyłącznie backend/host, poza repo, obrazem i frontendem |
| Dostęp do rejestru i wdrożenia | Ograniczone sekrety odpowiedniego zadania CI/CD; bez drukowania w logach |
| Hasło szyfrowania kopii i instrukcja odzyskania | Oddzielone od samych kopii; odzyskiwalne po utracie VPS |

`VITE_*` trafia do kodu przeglądarki w czasie budowania. Klucz API wyników musi zostać na serwerze, niezależnie od prywatności repo. [Zmienne Vite](https://vite.dev/guide/env-and-mode).

Compose może udostępnić sekret jako plik tylko wskazanym usługom. Na pojedynczym hoście jest to montowany plik, a nie automatyczny szyfrowany sejf: potrzebne są uprawnienia, ochrona hosta i procedura rotacji. Konwencja `_FILE` nie działa automatycznie w każdej aplikacji. W repo umieszczamy tylko przykłady nazw i opisy. [Sekrety Compose](https://docs.docker.com/compose/how-tos/use-secrets/), [sekrety Actions](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets).

## Gotowość i diagnostyka

- Rozróżniamy działanie procesu, gotowość przyjmowania żądań i poprawność głównej ścieżki produktu.
- Healthcheck PostgreSQL oraz zależność `service_healthy` ograniczają wyścig startu. Samo `depends_on` nie oznacza gotowości ani ciągłego naprawiania zależności. [Kolejność startu Compose](https://docs.docker.com/compose/how-tos/startup-order/).
- Lokalny backend korzysta już z Actuatora: readiness obejmuje bazę, liveness wyłącznie stan aplikacji. Wskaźniki kolejnych zależności włączamy świadomie: awaria dostawcy wyników nie powinna wywoływać pętli restartów zdrowego procesu. Redis używany jako cache nie może decydować o poprawności zapisanych typów.
- Udostępniamy tylko potrzebny zakres diagnostyki, bez publicznego `env`, konfiguracji, dumpów pamięci i danych graczy. Oddzielny port zarządzania nie dowodzi, że główny port działa. [Health i probes Spring Boot](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html).
- Minimum operacyjne: rotacja logów, wolne miejsce na dysku, restarty, błędy API, wiek ostatniego importu, wiek poprawnej kopii poza hostem oraz kontrola dostępności spoza VPS.

## Migracje i wycofanie wydania

Wybrano Flyway i migracje SQL, uruchamiane osobno z ograniczoną rolą właściciela schematu. Każda migracja ma przejść uruchomienie od pustej bazy oraz aktualizację z poprzedniej wersji na danych demonstracyjnych. Pierwszy etap sprawdza V1 i jej ponowne wykonanie; nie jest to jeszcze test aktualizacji V1 → V2.

Proponowany model to **expand → migrate → contract**: najpierw zgodne wstecz dodatki, później migracja danych i przełączenie kodu, na końcu usuwanie starych pól po zakończeniu okresu powrotu. Nie łączymy w jednym nieodwracalnym kroku zmiany nazwy/usunięcia kolumny z wymianą kodu.

Rollback obrazu przywraca kod, **nie cofa bazy ani zapisów graczy**. Musi być wykazane, że poprzednia aplikacja rozumie aktualny schemat. W innym przypadku potrzebna jest poprawka do przodu lub kontrolowane odtworzenie; to drugie może utracić późniejsze zapisy i wymaga osobnej decyzji operacyjnej.

Kopia przed wdrożeniem jest zabezpieczeniem, nie domyślną metodą cofania każdej nieudanej aktualizacji.

## Kopie i odtwarzanie

| Zakres | Propozycja do uzgodnienia i sprawdzenia |
| --- | --- |
| Dane PostgreSQL | Automatyczny `pg_dump` w formacie obsługiwanym przez `pg_restore`, potwierdzony kodem zakończenia i kontrolą odczytu |
| Role i uruchomienie | Odtwarzalna konfiguracja ról/uprawnień oraz zabezpieczona konfiguracja usług; dump pojedynczej bazy nie zawiera wszystkich ról klastra |
| Kopia poza hostem | Szyfrowanie przed wysłaniem, ograniczony dostęp i potwierdzenie zakończonego transferu |
| Retencja | Roboczo: 24 kopie godzinowe, 7 dziennych i 4 tygodniowe; skorygować po pomiarze rozmiaru i kosztu |
| Cel odzyskiwania | Do rozmowy: RPO do 1 godziny i RTO do 4 godzin; nie są to osiągnięte parametry ani SLA |
| Próba odtworzenia | Przed przyjęciem pierwszych danych, po istotnej zmianie schematu/procedury i okresowo, np. co miesiąc |

RPO jednej godziny oznacza możliwość utraty godziny typów; przed startem trzeba uzgodnić akceptowalną stratę również tuż przed meczem. Krótszy harmonogram lub PITR wybierzemy, jeśli wynikają z tej potrzeby i pomiarów. Błąd backupu lub zbyt stara poprawna kopia muszą być widoczne, a nie odkryte dopiero przy awarii.

Dump zapewnia spójny obraz pojedynczej bazy; nie zastępuje kopii ról, konfiguracji ani dostępu do kluczy. Własne pliki użytkowników, jeśli dojdą, również otrzymają osobny zakres kopii. Dla Redis jako odbudowywalnego cache nie zakładamy backupu; jeżeli później przechowa trwałe zadania, ta decyzja wymaga ponownej oceny. [Dump i przywracanie](https://www.postgresql.org/docs/current/backup-dump.html), [metody kopii, w tym PITR](https://www.postgresql.org/docs/current/backup.html).

Próbę wykonujemy na odizolowanej bazie. Sprawdzamy użytkowników, liczbę typów, wybrane sumy rankingów i uruchomienie API; zapisujemy czas odzyskania oraz datę ostatniego odzyskanego zapisu. Sam komunikat „backup utworzony” nie kończy weryfikacji.

## Pierwsze udostępnienie i przełączenie

[Lokalna próba wdrożenia](rehearsal.md) przygotowuje obrazy, osobny start Flyway i sprawdzenie HTTPS na syntetycznych meczach.

1. Wdrożyć pierwsze demo odczytu meczów z danymi syntetycznymi; sprawdzić telefon i HTTPS. Po dodaniu kont i typowania sprawdzić także logowanie, zapis i ponowny odczyt typu, zanim zostaną dopuszczeni rzeczywiści gracze.
2. Potwierdzić koszty, limity, monitoring, kopię poza hostem i działające odtworzenie.
3. Jeśli przenosimy stare konta/historię: uzgodnić mapowanie UID, meczów i sezonów; wykonać import próbny oraz porównać rankingi i rozbieżności.
4. Ustalić okno poza zamknięciem typowania; zatrzymać zapisy starego procesu na uzgodniony czas, wykonać końcowy eksport i kontrolę. Dla procesu wskazać jeden system przyjmujący zapis.
5. Przełączyć użytkowników dopiero po demonstracji i weryfikacji. Zachować poprzednie obrazy, konfigurację i kopię danych.
6. Jeśli nowy system przyjął już typy, sam powrót DNS do starej aplikacji zgubiłby ich widoczność. Plan powrotu musi uwzględniać te zapisy; nie włączamy dwóch niezależnych miejsc zapisu.

## Budżet i kolejny krok

Poniżej **limity alokacji**, nie oferty ani potwierdzone ceny: VPS 60 zł, API 95 zł, kopie 10 zł, domena w przeliczeniu miesięcznym 5 zł, rezerwa 30 zł = maksymalnie 200 zł. Cel 150 zł wymaga ofert poniżej tych limitów. Przed zakupem liczymy VAT, kurs waluty, odnowienia, transfer i ewentualne opłaty CI/rejestru. Brak miejsca w budżecie oznacza ponowny dobór usług przed uruchomieniem.

Kolejne etapy obejmują procedurę wydania i próbę odtworzenia na danych demonstracyjnych. Wybór dostawcy, DNS, dane dostępu, płatne usługi, docelowe RPO/RTO i przełączenie graczy pozostają do ustalenia przy odpowiednim etapie.
