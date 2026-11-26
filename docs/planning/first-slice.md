# Pierwszy przepływ: od bazy do mobilnej listy meczów

Aktualizacja: 2 listopada 2026 r. Backend odczytuje katalog sezonu z PostgreSQL, a frontend pokazuje go na telefonie, tablecie i desktopie. Publikacja pozostaje osobnym etapem. Plan nie zleca automatycznej implementacji następnych modułów.

## Gotowy zakres

`PostgreSQL → JdbcClient → REST JSON → React`

```http
GET /api/v1/seasons/{seasonCode}/matches
```

[Kontrakt odpowiedzi i błędów](../development/season-matches-api.md) opisuje cały sezon z własnymi UUID, nazwami i logo drużyn, terminami, statusami oraz osobnymi wynikami. Odczyt nie wywołuje API dostawcy. Lokalny `api-football-2-2024` zawiera 279 historycznych meczów Ligi Mistrzów 2024/25.

Historyczną propozycję `/matchdays/{number}/matches` zastąpił odczyt katalogu sezonu. Opis rundy turnieju nie jest własną kolejką graczy: [ADR 0006](../decisions/0006-betting-rounds.md). Zasady wyniku regulaminowego i indywidualnego terminu meczu opisuje [ADR 0007](../decisions/0007-prediction-score-and-deadline.md).

## Małe etapy

| Etap | Stan / rezultat |
| --- | --- |
| Narzędzia i start | Gotowe: mise, Maven Wrapper, PostgreSQL Compose, ograniczone role i health |
| Schemat i import | Gotowe: Flyway V1–V5, katalog, snapshoty JSONB i powtarzalny importer |
| REST | Gotowy technicznie: lista sezonu, własny DTO, sortowanie, błędy i test HTTP/PostgreSQL |
| Responsywna lista | Gotowa technicznie: React/TypeScript/Vite, shadcn/Radix, wyszukiwanie, filtry, szczegóły, ładowanie, pusta lista, błąd i ponowienie |
| CI i demonstracja | Później: budowa obu części, testy i oznaczone demo HTTPS po wyborze hostingu |

## Odpowiedzialności

- `backend/src/main/java/pl/lmuml/football/matches/`: kontroler, zapytanie SQL, model HTTP i status prezentacyjny.
- `backend/src/main/java/pl/lmuml/football/apifootball/`: kontrakty dostawcy, klient i importer. Frontend nie korzysta z tych DTO.
- `backend/src/main/resources/db/migration/`: wykonane migracje oraz przyszłe kolejne wersje.
- `backend/src/test/java/pl/lmuml/football/matches/`: test ścieżki HTTP/SQL i mapowania statusów.
- `frontend/src/features/matches/`: klient i widok; `frontend/src/components/ui/`: używane kontrolki. [Uruchomienie i struktura](../development/frontend.md).

Prosty odczyt nie wymaga pustego serwisu ani interfejsu repozytorium. Reguły zapisu i rozliczeń otrzymają osobne miejsce wraz z odpowiednimi funkcjami.

## Kryteria pierwszego widoku

- Czyta rzeczywisty lokalny endpoint, prezentuje sezon, drużyny, logo, terminy, statusy i podpisane wyniki. Rozróżnia czas regulaminowy, dogrywkę i karne.
- Nie zamienia brakujących wyników w 0:0. Odróżnia ładowanie, pustą listę i awarię; umożliwia ponowienie bez utraty sezonu.
- Formatuje czas w jawnej strefie, również podczas zmiany czasu. Nieznane statusy mają bezpieczny opis.
- Działa od 320 px, z klawiaturą i powiększonym tekstem. Stan nie zależy wyłącznie od koloru ani hover; animacje respektują ograniczenie ruchu.
- Używa wybranych shadcn/ui, Radix, Tailwind i Motion: [ADR 0001](../decisions/0001-frontend-ui.md). Wersje są przypięte; pierwsza oprawa używa preferowanej palety i Inter z zachowaną OFL. Układ jest własny, a wygląd pozostaje do oceny.
- Oznacza dane historyczne; HTTP 200 nie stanowi potwierdzenia świeżości wyników. Nie udaje zapisu typu.

Logowanie, własne kolejki, typy, punkty, ranking, zadania, cache i relacja live otrzymają osobne etapy. Publikację i przełączenie użytkowników opisuje [plan wdrożenia](../operations/deployment-plan.md), bez zmiany starej aplikacji w tym zakresie.
