# Odczyt meczów sezonu

Pierwszy endpoint czyta katalog PostgreSQL przez JdbcClient, zgodnie z [ADR 0005](../decisions/0005-football-data-boundary.md). Nie wywołuje dostawcy i nie wymaga jego klucza. Własne kolejki typowania pozostają osobnym modułem.

```http
GET /api/v1/seasons/{seasonCode}/matches
```

Po lokalnym imporcie historycznej Ligi Mistrzów kod `api-football-2-2024` wskazuje 279 meczów sezonu 2024/25. Kod jest stabilnym adresem sezonu. Mecze, drużyny, sezon i rozgrywki mają własne UUID.

Spring może współdzielić wynik tego odczytu w Redisie. Przy włączonym cache PostgreSQL sprawdza osobno wersje meczów i tabeli przed użyciem wpisu. [ADR 0014](../decisions/0014-season-catalog-cache.md).

`GET /api/v1/seasons/active` zwraca publiczne `{ "seasonCode": "…" }` z wyborem administratora albo `{ "seasonCode": null }` przed ustawieniem. `PUT /api/admin/seasons/active` przyjmuje kod istniejącego sezonu w tym samym formacie i wymaga sesji administratora oraz tokenu CSRF. Ustawienie ma jeden wiersz z kluczem obcym do katalogu sezonów.

## Kontrakty danych

| Kierunek | Odpowiedź | Gdzie sprawdzić pola i typy |
| --- | --- | --- |
| API-Football → Spring | `/leagues` | `ApiFootballResponse<ApiFootballLeague>` w module `football/apifootball`. Rekordy w `dto/ApiFootballLeague.java` opisują rozgrywki, sezony i pokrycie. |
| API-Football → Spring | `/fixtures` | `ApiFootballResponse<ApiFootballFixture>` w tym samym module. Rekordy w `dto/ApiFootballFixture.java` opisują terminarz, drużyny, status i poszczególne wyniki. |
| API-Football → Spring | `/standings` | `ApiFootballResponse<ApiFootballStanding>`. Rekordy w `dto/ApiFootballStanding.java` opisują grupy, klasyfikację, formę i bilanse u siebie i na wyjeździe. |
| Spring → React | `GET /api/v1/seasons/{seasonCode}/matches` | `football/matches/SeasonMatchesResponse.java` dla sukcesu i `ProblemDetail` dla błędów. W React kontrakt sprawdza schemat Zod w `features/matches/api/season-matches.ts`. |
| Spring → React | `GET /api/v1/seasons/{seasonCode}/betting-rounds` | Widok „Moje typy”. Odpowiedź zawiera sezon, rozgrywki i opublikowane kolejki. |

Surowe dane dostawcy są zachowywane w snapshotach. W DTO `JsonNode` obejmuje m.in. zmienne kształty pól `errors` i `parameters`, wartości statystyk oraz niewykorzystywane jeszcze szczegóły `players`. Zakres próbek, DTO i pól opisuje [przegląd API-Football](../research/2026-10-31-api-football.md).

## Aktualizacje wyników

Publiczny WebSocket przyjmuje połączenia w tym samym originie pod `/api/v1/season-updates`. Po otwarciu połączenia przeglądarka wysyła tekstowy komunikat JSON.

```json
{"type":"subscribe","seasonCode":"api-football-2-2024"}
```

Serwer odpowiada bieżącą wersją i wysyła kolejną wiadomość po każdej wykrytej zmianie. Czas pobrania zapisanej próbki jest zapisany w ISO 8601 UTC. Wartość `null` oznacza sezon bez próbki. Nowa subskrypcja na tym samym połączeniu zastępuje poprzednią.

```json
{"type":"fixtures","fixturesCapturedAt":"2026-10-26T20:15:00.123456Z"}
```

`GET /api/v1/seasons/{seasonCode}/matches` oraz chroniony `GET /api/v1/player/seasons/{seasonCode}/ranking` zwracają tę samą wersję jako `fixturesCapturedAt`. Brak próbki daje `null`. Pole należy do tego samego odczytu bazy co zwrócone wyniki lub ranking, więc przeglądarka może stwierdzić, czy po ponownym połączeniu trzeba odświeżyć widok.

Niepoprawna wiadomość, nieznany sezon lub brak subskrypcji w wyznaczonym czasie zamyka połączenie kodem `1008`. Po osiągnięciu limitu 128 połączeń serwer zwraca kod zamknięcia `1013`. Ping/pong pozwala wykryć zerwane połączenie. Po wznowieniu klient dostaje aktualną wersję, więc może nadrobić zmianę jednym odczytem REST. [ADR 0013](../decisions/0013-season-result-websocket.md).

## Opublikowane kolejki

`/betting-rounds` zwraca `season`, `competition` oraz `rounds`. Każda kolejka ma `id`, `number`, `name`, `publishedAt`, `awaitingFinal` i `matches`. `name` przyjmuje postać `Runda N` na podstawie `number`. Pola sezonu, rozgrywek i poszczególnych meczów mają ten sam format co w katalogu. Skład wynika z zapisanych identyfikatorów meczów. `awaitingFinal` wskazuje zarezerwowany blok finału czekający na przypisanie meczu.

Kolejki są uporządkowane od najwyższego numeru. Mecze w kolejce są uporządkowane po terminie, z nieznanymi terminami na końcu. Istniejący sezon bez publikacji zwraca 200 i `rounds: []`. Nieznany kod sezonu zwraca 404.

## Typy graczy

`GET /api/v1/player/betting-rounds/{roundId}/players-predictions` wymaga sesji gracza. Zwraca `roundId`, `serverNow` (ISO 8601 UTC) i `players`. Uczestnik ma `id`, `displayName`, `isCurrentPlayer` oraz `predictions`. Każdy ujawniony typ zawiera `matchId`, `homeGoals`, `awayGoals` i nullable `points`. Nie ma adresów e-mail ani danych uwierzytelnienia. Metadane spotkań pochodzą z publicznego odczytu opublikowanych rund.

Uczestnik pojawia się po zapisaniu co najmniej jednego typu w rundzie. `predictions: []` oznacza brak ujawnionych typów. SQL zwraca wartości typu wyłącznie przy znanym terminie `kickoffAt <= serverNow` i rozpoznanym statusie dopuszczającym ujawnienie. Statusy `TBD`, `PST`, `CANC`, nieznane wartości oraz brak terminu pozostawiają wynik ukryty. Dotyczy to również własnych typów w tym widoku. Edycja i pełny odczyt własnych zapisów pozostają w „Moich typach”.

Czas PostgreSQL, lista uczestników, wyniki i punkty pochodzą z jednego zapytania. Punkty wylicza wspólne `PredictionScoring` według [reguły po 90 minutach](../decisions/0007-prediction-score-and-deadline.md). `points: null` oznacza typ oczekujący na rozliczenie, a `0` jest rozliczonym wynikiem. Korekta wyniku jest uwzględniana przy następnym odczycie.

Odpowiedź ma `Cache-Control: no-store`. Brak sesji daje 401, niepoprawny UUID 400, a nieistniejąca lub nieopublikowana runda 404. Opublikowana runda bez uczestników zwraca 200 z pustą listą. Przejściowa awaria bazy daje 503, pozostały błąd SQL 500, bez ujawniania szczegółów połączenia.

Przepływ: `PlayersPredictionsController` → `PlayersPredictionsQuery` → `PredictionScoring` → rekordy odpowiedzi. Frontend waliduje kontrakt w `features/players-predictions/api/players-predictions.ts`. `PlayerAccountsIT` weryfikuje granicę ujawnienia, chronione statusy, zakres opublikowanej rundy i rozliczanie.

## Statystyki meczu

Publiczny `GET /api/v1/matches/{matchId}/statistics` odczytuje porównanie z PostgreSQL. Zwraca `matchId` (UUID), `capturedAt` (ISO 8601 UTC) oraz `home` i `away`. Każdy zestaw ma `shotsTotal`, `shotsOnTarget`, `possessionPercent`, `corners`, `fouls` i `saves`. Brak konkretnej wartości daje `null`. Liczba zero pozostaje wynikiem. `possessionPercent` jest liczbą od 0 do 100.

Odpowiedź 200 wymaga zapisu obu drużyn z tej samej próbki i ma `Cache-Control: no-store`. Brak zapisu lub meczu daje 404, niepoprawny UUID 400, a czasowa awaria odczytu 503. Terminarz jest niezależny od statystyk. Widok pobiera porównanie po wybraniu „Statystyki” w szczegółach zakończonego, trwającego lub wstrzymanego meczu.

Importer przypisuje strony na podstawie identyfikatorów drużyn w katalogu i zapisuje obie w jednej transakcji. Gdy zmieni się uczestnik meczu, odczyt zwraca 404 do czasu importu próbki dla aktualnej pary. Publiczny kontrakt zawiera znormalizowane wartości. Oryginalna próbka i metadane zostają w katalogu importu. [Instrukcja synchronizacji jednego meczu](local-environment.md#statystyki-pojedynczego-spotkania).

## Przebieg meczu

Publiczny `GET /api/v1/matches/{matchId}/events` zwraca `matchId`, `capturedAt` (ISO 8601 UTC) i uporządkowaną listę `events`. Zdarzenie ma `minute`, opcjonalny czas doliczony `addedTime`, stronę `side` (`HOME`, `AWAY` albo `null`), rodzaj `kind`, `playerName` oraz `relatedPlayerName`. Brak nazwiska daje `null`. Dla zmiany te dwa pola oznaczają zawodnika schodzącego i wchodzącego. Dla gola drugie pole oznacza asystującego, jeśli występuje w odpowiedzi dostawcy.

`kind` przyjmuje `GOAL`, `OWN_GOAL`, `PENALTY_GOAL`, `MISSED_PENALTY`, `YELLOW_CARD`, `SECOND_YELLOW_CARD`, `RED_CARD`, `SUBSTITUTION`, `VAR`, `GOAL_CANCELLED`, `PENALTY_CONFIRMED`, `PENALTY_CANCELLED` lub `UNKNOWN`. Zdarzenia z tym samym czasem zachowują kolejność dostawcy. Dane pochodzą z pojedynczej zapisanej próbki dla bieżącej pary drużyn. `200` z `events: []` oznacza zapisaną pustą listę. Gdy próbki brakuje lub zmienił się uczestnik meczu, odpowiedź ma status `404`. Odczyt ma `Cache-Control: no-store`. [Instrukcja synchronizacji zdarzeń](local-environment.md#zdarzenia-pojedynczego-spotkania).

## Składy meczu

Publiczny `GET /api/v1/matches/{matchId}/lineups` zwraca `matchId`, `capturedAt` (ISO 8601 UTC) i składy `home` oraz `away`. Każdy skład ma `formation`, `coachName`, `starters` i `substitutes`. Zawodnik ma `name`, `number`, `position`, `gridRow` i `gridColumn`. Ustawienie, trener, numer i współrzędne mogą mieć wartość `null`, a `position` przyjmuje `GOALKEEPER`, `DEFENDER`, `MIDFIELDER`, `FORWARD` lub `UNKNOWN`. Współrzędne oznaczają rząd od własnej bramki i kolejność zawodnika w rzędzie według dostawcy.

Listy zachowują kolejność ze źródła. Odpowiedź `200` wymaga obu składów z tej samej próbki dla bieżących uczestników. Brak zapisu daje `404`, a odpowiedź ma `Cache-Control: no-store`. [Instrukcja synchronizacji składów](local-environment.md#składy-pojedynczego-spotkania).

Wpis zawodnika zawiera też `rating`, `goals`, `assists`, `substitutedOn` i `substitutedOff`. Dwa ostatnie mają postać `{minute, addedTime}`. Każde z tych pól może mieć wartość `null`. Odczyt łączy zapisane dane na podstawie meczu, strony i identyfikatora zawodnika u dostawcy. Identyfikator pozostaje wewnętrzny.

## Statystyki zawodników meczu

Publiczny `GET /api/v1/matches/{matchId}/player-statistics` zwraca `matchId`, `capturedAt` (ISO 8601 UTC) oraz listy zawodników `home` i `away`. Każdy wpis ma `name`, `number`, `position`, `minutes`, `rating`, `goals`, `assists`, `shotsTotal`, `shotsOnTarget`, `passesTotal`, `keyPasses`, `tackles` i `saves`. Pozycje mają tę samą reprezentację co w składach. Pola liczbowe mogą być `null`. Ocena pochodzi od dostawcy i mieści się w skali od 0 do 10. Wartość zero i brak danej są rozróżniane.

Odpowiedź `200` obejmuje jedną próbkę z danymi obu aktualnych uczestników. Brak zapisu daje `404`. Odpowiedź ma `Cache-Control: no-store`. [Instrukcja synchronizacji statystyk zawodników](local-environment.md#statystyki-zawodników-pojedynczego-spotkania).

## Statystyki typowania

Publiczny `GET /api/v1/seasons/{seasonCode}/prediction-statistics` zwraca `seasonName`, `playersWithSettledPredictions`, `settledPredictions`, `exactScores` i `correctOutcomes`. Liczba graczy obejmuje osoby z co najmniej jednym rozliczonym typem w opublikowanych rundach sezonu. `leaders` zawiera do pięciu pozycji z `position`, `displayName` i `points`. Kolejność rozstrzygają punkty, a potem dokładne wyniki. Każdy element `rounds` ma `number`, `name` i zbiorcze `settledPredictions`, `exactScores` oraz `correctOutcomes`. Publiczna odpowiedź udostępnia nazwy wyłącznie dla czołówki. Typy, identyfikatory kont oraz pełny ranking wymagają sesji.

`GET /api/v1/player/seasons/{seasonCode}/statistics` wymaga sesji i odczytuje tylko jej gracza. Zwraca `seasonName`, `totals` z `points`, `settledPredictions`, `exactScores` i `correctOutcomes`, oraz `rounds`. Każda rozliczona runda ma `id`, `number`, `name` i te same cztery miary. Rundy są uporządkowane według numeru, a sezon bez rozliczonych typów gracza ma zerowe sumy i pustą listę.

Oba odczyty używają [reguły punktacji](../decisions/0007-prediction-score-and-deadline.md) i rozliczają tylko mecze znanego terminu, który już upłynął. Pokazują dane bieżącego importu z `Cache-Control: no-store`. Kod sezonu w nieprawidłowym formacie daje 400, brak sezonu 404. Prywatny odczyt bez sesji daje 401.

## Model odpowiedzi dla Reacta

| Pole | Zawartość |
| --- | --- |
| `season` | `id`, `code`, `name`, `startYear` |
| `competition` | `id`, `code`, `name`, nullable `logoUrl` |
| `matches` | Lista wszystkich meczów tego sezonu |
| `fixturesCapturedAt` | Moment UTC w ISO 8601, kiedy pobrano ostatnią zapisaną próbkę meczów tego sezonu, lub `null` przed pierwszym importem próbki. |
| `standings` | `null` przed importem tabeli lub `{ capturedAt, rows }`. Wiersz zawiera pozycję dostawcy, drużynę, punkty, liczbę meczów, zwycięstw, remisów, porażek, gole, ich różnicę i opcjonalną formę `W/D/L`. |
| `matches[].id` | UUID aplikacji |
| `tournamentRound` | Nullable opis rundy turnieju, odrębnej od kolejki typowania |
| `kickoffAt` | Moment UTC w ISO 8601 albo `null` |
| `status` | `state`, nullable `finishType`, `elapsedMinutes`, `extraMinutes` |
| `homeTeam`, `awayTeam` | Własne `id`, `name`, nullable `logoUrl` |
| `scores` | Pary `total`, `halfTime`, `regulationTime`, `extraTime`, `penalties` |
| Każda para wyniku | `home`, `away`: niezależnie liczba lub `null` |
| `homeWinner`, `awayWinner` | Nullable informacja źródłowa o zwycięzcy |

Przykład fragmentu jednego meczu po dogrywce, bez pozostałych metadanych:

```json
{
  "status": { "state": "FINISHED", "finishType": "EXTRA_TIME", "elapsedMinutes": 120, "extraMinutes": null },
  "scores": {
    "total": { "home": 1, "away": 1 },
    "halfTime": { "home": 0, "away": 0 },
    "regulationTime": { "home": 1, "away": 0 },
    "extraTime": { "home": 0, "away": 1 },
    "penalties": { "home": null, "away": null }
  }
}
```

Pary są zachowanymi polami dostawcy, bez sumowania i odejmowania: `total` pochodzi z `goals`, `regulationTime` z `score.fulltime`, pozostałe z odpowiednich par `score`. Dla zweryfikowanego Fenerbahçe–Lille wynik regulaminowy to 1:0 przy łącznym 1:1 i dogrywce 0:1. `0:0` jest wynikiem, a `null:null` brakiem danych. Nie uzupełniamy częściowo znanej pary zerem.

Zwycięzca jest zachowaną informacją, nie porównaniem `total` — szczególnie przy karnych. Odczyt nie oblicza punktów ani wyjątków dla walkowerów i przerwanych spotkań.

Lista jest pełna, bez filtrów, paginacji i ukrytego limitu. Porządek: `kickoffAt` rosnąco, nieznane terminy na końcu, przy tym samym terminie UUID rosnąco. Frontend formatuje datę w jawnej strefie użytkownika. `logoUrl` jest adresem obrazu, bez pobierania lub kopiowania pliku przez endpoint.

## Status prezentacyjny

| `state` | Obecne kody źródłowe |
| --- | --- |
| `TIME_UNCONFIRMED` | TBD |
| `SCHEDULED` | NS |
| `LIVE` | 1H, 2H, ET, P, LIVE |
| `BREAK` | HT, BT |
| `SUSPENDED` | SUSP, INT |
| `FINISHED` | FT, AET, PEN |
| `POSTPONED` | PST |
| `CANCELLED` | CANC |
| `ABANDONED` | ABD |
| `AWARDED` | AWD, WO |
| `UNKNOWN` | Inne lub brakujące wartości |

`finishType` przyjmuje `REGULATION_TIME`, `EXTRA_TIME` lub `PENALTIES` odpowiednio dla FT/AET/PEN, w innych przypadkach `null`. Minuty są nullable wartościami źródłowymi. Zod zamienia rozpoznane ciągi JSON na enumy `MatchState` i `FinishType`. Nowa tekstowa wartość stanu trafia do `Unknown`, a nowy sposób zakończenia do `null`. Nieprawidłowy typ pola, np. liczba zamiast statusu, jest błędem kontraktu.

## Błędy i granice

| Przypadek | HTTP |
| --- | --- |
| Istniejący sezon, również pusty | 200; dla pustego `matches: []` |
| Kod niespełniający formatu | 400 |
| Poprawny kod nieistniejącego sezonu | 404 |
| Brak połączenia lub timeout odczytu | 503 |
| Inny błąd SQL, np. niezgodny schemat | 500 |

Kod ma maksymalnie 64 znaki: małe litery ASCII i cyfry, rozdzielane pojedynczymi myślnikami. SQL wiąże parametr. Błędy mają `application/problem+json` i stałe komunikaty bez treści wyjątków SQL lub połączenia, zgodnie ze [wsparciem ProblemDetail w Spring MVC](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-rest-exceptions.html). Techniczne komunikaty są po angielsku; przyszły interfejs lokalizuje opisy dla użytkownika.

Przepływ: `SeasonMatchesController` → `SeasonMatchesQuery` → `SeasonMatchesResponse` → JSON. `MatchStatus` przekłada kod źródłowy na prezentację. Zapytanie z `LEFT JOIN` odróżnia pusty sezon od nieistniejącego. Katalog, czas pobrania meczów i tabela z `season_standings` korzystają z tej samej migawki PostgreSQL w transakcji tylko do odczytu.

Rola runtime ma SELECT tabel katalogu, `season_standings` z migracji V6 i `fixture_snapshot_times` z migracji V13. Widok zawiera klucz ligi, rok sezonu oraz czas pobrania. Surowe snapshoty są dostępne dla importera. Odpowiedź nie zawiera surowej koperty, identyfikatorów dostawcy, coverage, sekretów ani uprawnień do typowania. Klasy odczytu mają [warunek aplikacji webowej](https://docs.spring.io/spring-boot/api/java/org/springframework/boot/autoconfigure/condition/ConditionalOnWebApplication.html), więc nie powstają w jednorazowych profilach migracji, próbek i importu.

`fixturesCapturedAt` i `standings.capturedAt` odpowiadają za momenty pobrania dwóch osobnych próbek. Import z pliku zachowuje czas pierwotnego pobrania. Rozgrywki pokazują czas pobrania meczów w strefie Europe/Warsaw. Wskazanie dotyczy pobrania całego zestawu meczów od dostawcy. Poszczególne wyniki mogą pozostać bez zmian między pobraniami.

`SeasonMatchesIT` sprawdza HTTP z prawdziwym PostgreSQL: zakres sezonu, UUID i logo, zmianę czasu, sortowanie, pusty sezon, walidację, nullable pola, 0:0, dogrywkę/karne, ograniczenia roli oraz awarię i odzyskanie bazy. `MatchStatusTest` sprawdza kody i nieznane wartości.
