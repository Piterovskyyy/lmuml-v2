# Mapowanie danych piłkarskich

Status: model przyjęty 2 listopada 2026 r. w [ADR 0008](../decisions/0008-football-catalog-schema.md). Rozdział własnej kolejki i rundy dostawcy opisuje [ADR 0006](../decisions/0006-betting-rounds.md), a wynik regulaminowy i indywidualny termin — [ADR 0007](../decisions/0007-prediction-score-and-deadline.md).

## Odpowiedzialności modelu

| Dane źródłowe | Znaczenie w LMuML |
| --- | --- |
| `league.id` | Identyfikator rozgrywek u dostawcy, osobny od naszego UUID |
| `league.season` | Rok sezonu w kontekście danych rozgrywek; para ID rozgrywek + rok, bez globalnej unikalności samego roku |
| `fixture.id` | Stabilne powiązanie meczu z dostawcą, osobne od naszego UUID |
| `teams.home/away.id` | Powiązanie drużyn z dostawcą; nazwa lub logo nie są ich identyfikatorem |
| `league.round` | Oryginalna nazwa rundy turnieju, bez konwersji do kolejki graczy |
| `fixture.status.short` | Surowy kod stanu dostawcy; reguły dostępności typowania wymagają osobnego mapowania |
| `fixture.date` / `timestamp` | Jeden moment rozpoczęcia; sprawdzenie zgodności offsetu i sekund epoki podczas mapowania |
| `TBD` / `PST` | Termin może być prowizoryczny lub przełożony; sama obecność daty nie otwiera typowania |
| `score.halftime/fulltime/extratime/penalty` | Cztery niezależne, nullable pary wyników; bez zgadywania wyniku do punktacji |
| `null` przy bramkach | Brak danych, bez zamiany na zero |
| Własna kolejka typowania | Zestaw meczów zarządzany w LMuML; aktualizacja daty lub rundy API sama nie zmienia przypisania |

Rozgrywki, sezon, drużyna i mecz mają własną tożsamość aplikacji. Powiązania z API służą synchronizacji, nie są kontraktem naszego frontendu. Pierwszy model katalogu przyjęto poniżej; kontrakt HTTP i własne kolejki są osobnymi etapami.

## Kolejność weryfikacji modelu

1. Sprawdzić metadane i pokrycie ligi/sezonu dostępnego na koncie Free, a następnie jej mecze. Nie zakładać dostępu Free do bieżącego sezonu.
2. Porównać typy z rzeczywistą odpowiedzią, w tym rundą pucharową, zakończonym meczem i dogrywką/karnymi, jeśli występują w dostępnym zbiorze.
3. Oznaczyć przypadki niewystępujące w próbce jako niezweryfikowane. Dane historyczne nie potwierdzą samodzielnie zachowania live i przełożeń.
4. Ustalić zasady terminu i wyniku oraz przypisania/przenoszenia meczu między własnymi kolejkami.
5. Przejrzeć DDL i wprowadzić nową migrację. Nie przerabiać wykonanej V1 ani automatycznie odtwarzać niezatwierdzonego endpointu `matchdays`.

Klient dostawcy jest warstwą transportową. Nie wyznacza tych reguł i nie zapisuje jeszcze żadnych danych do PostgreSQL.

## Wynik pierwszego sprawdzenia — 2 listopada 2026 r.

Konto Free udostępniło metadane i 279 meczów Ligi Mistrzów sezonu `2024`. Wszystkie odpowiedzi przeszły konwersję DTO; zgadzały się liga/sezon oraz daty i znaczniki czasu. W zbiorze są statusy `FT`, `AET` i `PEN`, kwalifikacje, faza ligowa i fazy pucharowe. Są to dane historyczne; nie sprawdzono `TBD`, przełożeń ani zmian live.

Przykład z odpowiedzi dostawcy: Fenerbahçe–Lille, fixture `1271721`, ma `score.fulltime` 1:0, `score.extratime` 0:1 oraz `goals` 1:1. Potwierdza to, że nie można wybierać dowolnego pola „wynik” do rozliczania typów. Użytkownik wybrał następnie wynik po regulaminowym czasie: dla tego meczu 1:0. Próbka nie dowodzi semantyki wszystkich przyszłych stanów.

[Pełniejsze wnioski i ograniczenia](../research/2026-10-31-api-football.md#pierwsza-próbka-z-konta-free--2-listopada-2026-r). Model poniżej został przyjęty i wprowadzony nową migracją V2; treść V1 pozostała bez zmian. Kolejny krok to importer, bez automatycznego przypisywania do kolejek.

## Pierwszy katalog meczów

| Tabela | Odpowiedzialność i przykład |
| --- | --- |
| `competitions` | Jedne rozgrywki niezależnie od sezonu, np. Liga Mistrzów z API ID 2; opcjonalny adres logo |
| `seasons` | Konkretna edycja rozgrywek, np. rok 2024; unikalna para rozgrywki + rok |
| `teams` | Drużyna z własnym UUID, oddzielnym ID API i opcjonalnym adresem logo, bez duplikowania jej w każdym meczu |
| `matches` | Mecz, uczestnicy, sezon, termin, oryginalny status/runda i osobne wyniki |

Relacje: rozgrywki mają wiele sezonów, sezon ma wiele meczów, a mecz wskazuje osobno gospodarza i gościa z tabeli drużyn. Wspólny rok `2024` może wystąpić w różnych rozgrywkach. Nazwy nie są identyfikatorami, a zmiana nazwy nie tworzy nowej drużyny.

Pierwszy katalog nie przypisuje automatycznie meczów do kolejek typowania. Import może zachować wszystkie 279 meczów, a późniejszy mechanizm własnych kolejek wskaże te, które biorą udział w zabawie. Nie ustalamy tu jeszcze, czy mecz może należeć do więcej niż jednej kolejki.

Przechowujemy surowy tekst statusu i rundy, nullable datę oraz pięć niezależnych par bramek: `goals` i cztery części `score`. Brak danych pozostaje `NULL`. Nie dodajemy obliczonych punktów ani reguł edycji do tabeli meczów.

[Migracja V2](../../backend/src/main/resources/db/migration/V2__align_schedule_with_api_football.sql) rozwija V1 bez zmiany jej treści. Jeśli katalog V1 zawiera jakiekolwiek rekordy, zatrzymuje się przed DDL: potrzebne są jawne mapowania ID, starych kolejek i statusów. Nie usuwamy danych ani nie wymyślamy identyfikatorów. Pierwsza migracja nie importuje meczów; po niej katalog pozostaje pusty do uruchomienia przyszłego importera.

[V3](../../backend/src/main/resources/db/migration/V3__add_catalog_logo_urls.sql) dodaje `teams.logo_url` i `competitions.logo_url`. API zwraca te adresy już w danych uczestników meczu i rozgrywek. Importer zapisze otrzymane URL-e. Planowany widok zachowa nazwę drużyny także przy braku lub awarii obrazu.

[Audyt pozostałych metadanych](provider-data-retention.md) doprowadził do przyjęcia [ADR 0009](../decisions/0009-provider-metadata-and-snapshots.md) i V4: danych sędziego/stadionu/minuty/zwycięzcy, typu/kraju rozgrywek oraz dat/bieżącej edycji/coverage sezonu. Pola są opcjonalne i nie zgadujemy brakujących wartości.

## Pełna odpowiedź źródłowa

Osobna `api_football_snapshots` przechowuje ostatni kompletny JSONB dla `(endpoint, league_id, season)`, wraz z `captured_at`. Pierwsze dwa obsługiwane endpointy to metadane rozgrywek i sezonowa lista meczów. Dla naszego przykładu po udanym imporcie będą to dwa rekordy źródłowe, obok 279 osobnych meczów w katalogu; przed uruchomieniem importera tabele są puste.

Magazyn odrzuca błędne koperty, częściowe odpowiedzi, dodatkowe filtry i niezgodny zakres. Nowsza generacja zastępuje poprzednią; ponowienie tej samej jest dozwolone. Snapshot nie jest samodzielnym commitem: błąd katalogu lub starsza odpowiedź wycofują wspólną transakcję. [Importer z ADR 0010](../decisions/0010-offline-catalog-import.md) zasilił lokalny katalog: 1 rozgrywka, 1 sezon, 81 drużyn, 279 meczów, 2 snapshoty. V5 chroni też nowsze wspólne metadane drużyn i rozgrywek przed starszymi obserwacjami z innych sezonów.
