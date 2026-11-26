# Dotychczasowe reguły LMuML

Stan analizy: 29 października 2026 r.; stary projekt, commit `6b4195e`. Analiza plików źródłowych, bez odczytu produkcyjnej bazy i jej reguł dostępu. Wszystkie poniższe ścieżki odnoszą się do starego repozytorium.

**To opis zastanego zachowania, nie specyfikacja nowej aplikacji.** Rozbieżności i braki nie stają się wymaganiami do odtworzenia.

## Punkty za wynik meczu

`src/Points/countPoints.tsx`, funkcja `countPoints`:

- Dokładny wynik: **10 punktów**.
- W pozostałych przypadkach baza wynosi **10** za trafione 1/X/2 albo **5** za nietrafione.
- Od bazy odejmowane są osobno bezwzględne różnice bramek gospodarzy i gości. Brak dolnego ograniczenia.

| Rzeczywisty wynik | Typ | Obliczenie | Punkty |
| --- | --- | --- | ---: |
| 2:1 | 2:1 | dokładny wynik | 10 |
| 2:1 | 1:0 | 10 − 1 − 1 | 8 |
| 2:1 | 1:1 | 5 − 1 − 0 | 4 |
| 2:1 | 20:20 | 5 − 18 − 19 | −32 |

`functions/index.js`, `createCurrentMatchDayRankig`, stosuje tę samą regułę dla poprawnych liczbowych wyników. Dokładne trafienie zwiększa zarówno licznik dokładnych wyników, jak i 1/X/2.

Różni się otoczenie obliczeń: serwer dopuszcza `FINISHED`, `PAUSED` i `IN_PLAY`, więc ranking obejmuje też wyniki w trakcie gry. Wybiera `score.regularTime`, jeżeli obiekt istnieje; inaczej `score.fullTime`. Nie sprawdza przy tym kompletności obu liczb. Interfejs również preferuje obiekt `regularTime`, ale używa innych warunków uruchomienia obliczeń. Brak jednej jawnej polityki dla `null`, dogrywki i karnych. Źródła widoku: `src/components/MyBets/MyBetsListElement.tsx` i `src/components/PlayersBets/PlayerBets/PlayerBetListElement.tsx`.

## Typowanie, czas i ujawnienie

| Obszar | Potwierdzone zachowanie | Do ustalenia dla nowej wersji |
| --- | --- | --- |
| Termin meczu | `BetMatch` blokuje `SCHEDULED`; dla pozostałych statusów porównuje zegar urządzenia z `utcDate` odczytanym z dokładnością do minuty. Ponawia sprawdzenie co 45 s. | Autorytatywny termin serwera, granica równości i opóźnione żądanie |
| Wynik typu | Pola mają zakres 0–20; kod nie sprawdza całkowitości. Puste pole po konwersji staje się zerem. | Zakres, liczby całkowite i rozróżnienie pustego pola od 0 |
| Zapis | `sendTypes` nadpisuje całość typów gracza w kolejce, kolejno w dwóch ścieżkach, bez wspólnego atomowego zapisu. | Zapis pojedynczego typu lub paczki, usuwanie typu, konflikt dwóch kart przeglądarki |
| Cudze typy | `PlayersBetsList` odczytuje całą kolejkę; `PlayerBetsList` filtruje wyświetlane mecze warunkiem `status != "TIMED"`. | Moment ujawnienia oraz zakres danych i statystyk dostępnych wcześniej |
| Przełożenie | Brak odrębnej reguły obsługującej `POSTPONED`, `CANCELLED` lub ponowne otwarcie typowania. | Czy poprzedni typ zostaje, czy wraca edycja, jak liczyć mecz odwołany |

Źródła: `src/components/BetMatches/BetMatch.tsx`, `BetMatches.tsx`, `BetMatchHomeTeamInput.tsx` i `BetMatchAwayTeamInput.tsx`; `src/components/PlayersBets/PlayersBetsList.tsx` oraz `src/components/PlayersBets/PlayerBets/PlayerBetsList.tsx`.

Samo ukrycie pola w interfejsie nie dowodzi ochrony zapisu lub odczytu w produkcji. W repozytorium nie ma materiału pozwalającego potwierdzić aktualne reguły Firebase.

## Rankingi i korekty

`createCurrentMatchDayRankig` przelicza aktualną kolejkę po aktualizacji `/matches/matches`, wybierając typy z globalnego `/matchDays/currentMatchDay`. Mecz dopasowuje po ID; brakujący mecz pomija.

| Ranking | Kryterium pierwsze | Kryterium drugie |
| --- | --- | --- |
| Główny | suma punktów malejąco | liczba dokładnych wyników malejąco |
| Dokładnych wyników | liczba dokładnych wyników malejąco | suma punktów malejąco |
| 1/X/2 | liczba trafionych 1/X/2 malejąco | suma punktów malejąco |

Po sortowaniu miejsca to `index + 1`: kod nie przydziela wspólnego miejsca pełnym remisom ani jawnego końcowego kryterium rozstrzygającego.

`createGeneralRankigOnUpdate` i `createGeneralRankigOnWrite` w `functions/index.js` składają ranking ogólny z migawki poprzedniej kolejki i bieżącego rankingu. Obie funkcje nasłuchują tej samej ścieżki `lastUpdate`. Nie oznacza to automatycznie podwójnych punktów: zapisują przeliczoną migawkę. Istotny brak: ignorują `context.params.matchDay` i odczytują globalną aktualną kolejkę. Nie ma propagacji korekty historycznej przez późniejsze migawki.

Podobnie `createBetStatistics` pobiera zmienione typy z wydarzenia, ale wynik statystyk zapisuje pod globalną aktualną kolejką. Aktualizuje liczniki 1/X/2; brak osobnej zasady embargo statystyk.

## Konta, identyfikatory i sezon

- Tożsamością gracza jest Firebase Auth UID. Profil `users/{uid}` przechowuje m.in. nick i rolę; nick jest też kopiowany do typów i rankingów.
- Typy: `types/{kolejka}/{uid}/{matchId}` i `usersTypes/{uid}/{kolejka}/{matchId}`. Wyniki dostawcy znajdują się pod `matches/matches`.
- Główne ścieżki typów, rankingów i predykcji tabeli nie zawierają sezonu lub konkursu, mimo że odpowiedzi dostawcy mają metadane sezonu.
- `AdminPanel` ręcznie odświeża mecze/tabelę i zwiększa `currentMatchDay`. Brak osobnego modelu wersji reguł i historii przeliczeń.

Źródła: `src/components/Login/RegisterElement.tsx` (`registerUser`), `src/App.tsx`, `src/components/BetMatches/BetMatches.tsx`, `src/components/AdminPanel/AdminPanel.tsx` i `functions/index.js`. Migracja UID, sezonów i ID meczów wymaga osobnego mapowania; nowy kod nie oznacza zgody na usunięcie historii.

## Predykcja tabeli

`TablePedicator` w `src/components/TablePredicator/TablePredicator.tsx` ma stały termin `2024-10-01T18:45:00` bez wskazania strefy, oceniany zegarem urządzenia. Interfejs wymaga obsadzenia pozycji; przypisanie zajętej pozycji usuwa poprzednie przypisanie. Zapis: `tablePredicator/{uid}`.

Serwerowe `calculateRankingTablePredicator` i `calculatePoints` w `functions/index.js`: **2 punkty** za wspólną strefę 1–8 albo 25–36; dodatkowo **1 punkt** za dokładną pozycję. Dla strefy 9–24 nie ma bonusu strefowego. Przykłady „typ → pozycja rzeczywista”: `4 → 4 = 3`, `1 → 4 = 2`, `12 → 12 = 1`, `10 → 12 = 0`. Widok `MyTable` stosuje zgodną regułę dla kompletnych danych. Ranking jest sortowany po sumie; brak jawnego rozstrzygania remisów.

## Scenariusze do późniejszych testów

1. Punktacja: powyższe przykłady, remis meczu, 0:0, brak typu i ujemne punkty — po potwierdzeniu reguł.
2. Wynik: `regularTime` dostępny, nieobecny lub niekompletny; dogrywka i karne; wynik chwilowy a rozliczenie końcowe.
3. Termin: tuż przed, dokładnie w terminie i po nim; sekundy w dacie; błędny zegar telefonu i żądanie opóźnione w sieci.
4. Zapis: niepełny wynik, ułamek, liczba spoza zakresu, ponowienie żądania, cudzy UID i równoczesna edycja.
5. Ujawnienie: rzeczywista odpowiedź backendu przed/po terminie, w tym statystyki — nie tylko widoczność na ekranie.
6. Ranking: powtórne rozliczenie bez zmiany wyniku, korekta starszej kolejki, pełny remis i dołączenie gracza później.
7. Cykl meczu: przełożenie, odwołanie i zmiana ID dostawcy; dwa sezony z tym samym numerem kolejki.
8. Predykcja tabeli: granice 8/9 i 24/25, kompletność i unikalność pozycji, zmiana tabeli rzeczywistej oraz sezonu.
