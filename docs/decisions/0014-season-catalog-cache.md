# ADR 0014 — cache katalogu Rozgrywek w Redisie

- Status: przyjęty.
- Data: 25 listopada 2026 r.

## Kontekst

Start i Rozgrywki korzystają z tego samego katalogu sezonu. Po sygnale z WebSocket gracze mogą pobrać katalog jednocześnie. Pełny odczyt składa mecz, status, wyniki, drużyny i tabelę sezonu. Ranking zależy dodatkowo od zalogowanego gracza.

## Decyzja

Zaczynamy od wspólnego odczytu `GET /api/v1/seasons/{seasonCode}/matches`. Spring wykonuje małe zapytanie o UUID sezonu oraz czasy pobrania zapisanych meczów i tabeli. Te wartości wyznaczają klucz cache. Brak migawki meczów kieruje odczyt bezpośrednio do PostgreSQL.

Przy braku wpisu Spring pobiera pełny katalog w istniejącej transakcji odczytu. Klucz do zapisu powstaje z wersji zawartej w tej samej odpowiedzi. Gdy import zakończy się w trakcie zapytania, starszy odczyt może wypełnić tylko klucz odpowiadający jego wersji. Kolejne żądanie po imporcie użyje nowego klucza. Tabela może odświeżyć się niezależnie od terminarza. [Wzorzec cache-aside](https://redis.io/docs/latest/develop/use-cases/cache-aside/).

Wpisy JSON wygasają po 30 sekundach. TTL zwalnia miejsce po poprzednich wersjach i ogranicza opóźnienie zmian, które zachowują obie daty, np. ręcznego zapisu bezpośrednio w bazie. Równoległe żądania po sygnale WebSocket mogą skorzystać z wpisu zapisanego przez pierwsze żądanie w tym procesie Springa. Redis jest opcjonalną zależnością. Błąd odczytu lub zapisu cache powoduje krótką przerwę w próbach użycia Redis, a aplikacja korzysta z PostgreSQL.

## Konsekwencje

- Trafienie oszczędza odczyt i składanie pełnego katalogu z tabel PostgreSQL. Każdy odczyt korzystający z cache nadal sprawdza wersję w bazie.
- Redis przechowuje publiczny katalog w oddzielnej przestrzeni kluczy. Rankingi, konta i typy korzystają ze swoich istniejących odczytów.
- Gotowość aplikacji zależy od PostgreSQL. Wdrożenie może uruchomić cache w sieci wewnętrznej na tym samym hoście. [Środowisko lokalne](../development/local-environment.md#lokalny-redis-do-rozgrywek).
