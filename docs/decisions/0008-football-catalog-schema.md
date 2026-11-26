# ADR 0008 — katalog rozgrywek, sezonów, drużyn i meczów

Status: przyjęta 2 listopada 2026 r., po przeglądzie modelu i wyborze użytkownika.

## Decyzja

Katalog piłkarski ma cztery tabele: `competitions`, `seasons`, `teams` i `matches`. Rozgrywki mają wiele sezonów; sezon identyfikuje para rozgrywki + rok rozpoczęcia. Mecz wskazuje sezon i dwie drużyny. Każdy obiekt ma UUID aplikacji; rozgrywki, drużyny i mecze mają osobno unikalne dodatnie ID API-Football. Rok nie jest globalnym ID sezonu.

Przechowujemy tekstowy status i rundę dostawcy, nullable termin oraz pięć niezależnych par wyników: `goals`, `halftime`, `fulltime`, `extratime` i `penalty`. Nieznany status pozostaje tekstem; brak wyniku nie staje się zerem. Zasady typowania i rozliczania należą do osobnego przypadku użycia, zgodnie z [ADR 0007](0007-prediction-score-and-deadline.md).

Importowane mecze początkowo nie są przypisywane do własnych kolejek graczy. Kolejka i jej członkostwo powstaną wraz z tą funkcją, bez konwersji tekstu rundy API lub daty do numeru kolejki. Nie ustalamy jeszcze kardynalności członkostwa.

## Zmiana istniejącego schematu

V1 pozostaje niezmieniona. [V2](../../backend/src/main/resources/db/migration/V2__align_schedule_with_api_football.sql) rozwija jej tabele przez `ALTER`, dodaje rozgrywki i usuwa demonstracyjne założenia: wymagany `matchday`, wyłączny `SCHEDULED` i obowiązkowy termin. `status` otrzymuje nazwę `provider_status` i nie ma domyślnej wartości.

V2 wolno przeprowadzić automatycznie wyłącznie na pustym katalogu V1. Jeśli jakakolwiek z tabel sezonów, drużyn lub meczów zawiera rekordy, migracja zatrzymuje się przed DDL. Potrzebny jest wtedy jawny plan mapowania identyfikatorów, sezonu, starego przypisania do kolejki i statusu. Nie usuwamy rekordów, aby ominąć ten warunek, i nie zgadujemy ID dostawcy. Ten warunek dotyczy przejścia z demonstracyjnej V1; późniejsze zwykłe uruchomienia przy wykonanej V2 nie wymagają pustych tabel.

PostgreSQL wykonuje tę migrację transakcyjnie. Konto aplikacji zachowuje wyłącznie SELECT, również nowej tabeli rozgrywek; import i jego uprawnienia zapisu są osobnym etapem. Migracja nie pobiera danych, nie tworzy przykładowych rekordów i nie wykonuje punktacji.

## Konsekwencje

- Te same drużyny mogą wystąpić w wielu meczach bez kopiowania ich tożsamości, a ten sam rok w różnych rozgrywkach.
- Nie wymuszamy unikalnej pary drużyn, równości wyników ani kompletności nullable par dostawcy.
- Dla znanych wartości bramek baza odrzuca liczby ujemne. Kompletność wyniku do rozliczenia sprawdzi logika aplikacji.
- Indeks `(season_id, kickoff_at, id)` obsługuje sezon i stabilne porządkowanie; własne kolejki dostaną indeksy wraz ze swoim modelem.
- Importer, informacja o świeżości danych, kontrakt HTTP i funkcje typowania pozostają do kolejnych małych etapów.

Aktualizacja V4: [ADR 0009](0009-provider-metadata-and-snapshots.md) rozszerza metadane i dodaje osobną tabelę ostatnich odpowiedzi JSONB. Cztery tabele pozostają modelem katalogu; snapshot jest wewnętrznym zapisem danych źródłowych dla importera.

## Metadane logo — V3

[V3](../../backend/src/main/resources/db/migration/V3__add_catalog_logo_urls.sql) dodaje nullable `logo_url` do drużyn i rozgrywek. Lista meczów ma już `teams.home.logo` i `teams.away.logo`, a metadane rozgrywek — `league.logo`. W zachowanej próbce każda z 81 unikalnych drużyn ma taki adres, bez potrzeby dodatkowego odczytu endpointu drużyn.

Przyszły importer zachowa adres zwrócony przez dostawcę. Baza przechowuje URL, nie pliki obrazów; migracja nie pobiera obrazów i nie uzupełnia rekordów. `NULL` oznacza brak adresu. Pobieranie/caching plików i widok zastępczy należą do osobnych funkcji. Nie zmienia to opisanych w [raporcie](../research/2026-10-31-api-football.md) ograniczeń wykorzystania cudzych znaków i obrazów.

Test przejścia z wypełnionej V2 do V3 potwierdził zachowanie istniejących rekordów oraz odczyt obu nowych kolumn przez runtime. Pełne `Maven verify` przeszło: 65 jednostkowych i 14 integracyjnych, bez pominięć. V3 wykonano też na lokalnej bazie, bez edycji V1/V2 i bez importu danych.

## Weryfikacja etapu

Pełne `Maven verify` przeszło na Windows: 65 testów jednostkowych i 13 integracyjnych, bez pominięć. Dziesięć przypadków migracyjnych obejmuje ograniczenia katalogu, niezależne nullable wyniki, nieznany status, strefy czasu, uprawnienia i checksum. Trzy scenariusze z zastanymi rekordami V1 potwierdzają odmowę V2 oraz zachowanie danych, starych pól i historii bez częściowego DDL.

Po sprawdzeniu pustego lokalnego katalogu i zachowaniu jego kopii uruchomiono profil `migration`. V2 wykonała się poprawnie na `lmuml_dev`; historia zawiera sukces V1 i V2, cztery tabele mają po 0 rekordów, runtime ma SELECT katalogu i nie ma praw zapisu ani dostępu do historii. Nie wykonywano importu, dodatkowych żądań do API ani zmian w starej aplikacji.
