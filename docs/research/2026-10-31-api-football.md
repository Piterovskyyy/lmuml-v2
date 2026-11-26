# API-Football — dane, możliwości i wpływ na LMuML

Stan: 31 października 2026 r. Analiza oficjalnej dokumentacji i poradników API-SPORTS, odnoszących się do wersji 3.9.3. To rozpoznanie możliwości i kontraktów transportowych, nie wdrożenie wszystkich funkcji ani zakup planu.

## Zakres i wiarygodność

Strony referencyjne oraz wskazany plik OpenAPI były blokowane przy bezpośrednim pobieraniu przez Cloudflare. Odczyt obejmuje indeksowane fragmenty oficjalnej dokumentacji oraz dostępne oficjalne poradniki, w tym przykłady JSON. Nie wykonano zapytań uwierzytelnionych, nie sprawdzono konta ani kompletności danych konkretnego sezonu Ligi Mistrzów. Typy nie są automatyczną generacją całej specyfikacji.

Podstawowe źródła: [referencja](https://www.api-football.com/documentation-v3), [oficjalny poradnik wszystkich rodzin endpointów](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide), [przepływ danych ligi z przykładami odpowiedzi](https://www.api-football.com/news/post/how-to-get-all-data-from-a-league-with-api-football).

## Mapa możliwości

Poniższe 39 ścieżek (38 danych i operacyjne `/status`) obejmuje rodziny znalezione w analizowanych materiałach. Zastosowania są propozycjami LMuML, nie zatwierdzonym backlogiem.

| Rodzina | Ścieżki GET | Potencjalna wartość dla LMuML |
| --- | --- | --- |
| Słowniki i rozgrywki | `/timezone`, `/countries`, `/leagues`, `/leagues/seasons` | Wybór rozgrywek i sezonu, dostępność bloków danych |
| Drużyny i stadiony | `/teams`, `/teams/statistics`, `/teams/seasons`, `/teams/countries`, `/venues` | Profil zespołu, stadion, forma przed typowaniem |
| Terminarz | `/fixtures/rounds`, `/fixtures`, `/fixtures/headtohead` | Mecze, rundy turnieju, wyniki, porównanie bezpośrednich spotkań |
| Centrum meczu | `/fixtures/statistics`, `/fixtures/events`, `/fixtures/lineups`, `/fixtures/players` | Oś zdarzeń, porównanie statystyk, ustawienie i składy, występy zawodników |
| Tabele | `/standings` | Aktualna tabela i powiązanie z predykcją końcowych miejsc |
| Kontekst przedmeczowy | `/injuries`, `/predictions`, `/coachs` | Nieobecni, trener i opcjonalne porównanie graczy z prognozą algorytmu |
| Zawodnicy | `/players/profiles`, `/players/seasons`, `/players`, `/players/squads`, `/players/teams` | Profile, składy, kariera i statystyki sezonowe |
| Klasyfikacje | `/players/topscorers`, `/players/topassists`, `/players/topyellowcards`, `/players/topredcards` | Strzelcy, asysty, kartki |
| Historia | `/transfers`, `/trophies`, `/sidelined` | Transfery, osiągnięcia i historia niedostępności |
| Kursy | `/odds`, `/odds/mapping`, `/odds/bookmakers`, `/odds/bets`, `/odds/live`, `/odds/live/bets` | Opcjonalny kontekst kursów; nie jest potrzebny do naliczania punktów |
| Operacyjne | `/status` | Stan subskrypcji i zużycia; dane wewnętrzne |

## Jak wykorzystujemy dane w LMuML

| Dane API-Football | Widok w LMuML | Stan i warunek |
| --- | --- | --- |
| `/leagues`, `/fixtures` | Wybór sezonu, terminarz, wyniki i drabinka. Z wyników liczymy też gole, bilanse, punkty i przybliżoną pozycję klubu po pełnych kolejkach. | Działa na zaimportowanym sezonie. Nowe wykresy czytają te same wyniki z naszej bazy. |
| `/standings` | Oficjalna tabela fazy ligowej i jej skrót na Starcie. | Działa jako najnowsza tabela. Wykres oficjalnych pozycji po kolejkach wymaga zachowywania kolejnych migawek od dostawcy. Endpoint nie przyjmuje parametru kolejki ani daty tabeli. |
| `/fixtures/statistics` | Porównanie obu drużyn w szczegółach meczu: strzały, strzały celne, posiadanie, rzuty rożne, faule i obrony bramkarza. | Działa dla spotkań z ręcznie zaimportowanymi danymi. Potwierdzone na finale PSG–Inter 2024/25. Pokrycie pozostałych spotkań zależy od dostawcy. |
| `/fixtures/events` | Przebieg meczu z bramkami, kartkami, zmianami i decyzjami VAR. | Działa po ręcznym imporcie wybranego meczu. Próbka finału PSG–Inter 2024/25 zawiera 20 zdarzeń. |
| `/fixtures/lineups` | Ustawienia, trenerzy, pierwsze składy i ławki rezerwowych w szczegółach meczu. | Działa po ręcznym imporcie. Finał PSG–Inter 2024/25 zawiera obie jedenastki i pełne pozycje do rozrysowania ustawienia. |
| `/fixtures/players` | Minuty, oceny dostawcy, gole, asysty, strzały, podania, odbiory i obrony poszczególnych zawodników. | Działa po ręcznym imporcie. Próbka finału PSG–Inter 2024/25 zawiera 45 zawodników, w tym wpisy bez oceny lub minut. |
| `/teams/statistics` | Profil klubu, forma, gole w przedziałach minut i różnica między występami u siebie a na wyjeździe. | Propozycja rozszerzenia zakładki Statystyki. Punkty, wyniki i gole z dostępnych meczów już można pokazać bez nowego importu. |
| `/players/topscorers`, `/players/topassists` | Klasyfikacje strzelców i asystujących w sezonie. | Opcjonalne uzupełnienie statystyk rozgrywek. |

Statystyki trafień, aktywność rund i ranking graczy liczymy z typów zapisanych w LMuML. Dane dostawcy pobieramy centralnie. Przed włączeniem dodatkowego importu sprawdzamy `coverage` i próbki z docelowej edycji. [Dokumentacja API-Football](https://www.api-football.com/documentation-v3)

Próbka `/fixtures/events` dla finału potwierdziła, że przy zmianie `player` opisuje schodzącego, a `assist` wchodzącego. Dla zmiany Doué–Barcola API-Football zwraca 67. minutę, a raport meczowy UEFA podaje 66. minutę. Oś przedstawia czas z API-Football. [Raport meczowy UEFA](https://www.uefa.com/newsfiles/UCL/2025/2044466_FR.pdf)

## Dostępność i koszty

`/leagues` zwraca `coverage` dla sezonu. Pokrycie nie gwarantuje kompletności każdego meczu; brak danych wymaga osobnego stanu interfejsu. Najpierw trzeba odczytać pokrycie docelowej ligi/sezonu. [Strategia dostawcy](https://www.api-football.com/news/post/how-to-optimize-api-sports-calls-and-quota-usage).

W bezpośrednim cenniku Pro kosztuje **19 USD miesięcznie** i obejmuje **7500 zapytań dziennie**. Plany obejmują wszystkie endpointy, ale Free ogranicza sezony. Nie przeliczamy tego na stałą cenę PLN i nie uznajemy samego API za cały koszt utrzymania. [Cennik](https://www.api-football.com/pricing).

Limity Pro obejmują też 300/min oraz 5/s. Trzeba odczytywać nagłówki dzienne/minutowe i obsługiwać `429` przez rozłożenie ruchu i backoff. `/status` nie zużywa dziennej puli, lecz zawiera dane konta. [Opis limitów](https://www.api-football.com/news/post/how-ratelimit-works).

Warunki bezpośredniego konta i RapidAPI różnią się. Bezpośredni plan jest przedpłacony, ma reset dobowy o 00:00 UTC i zatrzymuje żądania po wyczerpaniu puli; tych założeń nie przenosimy na RapidAPI. Dostęp do obrazów nie jest ogólną licencją do znaków i logo. [Warunki](https://www.api-football.com/terms).

## Świeżość i historia

Wartości podawane przez dostawcę są orientacyjne, zależne od rozgrywek; nie są SLA ani naszym docelowym harmonogramem odpytywania.

| Dane | Orientacyjna aktualizacja u dostawcy |
| --- | --- |
| Mecze i zdarzenia | 15 sekund |
| Statystyki meczu i zawodników | 1 minuta |
| Składy | 15 minut; publikacja przed meczem zależy od pokrycia |
| Tabele i prognozy | 1 godzina |
| Kontuzje | 4 godziny |
| Statystyki sezonowe zespołu | Dwa razy dziennie |
| Kursy przedmeczowe | 3 godziny; historia ograniczona do 7 dni |
| Kursy live | 5–60 sekund; brak późniejszej historii endpointu live |

Stare składy czy kursy mogą być niedostępne nawet przy dostępie do samego endpointu. Wymagania historyczne trzeba ustalić przed projektowaniem archiwum. [Referencja częstotliwości](https://www.api-football.com/documentation_v3), [omówienie endpointów](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide).

## Jak korzystać szeroko bez marnowania puli

To propozycja architektury przyszłego importera:

1. Backend pobiera dane centralnie dla aplikacji. Przeglądarka czyta nasze API, bez klucza dostawcy.
2. Import rozróżnia dane rzadkozmienne, terminarz, mecze aktywne i korekty wyników.
3. Buforowanie oraz łączenie równoczesnych żądań zapobiegają pobieraniu tego samego zestawu dla każdego gracza.
4. Paginacja jest jawna; import jednej strony nie oznacza kompletnego zbioru.
5. Niepowodzenie nie nadpisuje ostatnich dobrych danych pustą listą. Widok pokazuje czas aktualizacji i ewentualny brak świeżych danych.
6. Budżet żądań zostawia rezerwę na korekty, paginację i ręczną diagnostykę.

Przykład własnego obliczenia: jedno centralne odpytywanie co minutę przez 4 godziny to 240 żądań. Uruchomienie go niezależnie dla 50 użytkowników dałoby 12 000 żądań. To dwa różne mechanizmy, mimo identycznego widoku użytkownika.

Szczegóły wybranych meczów można pobierać z dołączonymi zdarzeniami, składami i statystykami. Parametr `ids` pozwala grupować do 20 spotkań, o ile plan obsługuje ten wariant. To nie znaczy, że każde zapytanie o listę meczów zawiera wszystkie szczegóły. [Pobieranie danych zbiorczo](https://www.api-football.com/news/post/how-to-get-all-fixtures-data-from-one-league), [aktualny przepływ ligi](https://www.api-football.com/news/post/how-to-get-all-data-from-a-league-with-api-football).

Na koncie Free potwierdzono `/fixtures?id=1299032` na zakończonym meczu Barcelona–Bayern 2024/25. Jedna odpowiedź zawierała `events`, `lineups`, `statistics` i `players`. Tryb `--fixture-details` zapisuje te bloki do istniejących tabel. [Instrukcja pobrania szczegółów](../development/local-environment.md#szczegóły-spotkań)

24 listopada 2026 r. zapytanie `/fixtures?ids=1371730-1371731` na planie Free zwróciło HTTP 200, zero meczów i błąd `plan`. Przy planie z dostępem do `ids` polecenie `--fixture-details` dzieli identyfikatory na paczki po maksymalnie 20 zgodnie z limitem dostawcy. Na Free tryb `--sequential` wykonuje jedno żądanie `/fixtures?id=…` na mecz. [Przewodnik API-Football](https://www.api-football.com/news/post/how-to-get-all-data-from-a-league-with-api-football)

## Pułapki kontraktu

| Dane | Konsekwencja dla kodu |
| --- | --- |
| `parameters` i `errors` mogą mieć kształt tablicy lub obiektu | Transport zachowuje JSON; walidacja odpowiedzi będzie odrębną odpowiedzialnością klienta |
| `response` zależy od endpointu | Generyczna koperta dla typu listowego lub obiektowego |
| `results` i `paging` | Liczba bieżącej strony i osobna informacja o kolejnych stronach |
| Wyniki `null` | Brak wyniku pozostaje brakiem, bez konwersji na 0:0 |
| `league.round` | Tekst, np. runda pucharowa; bez automatycznej konwersji do numeru kolejki typowania |
| `status.short` | Zachowanie oryginalnego kodu, także przyszłej nieznanej wartości |
| `date` i `timestamp` | Data z offsetem oraz epoch w sekundach; sprawdzenie zgodności momentu przy mapowaniu |
| `statistics.value` | Liczba, tekst procentowy lub `null`; zachowanie oryginalnego typu |
| `standings` | Lista grup tabel, bez spłaszczania do jednego rankingu |

Kształty koperty i mieszanych statystyk opisuje [poradnik](https://www.api-football.com/news/post/how-to-get-started-with-api-football-the-complete-beginners-guide); obiekt błędu pokazuje [opis 429](https://www.api-football.com/news/post/how-ratelimit-works). Zagnieżdżone dane meczu pokazuje [oficjalny raport przykładowy](https://www.api-football.com/news/post/fifa-world-cup-2026-group-stage-recap-and-complete-match-reports-with-api-football).

## Luki demonstracyjnej V1 przed korektą

V1 jest szkieletem demonstracyjnym, nie zatwierdzonym modelem docelowego importu. Bez zmian pozostaje jej historia; ewentualna korekta schematu otrzyma nową migrację.

Poniższe problemy z konstrukcją schematu adresuje przyjęta później [V2 i ADR 0008](../decisions/0008-football-catalog-schema.md). Nie oznacza to automatycznego rozstrzygnięcia wszystkich reguł typowania i rozliczania.

- `matchday INTEGER` nie może oznaczać automatycznie tekstowej rundy API. Stary frontend grupuje typowanie po własnych datach `matchDays`, co trzeba odróżnić od rundy rozgrywek.
- `status = SCHEDULED` nie obsługuje cyklu dostawcy. Dokumentacja wymienia m.in. `TBD`, `NS`, `1H`, `HT`, `2H`, `ET`, `BT`, `P`, `SUSP`, `INT`, `FT`, `AET`, `PEN`, `PST`, `CANC`, `ABD`, `AWD`, `WO` i `LIVE`.
- Przy `TBD` niepusta data może być prowizoryczna. Samo `NOT NULL` nie potwierdza terminu typowania.
- Trzeba jawnie powiązać rozgrywki, rok sezonu i identyfikatory dostawcy z naszymi UUID.
- Wyniki `halftime`, `fulltime`, `extratime` i `penalty` zachowujemy osobno. Nie zatwierdzono jeszcze, jak wybrać wynik do punktacji ani czy można go wyliczyć z pozostałych pól.

Pierwsze trzy kwestie wynikają z [referencji](https://www.api-football.com/documentation_v3) i analizy starego kodu. Nie potwierdzono tezy, że drużyny muszą rutynowo mieć puste identyfikatory; takiej reguły nie wprowadzamy na podstawie przypuszczenia.

## Zakres przygotowanych typów

Pakiet `pl.lmuml.football.apifootball.dto` opisuje kopertę, mecze, rozgrywki/pokrycie, drużyny, tabele, zdarzenia, składy i statystyki. Nie jest modelem encji bazy ani DTO naszego publicznego API. Zagnieżdżone typy mają znaczenie w kontekście danej odpowiedzi.

Dynamiczne fragmenty zachowują `JsonNode`; szczegółowe statystyki zawodników w rozszerzonej odpowiedzi meczu nie są jeszcze rozpisane na osobne pola. Pozostałe rodziny, m.in. kontuzje, prognozy, transfery i kursy, są w mapie możliwości, lecz nie mają jeszcze kompletnych kontraktów Java. Dodatkowe pola dostawcy są tolerowane, co nie oznacza ich pełnego typowania.

Nie zamodelowano jeszcze dodatkowych wariantów `half=true` statystyk i `dates=true` rund. Pola poza zadeklarowanym kontraktem są ignorowane; jedynie fragmenty oznaczone jako `JsonNode` zachowują swój nieopisany szczegółowo JSON. Same DTO nie sprawdzają semantycznej poprawności odpowiedzi ani nie przeliczają wyniku do punktacji.

Testy używają własnych syntetycznych przykładów opisanych kształtów. Nie dowodzą zgodności z rzeczywistym kontem, pokryciem ani kompletną specyfikacją.

## Weryfikacja etapu DTO — 31 października

Wykonano `Maven verify` na Windows: 10 nowych testów jednostkowych deserializacji i 8 istniejących testów integracyjnych przeszło, bez pominięć. Testy obejmują m.in. typy koperty, wartości nullable, wyniki, statystyki, flagi pokrycia, grupy tabel i zagnieżdżone szczegóły meczu. Nie dodano nowych zależności. Nie uruchomiono klienta dostawcy ani importu do bazy.

## Aktualizacja — 2 listopada 2026 r.

Kolejki typowania mają własny model i odwołują się do meczów z katalogu. Pierwszy klient HTTP obsługiwał `leagues` oraz `fixtures`, z walidacją koperty, metadanymi limitów i testami lokalnego transportu. Integracja pozostaje domyślnie wyłączona.

Pełne `Maven verify` przeszło: 48 testów jednostkowych (31 klienta, 7 konfiguracji i 10 DTO) oraz 8 integracyjnych z PostgreSQL, bez pominięć. Przeszło również 14 testów skryptów Node. Testy klienta nie zużywają puli dostawcy.

[Zasady kolejki](../decisions/0006-betting-rounds.md), [propozycja mapowania przed DDL](../planning/football-data-model.md), [konfiguracja klienta](../development/local-environment.md#klient-api-football). Pokrycie rzeczywistego konta Free nadal wymaga sprawdzenia, szczególnie dostępne sezony i rodzaje danych.

## Następny krok

Jednorazowy odczyt metadanych i meczów został wykonany poniżej. Przyjęto wynik regulaminowy, indywidualny termin meczu i katalog czterech tabel; kolejne migracje dodały metadane i snapshoty. [Importer z ADR 0010](../decisions/0010-offline-catalog-import.md) zasilił lokalny katalog z zachowanych plików bez kolejnych żądań. [Odczyt REST sezonu](../development/season-matches-api.md) korzysta już z katalogu; następny etap to pierwszy widok mobilny. Przypisanie do własnych kolejek, przełożenia i rozliczenia wyjątkowe wymagają osobnego doprecyzowania. Tabele turnieju i pozostałe endpointy dostawcy są poza obecnym klientem.

## Pierwsza próbka z konta Free — 2 listopada 2026 r.

Wykonano dokładnie dwa żądania: `leagues?id=2&season=2024`, a po przerwie `fixtures?league=2&season=2024`. Oryginalne JSON-y i metadane pozostają w lokalnym, ignorowanym katalogu próbek. Nie zapisano danych do PostgreSQL. JAR zakończył się kodem 0, bez serwera HTTP i datasource. Nie sprawdzano innych sezonów ani nie uruchamiano płatnego planu.

| Sprawdzenie | Obserwacja |
| --- | --- |
| Rozgrywki i sezon | UEFA Champions League, ID 2, rok sezonu 2024; zakres metadanych 2024-07-09–2025-05-31 |
| Liczba meczów | 279, jedna strona; wszystkie przeszły konwersję istniejących DTO |
| Statusy | 269 `FT`, 5 `AET`, 5 `PEN` |
| Rundy | Kwalifikacje, play-offy, `League Stage - 1` do `8`, fazy pucharowe; tekst pozostaje odrębny od kolejki typowania |
| Daty i identyfikatory | W tej próbce brak pustych dat/ID drużyn i brak rozbieżności `date` z `timestamp` w sekundach |
| Wariant odpowiedzi | Sezonowa lista ma fixture/league/teams/goals/score; nie zawiera szczegółów events/lineups/statistics/players |
| Pokrycie z metadanych | Zdarzenia, składy, statystyki, tabele, zawodnicy, kontuzje i prognozy oznaczone true; kursy false. To deklaracja coverage, bez testowania tych endpointów i każdego meczu |

Przykład znaczenia oddzielnych wyników: Fenerbahçe–Lille, fixture `1271721`, status `AET`: `fulltime` 1:0, `extratime` 0:1, `goals` 1:1. Jest to obserwacja konkretnego meczu z próbki; nie wprowadzamy na jej podstawie automatycznej reguły rozliczania wszystkich stanów. Nadal trzeba wybrać regułę produktu i zweryfikować brakujące przypadki.

W kolejnym ustaleniu [ADR 0007](../decisions/0007-prediction-score-and-deadline.md) przyjął typowanie wyniku po 90 minutach z doliczonym czasem, a każdy mecz ma własny termin według backendu. Nie zaimplementowano jeszcze rozliczeń; reguły przełożeń i wyjątkowych rozstrzygnięć pozostają otwarte.

Próbka nie zawiera live, `TBD`, `PST`, odwołania ani nieznanego statusu; nie potwierdza aktualizacji w czasie i korekt. Nie zweryfikowano tabel, zdarzeń, składów, statystyk ani bieżącego sezonu na tym koncie. Syntetyczne testy pozostają potrzebne dla błędów i nieobecnych wariantów.

Po zmianie klienta i dodaniu komendy pełne `Maven verify` przeszło: 65 testów jednostkowych i 8 integracyjnych z PostgreSQL, bez pominięć; dodatkowo 19 testów Node. Nowe testy sprawdzają m.in. oryginalne bajty z nieopisanymi polami, zachowanie próbki przy błędzie DTO, kolejność/limit wywołań, brak sezonu i quota, przerwanie, brak nadpisywania oraz profil bez bazy. Żaden test nie korzysta z rzeczywistego klucza; dwa wyżej opisane odczyty to oddzielna kontrolowana weryfikacja.
