# ADR 0007 — wynik typu i indywidualny termin meczu

Status: przyjęta 2 listopada 2026 r.

## Decyzja

Typujemy wynik po regulaminowych 90 minutach wraz z doliczonym czasem. Dogrywka i seria rzutów karnych nie zmieniają wyniku służącego rozliczeniu tego typu. Oryginalne wyniki dostawcy pozostają osobno, aby widok mógł pokazać pełny przebieg spotkania.

Każdy mecz zamyka typowanie indywidualnie o zapisanym terminie rozpoczęcia, według zegara backendu. Dla znanego i dopuszczonego terminu warunek czasowy to `serverNow < kickoffAt`; dokładnie w terminie i później zapis jest odrzucany. Zegar telefonu i stan przycisku nie są podstawą decyzji backendu. Ta decyzja nie przesądza jeszcze technicznego momentu pomiaru czasu w obsłudze żądania i transakcji.

Przed zamknięciem meczu gracz może zapisać pierwszy typ i zmieniać wcześniej zapisany wynik. Każdy zaakceptowany zapis zastępuje bieżący typ tego gracza na dany mecz. Po zamknięciu obowiązuje ostatni zaakceptowany wynik.

## Zapis kolejki

Gracz może zapisać dowolny komplet uzupełnionych typów z opublikowanej kolejki. Backend odczytuje jego identyfikator z sesji. PostgreSQL przechowuje jeden wynik dla pary gracz i mecz. W razie blokady pojedynczego spotkania serwer zapisuje pozostałe dopuszczone typy i zwraca informację o odrzuconym meczu.

Zapis wymaga statusu `NS` oraz terminu w przyszłości. Przy przełożeniu istniejący typ pozostaje w bazie. Edycja staje się ponownie dostępna, gdy dostawca potwierdzi nowy termin w przyszłości i przywróci status `NS`.

## Punktacja meczu

Punktacja zachowuje regułę dotychczasowej gry. Dokładny typ daje 10 punktów. Baza wynosi 10 punktów za trafienie zwycięzcy lub remisu i 5 punktów za nietrafienie. Od bazy odejmujemy bezwzględną różnicę bramek każdej drużyny. Wynik punktowy może być ujemny. Przy wyniku meczu 2:1 typ 1:0 daje 8 punktów, a typ 1:1 daje 4 punkty.

Backend rozlicza zapisane typy dla statusów `FT`, `AET` i `PEN`, gdy dostępne są obie liczby bramek po regulaminowym czasie gry. Pole `points` w odczycie typu ma wartość `null`, dopóki typ nie podlega rozliczeniu. Brak typu oznacza brak punktów. Lista „Moje typy” oblicza punkty przy odczycie, więc po odświeżeniu uwzględnia korektę wyniku w katalogu. Punktacja korzysta z istniejącego wyniku meczu i zapisanego typu w jednym odczycie z bazy.

## Ranking kolejki i sezonu

Ranking uwzględnia rozliczone typy w wybranej opublikowanej kolejce albo we wszystkich opublikowanych kolejkach sezonu. Gracz trafia do rankingu po rozliczeniu pierwszego typu w danym zakresie.

| Klasyfikacja | Pierwsze kryterium | Drugie kryterium |
| --- | --- | --- |
| Punkty | Suma punktów | Dokładne wyniki |
| Dokładne wyniki | Liczba dokładnych wyników | Suma punktów |
| Trafione 1/X/2 | Liczba trafionych zwycięstw gospodarzy, remisów lub zwycięstw gości | Suma punktów |

W każdym kryterium wyższy wynik daje lepsze miejsce. Gracze z identycznymi wartościami obu kryteriów w danej klasyfikacji zajmują wspólne miejsce, np. 1., 1., 3. Dokładny wynik jest również trafionym typem 1/X/2.

Pełny ranking jest dostępny po zalogowaniu i pokazuje nazwy graczy oraz sumy. Publiczny Start pokazuje do pięciu graczy z czołówki klasyfikacji punktowej sezonu, wraz z miejscem, nazwą gracza i punktami. Backend używa wspólnej reguły punktacji i kolejności, więc korekta wyniku wpływa na oba widoki.

Ranking sezonu pokazuje obok sumy wkład ostatniej rundy z rozliczonym meczem, np. `270 (+30)`. Jest to opublikowana runda o najwyższym numerze, w której co najmniej jedno spotkanie ma status i kompletny wynik pozwalający naliczyć punkty. Wkład obejmuje rozliczone typy gracza z tej rundy i może wynosić zero lub być ujemny. W trakcie rundy rośnie wraz z rozliczaniem kolejnych meczów. Osobny ranking rundy pokazuje punkty z wybranego zakresu.

## Podgląd typów graczy

Zalogowany gracz może wybrać opublikowaną rundę, wyszukać uczestnika po nazwie i zobaczyć jego ujawnione typy oraz punkty za poszczególne mecze. Lista uczestników obejmuje osoby, które zapisały co najmniej jeden typ w tej rundzie.

Ujawnienie jest osobne dla każdego spotkania. Backend zwraca typ po osiągnięciu znanego terminu rozpoczęcia według czasu PostgreSQL. Wymaga przy tym potwierdzonego statusu meczu. Przełożenie, odwołanie, prowizoryczny termin i nieznany status pozostawiają typ ukryty. Status `NS` ze znanym terminem w przeszłości pozwala ujawnić typ także podczas opóźnienia aktualizacji dostawcy. Wynik punktowy korzysta z tej samej reguły `PredictionScoring` co własne typy i ranking.

Przed ujawnieniem odpowiedź pomija przewidywany wynik i jego punkty. Uczestnik może mieć pustą listę ujawnionych typów. Widok porównawczy stosuje tę zasadę również do bieżącego gracza, który nadal ma dostęp do własnych zapisów w „Moich typach”.

## Przykład

Próbka API dla Fenerbahçe–Lille, fixture `1271721`, zawiera `fulltime` 1:0, `extratime` 0:1 i `goals` 1:1. Wynikiem do typowania jest 1:0. Sam fakt, że pola różnią się w tej próbce, nie zastępuje kontroli statusu i kompletności danych przy późniejszym rozliczaniu.

Dwa mecze w jednej kolejce mogą zaczynać się o 18:45 i 21:00. Zamknięcie pierwszego nie zamyka automatycznie możliwości edycji drugiego.

## Granice

- Nieznany lub prowizoryczny termin blokuje zapis typu.
- Mecze przerwane, odwołane i rozstrzygnięcia administracyjne wymagają osobnych reguł rozliczenia. Nie wybieramy automatycznie zastępczego wyniku, kiedy brakuje kompletnego wyniku regulaminowego.
- Ewentualny ranking na żywo wymaga osobnego ustalenia.
- Sam import terminarza nie wymaga rozstrzygnięcia wszystkich powyższych przypadków: zapisuje stan i osobne wyniki, bez tworzenia typów i punktów.

[Dane i ograniczenia próbki](../research/2026-10-31-api-football.md#pierwsza-próbka-z-konta-free--2-listopada-2026-r), [propozycja modelu](../planning/football-data-model.md).
