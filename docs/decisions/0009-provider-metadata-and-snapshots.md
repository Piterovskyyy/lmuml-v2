# ADR 0009 — szersze metadane i ostatnia poprawna odpowiedź API

Status: przyjęta 2 listopada 2026 r. Użytkownik wybrał rozszerzenie metadanych i pełny snapshot JSONB, a następnie omówiono jego oddzielne przechowywanie.

## Decyzja

Katalog otrzymuje opcjonalne metadane dostępne już w pobranych odpowiedziach:

- rozgrywki: typ, kraj/region, kod i flaga;
- sezon: daty początku/końca, `provider_current` i obiekt `coverage` z zachowaniem nieznanych flag;
- mecz: sędzia, ID/nazwa/miasto stadionu, minuta/doliczony czas i nullable wskazanie zwycięzcy dla każdej drużyny.

ID stadionu pozostaje opcjonalne także przy obecnej nazwie. Minuta nie ma limitu 90/120. Wskazanie zwycięzcy API nie zastępuje wyniku po regulaminowym czasie. Daty sezonu i znacznik bieżącej edycji dostawcy nie wyznaczają aktywnej kolejki graczy.

Pozostałe pola odpowiedzi, w tym znaczniki części meczu i oryginalny długi opis statusu, zachowuje pełny snapshot. [Audyt pól](../planning/provider-data-retention.md) oddziela dostępne metadane od niepobranych endpointów.

## Osobna tabela snapshotów

`lmuml.api_football_snapshots` zawiera jeden ostatni poprawny kompletny JSONB dla klucza `(endpoint, league_id, season)`. Początkowo obsługiwane są dokładnie `leagues?id=...&season=...` i `fixtures?league=...&season=...`. Inne endpointy i filtry wymagają odrębnego zakresu klucza i rozszerzenia kontraktu przed ich obsługą.

Dla Ligi Mistrzów 2024 oznacza to dwa rekordy: jeden z metadanymi rozgrywek, drugi z pełną listą 279 meczów. Lista nie jest kopiowana do każdego wiersza `matches`. Parametry określa klucz oraz koperta; osobna powielona kolumna z parametrami nie jest potrzebna. Snapshot nie ma FK do katalogu, ponieważ może być zapisany przed rekordami katalogu w tej samej transakcji.

`captured_at` pochodzi z momentu pobrania/obserwacji źródła, nie z ponownego importowania pliku. JSONB zachowuje wartości i nieopisane pola, ale nie oryginalny zapis bajtowy, kolejność ani duplikaty kluczy. Oryginalne pliki próbek mogą pozostać oddzielnym materiałem diagnostycznym. [PostgreSQL: JSONB](https://www.postgresql.org/docs/18/datatype-json.html).

## Ochrona poprawnej generacji

- Zapis snapshotu wymaga istniejącej transakcji importera (`PROPAGATION_MANDATORY`), wspólnej z zapisem katalogu.
- Nowsza obserwacja zastępuje poprzednią. Ta sama chwila i identyczny JSON są dozwolone przy ponowieniu; starsza obserwacja lub inny JSON z tym samym czasem odrzucają całą transakcję.
- Błąd zapisu katalogu wycofuje także snapshot. Odrzucenie starej generacji oznacza rollback również wtedy, gdy wywołujący spróbuje przechwycić ten błąd i kontynuować.
- Konstrukcja snapshotu sprawdza poprawną kompletną kopertę, pustą listę/obiekt błędów, zgodność endpointu, dokładnie dwa obsługiwane parametry i zakres ligi/sezonu. Częściowa strona lub dodatkowy filtr nie zastąpi całego sezonu.
- Poprawna pusta lista meczów jest dozwolona. Nie oznacza to zgody na usunięcie istniejących meczów; takiej operacji magazyn nie wykonuje.
- Pełna walidacja DTO, wymaganych pól katalogu, duplikatów i reguł mapowania należy do przyszłego importera przed zatwierdzeniem transakcji. Sama poprawna koperta nie potwierdza poprawności biznesowej.

Przyszły mechanizm pobierania musi również zapewnić kolejność obserwacji, np. serializować pobrania danego zakresu lub rejestrować rozpoczęcie żądania. Późne zakończenie starego żądania nie może dostać nowej generacji tylko dlatego, że skończyło się później.

## Uprawnienia, retencja i granice etapu

Tabela snapshotów nie dostaje SELECT dla roli zwykłego API. Nie jest odpowiedzią dla frontendu i nie zawiera nagłówków ani klucza API. Katalogowe tabele zachowują swoje wcześniejsze uprawnienia. Dedykowana rola zapisu importera i jej konfiguracja pozostają do etapu importu; nie używamy do niego konta administratora ani właściciela migracji.

Retencja to ostatnia poprawna wersja dla danego zakresu, bez automatycznego dopisywania historii przy każdym odpytywaniu. Nie dodajemy brokera ani osobnej bazy. Nowa migracja V4 nie pobiera danych i nie zmienia wykonanych V1–V3.

Ten etap obejmuje schemat i magazyn SQL, wraz z testami transakcji. Magazyn nie jest samodzielnym zadaniem, kontrolerem ani automatycznie uruchamianym komponentem. Podłączenie go do mapującego importera, zasilenie katalogu i wywołania harmonogramu są kolejnymi etapami. Nie zadeklarowano działania całego importu produkcyjnego.

Aktualizacja: [ADR 0010](0010-offline-catalog-import.md) podłącza magazyn do jednorazowego importera zachowanych próbek. Import i jego ponowienie wykonano lokalnie; automatyczne pobieranie/harmonogram pozostają poza tym zakresem.

## Weryfikacja

Pełne `Maven verify` na Windows przeszło: 65 testów jednostkowych i 30 integracyjnych, bez pominięć. Testy obejmują migrację wypełnionej V3, opcjonalne metadane i ograniczenia JSONB oraz 14 przypadków magazynu: rozdział zakresów, zachowanie nieznanych pól, nowe/stare/konfliktujące obserwacje, identyczne ponowienie, rollback snapshotu po błędzie katalogu, wymaganą transakcję, błędne lub filtrowane odpowiedzi i poprawny pusty wynik.

Po zachowaniu kopii lokalnego schematu wykonano V4 na `lmuml_dev`, bez zmiany V1–V3 i bez pobierania API. Migracje ani testy nie zasilają deweloperskiego katalogu demonstracyjnymi danymi. Uprawnienia runtime do wewnętrznych snapshotów pozostają wyłączone.
