# ADR 0003 — minimalny backend i jego gotowość

Status: przyjęta 31 października 2026 r. w zakresie etapu „backend i baza”.

Aktualizacja: [ADR 0004](0004-database-migrations.md) dodaje migracje, schemat `lmuml` oraz uprawnienia odczytu pierwszych tabel. Poniższy opis zachowuje zakres pierwotnego etapu.

## Kontekst

Potrzebujemy uruchamialnego Spring Boota, rzeczywistego połączenia z PostgreSQL i sprawdzalnej reakcji na awarię bazy. Model meczów, logowanie i frontend otrzymają osobne zadania.

## Decyzja

- Spring Boot **4.1.2**, Java 25 i istniejący Maven Wrapper. Parent Boota zarządza zgodnymi wersjami zależności oraz pluginów budowy.
- Web MVC obsługuje HTTP; Actuator udostępnia stan aplikacji. JDBC z HikariCP i sterownikiem PostgreSQL zapewnia połączenie z bazą. Nie piszemy własnego kontrolera kopiującego funkcje Actuatora.
- Jedyny główny pakiet to `pl.lmuml`. Katalogi funkcji powstaną z pierwszym rzeczywistym kodem. Nie tworzymy pustych warstw i interfejsów.
- Lokalny serwer domyślnie nasłuchuje na `127.0.0.1:8080`. W przyszłym kontenerze trzeba jawnie skonfigurować `SERVER_ADDRESS=0.0.0.0`; obecny plik Compose uruchamia tylko deweloperską bazę.
- Publiczne odpowiedzi health nie pokazują szczegółów połączenia, wyjątków ani komponentów. Pozostałe endpointy Actuatora nie są wystawione.

| Endpoint | Co sprawdza | Przy utracie bazy |
| --- | --- | --- |
| `/actuator/health/liveness` | Czy uruchomiona aplikacja jest w stanie działać | `200 / UP` |
| `/actuator/health/readiness` | Stan gotowości aplikacji oraz połączenie z bazą | `503 / DOWN` |
| `/actuator/health` | Łączny stan skonfigurowanych kontroli | `503 / DOWN` |

Poprawnie skonfigurowany proces może uruchomić się przy niedostępnej bazie. Pula połączeń ponawia próby, a readiness pozostaje DOWN do odzyskania połączenia. Brak wymaganej konfiguracji połączenia jest błędem konfiguracji. Sam status readiness nie blokuje automatycznie przyszłych endpointów biznesowych — późniejszy router musi z niego korzystać.

## Role i konfiguracja

Runtime używa standardowych zmiennych `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME` i `SPRING_DATASOURCE_PASSWORD`. Plik `.env` służy tylko lokalnym narzędziom; Spring nie wczytuje go automatycznie.

Administrator deweloperski przygotowuje osobną rolę `lmuml_app` przez jawny skrypt. Rola API nie ma uprawnień administratora, tworzenia baz/ról ani trwałych tabel w schemacie `public`. Na tym etapie potrzebuje tylko logowania, połączenia z bazą i kontrolnego zapytania. Domyślne uprawnienia PostgreSQL dla `PUBLIC`, np. tabele tymczasowe, nadal obowiązują. Uprawnienia do przyszłych tabel i rola migracji zostaną ustalone razem ze schematem.

Nie resetujemy istniejącego wolumenu. Nowy skrypt inicjalizacji obrazu PostgreSQL nie rozwiązałby konfiguracji roli na już zainicjalizowanej bazie.

## Alternatywy i konsekwencje

- Własny `GET /health` odrzucono: dublowałby gotowe mechanizmy i łatwo pomijał rzeczywiste połączenie z bazą.
- JPA i Flyway odkładamy do pierwszych tabel. JDBC nie rozstrzyga jeszcze sposobu persystencji całej aplikacji. Nie ma schematu domenowego ani automatycznego DDL.
- Testcontainers uruchamia osobny, tymczasowy PostgreSQL 18.6 z takim samym obrazem jak Compose. H2 nie odtwarza uprawnień i zachowania PostgreSQL. Testy nie używają deweloperskiego wolumenu ani lokalnego `.env`.
- Testy integracyjne uruchamia Maven Failsafe w `verify`. Brak Dockera oznacza błąd testu, a nie ciche pominięcie.
- Kontrola obejmuje SQL jako ograniczona rola, HTTP, utratę bazy i odzyskanie gotowości. Ten etap nie jest wdrożeniem produkcyjnym.

## Weryfikacja etapu

Na Windows, przez przypięte JDK i wrapper, `verify` zakończyło się sukcesem: trzy testy integracyjne, bez pominięć. Test niedostępności wstrzymuje i wznawia kontener testowy; readiness przechodzi na DOWN, liveness pozostaje UP, a gotowość wraca po wznowieniu bazy. Nie jest to test pełnego restartu serwera ani odtwarzania danych.

Pięć testów Node sprawdza zachowanie istniejących sekretów, walidację i oddzielenie konfiguracji runtime. Przygotowanie lokalnej roli wykonano dwukrotnie. Dodatkowe zapytanie potwierdziło brak uprawnień administracyjnych i CREATE w `public`. Zbudowany JAR połączył się z lokalną bazą; oba probes zwróciły `200 / UP`. Po przerwaniu uruchomienia proces Java i nasłuch na 8080 zakończyły się.

Budowy i obsługi sygnałów na Linux/macOS nie wykonano w tym etapie. Testy nie korzystały z danych starej aplikacji.

## Źródła

- [Spring Boot: zgodność Java i Maven](https://docs.spring.io/spring-boot/system-requirements.html).
- [Actuator: health i probes](https://docs.spring.io/spring-boot/reference/actuator/endpoints.html).
- [Wersje zależności zarządzane przez Boot](https://docs.spring.io/spring-boot/appendix/dependency-versions/coordinates.html).
- [Testcontainers: PostgreSQL](https://java.testcontainers.org/modules/databases/postgres/).
