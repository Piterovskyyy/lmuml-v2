# Zakres danych dostawcy przed importerem

Status: audyt z 2 listopada 2026 r.; kierunek przyjęty w [ADR 0009](../decisions/0009-provider-metadata-and-snapshots.md). V4 dodaje metadane/snapshoty, a [importer z ADR 0010](../decisions/0010-offline-catalog-import.md) zasilił lokalny katalog z dwóch zachowanych odpowiedzi. Nie oznacza to pobrania ani zapisania wszystkich rodzin API.

## Dane już dostępne w dwóch pobranych odpowiedziach

Model V2–V3 przewidywał ID, nazwy, rozgrywki/sezon, uczestników, termin, surowy status/rundę, pięć par bramek i adresy logo. Poniższa tabela była audytem jego braków; V4 rozszerza metadane i zapewnia miejsce na pełną odpowiedź źródłową. Istniejące lokalne pliki i DTO nie oznaczają jeszcze wykonania importu do PostgreSQL.

| Pola API poza obecnym schematem | Zastosowanie i rekomendacja |
| --- | --- |
| `fixture.referee` | Sędzia na karcie meczu; warto dodać opcjonalną wartość tekstową, bez wymyślania identyfikatora sędziego |
| `fixture.venue.id/name/city` | Miejsce spotkania i karta meczu; warto zachować, ale ID stadionu może być nieznane mimo obecnej nazwy |
| `fixture.status.elapsed/extra` | Minuta i doliczony czas w widoku live; sensowne pola przy centrum meczu, wraz z czasem pobrania |
| `fixture.periods.first/second` | Znaczniki początku części meczu; zachować źródłowo, wykorzystanie doprecyzować przy live |
| `teams.home/away.winner` | Osobna informacja o zwycięzcy według API; nie odtwarzać bezwarunkowo z `goals` ani wyniku regulaminowego |
| `league.type` i `country.name/code/flag` z metadanych rozgrywek | Opis rozgrywek, pochodzenie/region; sensowne rozszerzenie metadanych. `World` nie jest kodem kraju, a kod/flaga mogą być null |
| `seasons.start/end/current` | Daty edycji i wskazanie bieżącego sezonu według dostawcy; warto zachować. `current` nie zastępuje własnego wyboru aktywnej zabawy w LMuML |
| `seasons.coverage` | Dobór dostępnych funkcji i żądań; warto zachować przy sezonie. True nie gwarantuje danych każdego meczu |
| `league.standings` w meczu | Informacja dostawcy związana z tabelą, nie jej pozycje; zachować źródłowo, bez utożsamiania z całym endpointem standings |
| `fixture.status.long` | Oryginalny angielski opis; zachować źródłowo. Polski UI powinien mieć własne etykiety i obsługę nieznanego kodu |

W tej próbce 27 meczów ma null w `venue.id`, mimo obecnych nazw obiektów. Dane zwycięzcy również wymagają zachowania znaczenia: np. fixture `1208411` ma `goals` 0:1, karne 5:4 i `home.winner=true`. Nie należy spłaszczać tego do zwycięzcy po 90 minutach. Te obserwacje nie definiują pełnych reguł rozliczenia.

## Dane powtarzające się i alternatywne reprezentacje

- Nazwa/logo/ID rozgrywek i drużyn powtarzają się przy setkach meczów. W modelu relacyjnym powinny być przechowywane w odpowiednich tabelach i łączone przez FK.
- `date` i `timestamp` opisują ten sam moment w różnym formacie. Do zapytań wystarcza jedno `TIMESTAMPTZ` po sprawdzeniu zgodności; źródłowa odpowiedź może zachować oba.
- Strefa odpowiedzi API nie ustala strefy użytkownika. Datę spotkania UI formatuje według własnej jawnej strefy/ustawienia.
- `get`, `parameters`, `results`, `paging` i nagłówki limitów opisują odpowiedź/operację pobrania, a nie mecz. Są potrzebne do diagnostyki importu, nie jako powtarzane kolumny każdej drużyny.

## Dane z innych endpointów

Zdarzenia, składy, statystyki, tabele, pełne profile drużyn, zawodnicy, kontuzje, prognozy i kursy nie zostały pobrane przez obecną komendę. Nie można ich odzyskać z samej sezonowej listy meczów. Ich typy i deklaracje coverage nie dowodzą odczytu ani kompletności. Rozszerzenia otrzymają centralne pobieranie, częstotliwość i model przy odpowiadającej im funkcji.

## Przyjęty kierunek i granice

Rozszerzamy zwykłe tabele o metadane kart meczu/rozgrywek oraz zachowujemy pełny zestaw pól pobranej odpowiedzi jako ostatni udany snapshot `JSONB` z zakresem parametrów i czasem obserwacji. Normalne widoki i reguły nadal korzystają z jawnych, typowanych kontraktów i relacyjnych danych. Tabela snapshotów jest osobna; pełna lista meczów nie powtarza się w każdym `matches`.

Snapshot pozwoli zbadać lub ponownie zmapować pominięte i przyszłe pola bez kolejnego żądania API. Korzystamy z istniejącego PostgreSQL, bez nowego serwera. `JSONB` zachowuje wartości danych, lecz nie jest kopią oryginalnych bajtów: normalizuje format i kolejność kluczy oraz nie zachowuje duplikatów kluczy. [Dokumentacja PostgreSQL](https://www.postgresql.org/docs/18/datatype-json.html).

Na początek przechowujemy jeden ostatni poprawny snapshot dla danego zakresu zapytania, bez archiwizowania każdej odpowiedzi co minutę. Obsługiwane zakresy to endpoint `leagues` lub `fixtures`, ID rozgrywek i rok sezonu. Błędna lub starsza odpowiedź nie powinna nadpisywać ostatniej poprawnej generacji; snapshot i katalog muszą mieć wspólną transakcję. Inne endpointy/filtry wymagają rozszerzenia zakresu przed dodaniem obsługi. Snapshot nie zawiera klucza API i nie jest automatycznie zwracany frontendowi.

Dla skali: nasza odpowiedź 279 meczów ma 263 301 bajtów, a metadane rozgrywek 632 bajty. To rozmiary plików wejściowych, nie pomiar fizycznego rozmiaru PostgreSQL. Koszt jednego snapshotu jest czym innym niż przechowywanie nieograniczonej historii odpytywania; sama zmiana sposobu przechowywania nie pobiera nowych endpointów.
