# Frontend: typowanie i mecze

Frontend React/TypeScript pokazuje opublikowane kolejki typowania oraz katalog z [odczytu sezonu](season-matches-api.md). Katalog pokazuje zaimportowane 279 meczów Ligi Mistrzów 2024/25, oznaczone jako archiwum. Po zalogowaniu gracze mogą zapisywać typy, przeglądać ranking i ujawnione typy innych graczy.

## Nawigacja i podgląd typowania

Aktywna jest oprawa Ligi Mistrzów, ustawiona w `frontend/index.html` przez `data-event-theme="champions-league"` i zgodny kolor `meta[name="theme-color"]`. [Wspólne palety i konfiguracja](event-themes.md) obejmują tła, formularze, szkło i animowaną sieć. Euro 2028 i Mundial 2030 pozostają zachowane na przyszłość; tymczasowy przełącznik został usunięty.

- Start (`/` i `#start`): publiczna czołówka rankingu graczy, statystyki typowania po rundach, mecze, tabela lub drabinka oraz statystyki rozgrywek z aktywnego sezonu. Wykresy rozgrywek korzystają z tego samego odczytu co terminarz. „Typuj rundę” rozwija wszystkie otwarte mecze najbliższej opublikowanej rundy, z podziałem według dni w czasie polskim. Zalogowany gracz zapisuje uzupełnione typy jedną akcją i widzi własną punktację. Animacja wejścia respektuje ograniczenie ruchu i widok komfortowy.
- `#typy`: odczyt opublikowanych kolejek z wybranego sezonu. Lista startuje od kolejki o najwyższym numerze. Można wybrać inną, zobaczyć mecze zgrupowane według dat w czasie polskim i otworzyć szczegóły. Oczekiwanie na dopięcie zarezerwowanego finału ma osobny komunikat.
- `?demo=1#typy`: osobny podgląd formularza na przykładowych danych. Przełączniki pokazują sytuację przed meczami, w trakcie kolejki i po spotkaniach.
- `#rozgrywki`: tabela w fazie ligowej, drabinka w fazie pucharowej, a przed fazą ligową lista meczów. Zakładki `#tabela`, `#drabinka` i `#mecze` pozwalają otworzyć dostępny widok. Tabela pozostaje dostępna po fazie ligowej. Odnośnik `#o-wynikach` prowadzi do listy meczów. Parametr `?season=` wskazuje sezon.
- `#konto`: rejestracja, logowanie i wylogowanie gracza przez [własny backend](../decisions/0011-player-accounts.md).
- Ranking ma trzy widoki. „Klasyfikacja” (`#ranking`) pokazuje pozycje graczy w sezonie lub wybranej kolejce. „Typy graczy” (`#typy-graczy`) pozwalają wybrać rundę, wyszukać uczestnika i zobaczyć jego ujawnione typy wraz z punktami. „Statystyki” (`#statystyki`) porównują rundy typowania i pokazują przebieg fazy ligowej po wybraniu klubu. Po zalogowaniu wyświetlają też skuteczność i punkty gracza w kolejnych rundach.
- Telefon ma pływającą, szklaną wyspę z pozycjami Start, Moje typy, Rozgrywki i Ranking. Desktop pokazuje tę samą nawigację w nagłówku. Konto jest obok ustawień wyglądu na obu ekranach. Rozmycie ma kryjący fallback, a odstęp od dolnej krawędzi uwzględnia safe area. Rezerwa pod treścią i przy przewijaniu zapobiega zasłonięciu ostatnich kontrolek. Natywne odnośniki hash obsługują historię Wstecz/Dalej. Zmiana widoku przenosi fokus do jego treści, a ukryte strony nie uczestniczą w nawigacji klawiaturą.

Podgląd ma duże pola z klawiaturą numeryczną i jeden przypięty przycisk „Zapisz typy”. Zapisuje w podglądzie kompletne, zmienione typy dla otwartych meczów. Niepełne wyniki pozostają w polach. Każda karta pokazuje fazę rozgrywek, miasto, godzinę i stan spotkania. W trakcie meczu widać minutę oraz bieżący wynik. Po spotkaniu karta pokazuje własny typ, wynik do przerwy i wynik po 90 minutach.

Podgląd `?demo=1` przechowuje typy w pamięci komponentu React do odświeżenia strony. Każdy scenariusz zachowuje własne wartości podczas przełączania widoków. Zwykłe typowanie wysyła typy gracza do Springa, gdzie backend sprawdza sesję, uprawnienia i termin zgodnie z [ADR 0007](../decisions/0007-prediction-score-and-deadline.md).

## Uruchomienie

Z katalogu głównego repozytorium, po przygotowaniu PostgreSQL, migracji i importu:

```powershell
mise exec -- npm --prefix frontend ci
mise exec -- node scripts/run-backend.mjs
```

W drugim terminalu:

```powershell
mise exec -- npm --prefix frontend run dev
```

Otwórz [localhost:5173](http://127.0.0.1:5173/). Podgląd typowania działa również bez backendu i bazy. Katalog wymaga uruchomionego PostgreSQL i Springa; Vite przekazuje `/api` do `127.0.0.1:8080`. Oba serwery słuchają wyłącznie na interfejsie lokalnym. Zatrzymuj każdy proces przez Ctrl+C; kontener bazy ma własny cykl życia.

Frontend nie potrzebuje `.env` ani klucza API-Football. Nie przekazuj sekretów do zmiennych `VITE_*`, które mogą trafić do przeglądarki. W przyszłym wdrożeniu statyczny build i `/api` powinny być dostępne przez jeden origin z reverse proxy; konfiguracja hostingu jest osobnym etapem.

Start, Moje typy, Typy graczy, Rozgrywki i Ranking otwierają sezon ustawiony w panelu administratora. Przy braku ustawienia domyślne jest dotychczasowe archiwum 2024/25. Link z `?season=kod-sezonu` otwiera wskazany sezon, więc nadal można udostępniać adresy do archiwów. Wybór jest odczytywany przy otwarciu aplikacji.

## Zachowanie

- Typy graczy mają wybór opublikowanej rundy i wyszukiwanie po nazwie bez rozróżniania wielkości liter i polskich znaków. Rozwinięta karta pokazuje mecze, typy, wynik i punkty. Nieujawniony typ jest pomijany już przez backend; kreska przed ujawnieniem nie pozwala ustalić, czy gracz zapisał wynik. Bieżący gracz ma znacznik „Ty”. Odświeżenie zachowuje wyszukiwanie i rozwiniętą kartę, a wygaśnięcie sesji usuwa prywatne dane z widoku. [Kontrakt i moment ujawnienia](season-matches-api.md#typy-graczy).
- Tabela używa pozycji, punktów, bilansu i formy zapisanych z `/standings`. Oznacza strefy 1–8, 9–24 i 25–36. Gdy sezon nie ma zaimportowanej tabeli, widok korzysta z rozegranych meczów fazy ligowej i oznacza to źródło. Gdy dostępne kryteria zastępcze nie rozstrzygają remisu, drużyny dzielą miejsce. [Kryteria UEFA](https://www.uefa.com/uefachampionsleague/news/0291-1bd88ae04870-e1e038c319e3-1000--champions-league-league-phase-standings-how-t/)
- Drabinka korzysta z zapisanych meczów, grupuje pary według `TournamentStage` i sumuje dwumecze z uwzględnieniem dogrywki. Karne mają osobny wynik. Łącza wskazują przejście zwycięzcy do zapisanej pary w kolejnej rundzie. Desktop pokazuje wszystkie rundy, a telefon pozwala wybrać jedną. Każdy wynik otwiera szczegóły danego spotkania.
- Desktop: szersza lista, panel statystyk i podsumowanie finału. Tablet przenosi panel pod listę; telefon używa kart z tymi samymi funkcjami. Układ działa od 320 px.
- Wyszukiwanie drużyn/rund toleruje wielkość liter i znaki diakrytyczne. Filtry statusu, wybór rundy turnieju i sortowanie działają lokalnie na pełnym sezonie.
- Początkowo widać 24 mecze od najnowszych. Przycisk dodaje kolejne 24, a licznik jasno wskazuje widoczną część listy. To stopniowe renderowanie, nie limit odpowiedzi backendu.
- Zakończony mecz pokazuje wynik po 90 minutach; dogrywka i karne mają osobne pozycje w szczegółach. Brak wyniku pozostaje kreską, również gdy brakuje tylko jednej strony. Godziny i grupy dni używają `Europe/Warsaw`, z obsługą zmiany czasu.
- Zakładka „Statystyki” pokazuje dostępne strzały, posiadanie, rożne, faule i obrony obu drużyn. Odczyt z LMuML zaczyna się po wybraniu zakładki. Brak próbki lub wybranej wartości ma jawny stan. Liczby pozostają dostępne niezależnie od kolorów pasków. [Kontrakt statystyk meczu](season-matches-api.md#statystyki-meczu).
- W tej samej zakładce widok „Zawodnicy” umożliwia wybór drużyny, wyszukanie po nazwisku i rozwinięcie statystyk piłkarza. Minuty i ocena API-Football są widoczne przy nazwisku, jeśli dostawca je zwrócił. Lista obejmuje zawodników z co najmniej jedną zapisaną statystyką, w tym wartości zerowe. Dane są pobierane po wybraniu widoku. [Kontrakt statystyk zawodników](season-matches-api.md#statystyki-zawodników-meczu).
- „Przebieg” w szczegółach rozegranego meczu pokazuje chronologicznie minuty, drużynę i uczestników bramek, kartek, zmian i decyzji VAR. Przełącznik „Statystyki” otwiera porównanie drużyn w tym samym oknie. [Kontrakt przebiegu meczu](season-matches-api.md#przebieg-meczu).
- „Składy” pokazują obie drużyny i trenerów. Gdy znane są pozycje obu jedenastek, zajmują przeciwne połowy wspólnego boiska. Na telefonie boisko jest pionowe. Pod nim są pełne listy obu składów i rozwijane listy rezerwowych. Oznaczenia przy zawodnikach pokazują dostępne oceny, gole, asysty oraz minuty wejścia i zejścia. Jeśli brakuje danych do rozrysowania ustawienia, pozostają listy. Składy są dostępne także przed meczem po imporcie. [Kontrakt składów meczu](season-matches-api.md#składy-meczu).
- Pierwsze ładowanie, pusty sezon, brak wyników wyszukiwania i błąd połączenia mają osobne stany. Ponowienie po nieudanym odświeżeniu zachowuje ostatnie dane, sezon i filtry; informacja o błędzie nie sugeruje, że dane są świeże.
- Rozgrywki i Ranking subskrybują wersję wyników wybranego sezonu przez WebSocket. Zmiana wersji uruchamia odczyt REST i zachowuje filtry. Ukrycie karty lub przejście do innego widoku zamyka połączenie. Po powrocie aktualna wersja z serwera pozwala wykryć pominiętą zmianę. [Kontrakt aktualizacji](season-matches-api.md#aktualizacje-wyników).
- Gdy połączenie jest niedostępne albo sezon nie ma jeszcze zapisanej wersji wyników, aplikacja odczytuje dane w oknie meczowym mniej więcej co minutę. Okno trwa od 15 minut przed rozpoczęciem spotkania do 3 godzin i 5 minut po jego starcie. Ranking korzysta z `refreshKickoffs`, czyli terminów z opublikowanych kolejek wybranego zakresu. Ręczne odświeżanie działa niezależnie od WebSocket.
- Ranking sezonu pokazuje sumę punktów i wkład ostatniej rozliczanej rundy, np. `60 (+20)`. Podpis wskazuje numer rundy. Brak typu w tej rundzie daje wkład `0`, a ujemna punktacja daje wartość z minusem. Nazwa rundy i wkład pochodzą z pól `latestScoredRound` oraz `latestRoundPoints` odpowiedzi rankingu.
- Ustawienie „Widok komfortowy” powiększa tekst i odstępy oraz ogranicza ruch. Jest zapisywane tylko lokalnie w przeglądarce. Brak dostępu do localStorage nie blokuje korzystania. Systemowe `prefers-reduced-motion` jest respektowane również w widoku standardowym.
- Kontrolki mają etykiety, fokus i cele dotykowe co najmniej 44 px. Dialogi Radix obsługują pułapkę fokusu, Escape i powrót do wyzwalacza. Niedostępne logo zastępuje neutralna tarcza; tekstowa nazwa drużyny pozostaje widoczna.

## Struktura i narzędzia

| Miejsce | Odpowiedzialność |
| --- | --- |
| `frontend/src/app/` | Oprawa, nawigacja i historia hash, preferencje, konfiguracja animacji |
| `frontend/src/app/themes/` | Wspólne tokeny oprawy, aktywna paleta Ligi Mistrzów i zachowane palety przyszłych wydarzeń |
| `frontend/src/features/predictions/components/` | Podgląd kolejki, edycja typu i podsumowanie |
| `frontend/src/features/predictions/model/` | Jawne próbki UI i przekształcanie pól wyniku |
| `frontend/src/features/predictions/predictions.css` | Układ i stany ekranu typowania |
| `frontend/src/features/players-predictions/` | Wybór rundy, wyszukiwanie gracza, odczyt ujawnionych typów i karty z punktami |
| `frontend/src/features/home/` | Strona startowa, podglądy rozgrywek i rankingu, rozwijane typowanie najbliższej rundy |
| `frontend/src/features/statistics/` | Zbiorcze statystyki gry, osobiste wyniki i wykres punktów w rundach |
| `frontend/src/features/matches/api/` | Względny fetch, walidacja Zod, anulowanie/timeout i stan odczytu |
| `frontend/src/features/matches/model/` | Statusy i etapy, reguły tabeli i drabinki, formatowanie oraz filtry |
| `frontend/src/features/matches/components/` | Lista, karta i szczegóły meczu, podsumowanie sezonu, tabela i drabinka |
| `frontend/src/components/football/` | Wspólna prezentacja logo drużyny z zastępczą tarczą |
| `frontend/src/components/visual/` | Neonowa piłka, geometria paneli i animacja smug |
| `frontend/src/components/ui/` | Używane, lokalnie utrzymywane komponenty shadcn/ui na Radix |
| `frontend/src/styles.css` | Tokeny kolorów, wspólne style i breakpointy |

Zod sprawdza dane na granicy HTTP; typ TypeScript nie zastępuje walidacji JSON-a. Nieznane statusy dostają bezpieczny opis, a nowe dodatkowe pola odpowiedzi nie wywracają ekranu. Błędy nie powtarzają surowych komunikatów serwera. Hook anuluje nieaktualne żądanie przy zmianie sezonu lub odmontowaniu.

Wykres klubu korzysta z Chart.js ładowanego po wejściu w Statystyki. Punkty sumują zakończone mecze fazy ligowej według kolejki dostawcy. Bramki pochodzą z regulaminowych wyników poszczególnych kolejek. „Miejsce z wyników” używa reguł tabeli zastępczej dla kolejnych pełnych kolejek od pierwszej. Każda z nich musi zawierać komplet wyników 18 meczów tych samych 36 drużyn. Pozycje nierozstrzygnięte na podstawie dostępnych kryteriów są dzielone. Dokładne wartości są dostępne pod wykresem. Historia oficjalnych pozycji wymaga osobnych migawek tabeli po kolejkach. Licencje Chart.js i `@kurkle/color` trafiają do builda z `frontend/public/licenses/`.

Wersje zależności są przypięte w `frontend/package.json` i `package-lock.json`; Node pochodzi z `mise.toml`. Build sprawdza TypeScript i generuje statyczne `frontend/dist/`. React ma osobny plik wynikowy, żeby jego cache nie zależał od każdej zmiany widoku.

```powershell
mise exec -- npm --prefix frontend test
mise exec -- npm --prefix frontend run build
mise exec -- npm --prefix frontend run format:check
```

Testy obejmują kontrakt HTTP, bezpieczne błędy, null/0:0, wyniki 90 minut/dogrywki/karnych, Warsaw/DST, wyszukiwanie, filtry, doładowanie listy, Escape/fokus oraz zachowanie danych i filtrów po błędzie odświeżenia. Kontrola w przeglądarce sprawdza rzeczywiste połączenie ze Springiem i responsywność. Nie zastępuje to pełnego audytu dostępności ani testów z rzeczywistymi użytkownikami.

Testy podglądu sprawdzają zapis kilku typów naraz, w tym 0:0, zachowanie niepełnego szkicu, cofnięcie edycji, indywidualne blokady i fokus przy uzupełnianiu kolejnego typu. Testy oprawy pokrywają adresy hash, zachowanie stanu stron, tytuły, pominięcie nawigacji i wspólne preferencje.

## Pochodzenie oprawy

Baza shadcn/ui + Radix/Tailwind/Motion jest przyjęta w [ADR 0001](../decisions/0001-frontend-ui.md). Sześć użytych komponentów pochodzi z oficjalnego rejestru `new-york-v4`, pobranego 2 listopada 2026 r.: button, input, select, dialog, switch i badge. Dostosowano importy do lokalnych aliasów, formatowanie, polskie etykiety zamknięcia, tokeny i rozmiary kontrolek. Licencja MIT znajduje się w `frontend/public/licenses/shadcn-ui-MIT.txt` i trafia do builda.

Pierwsza oprawa używa preferowanej [palety UCL](../research/2026-10-29-uefa-visual-research.md): `#000040`, `#0A0A61`, `#151573`, `#17177A`, `#00EEFF`. Układ, monogram LM, CSS i motywy geometryczne są własne. Typografia to lokalnie dostarczany Inter z `@fontsource-variable/inter` 5.3.0, z łacińskim i rozszerzonym zestawem znaków; OFL zachowano w `frontend/public/licenses/Inter-OFL.txt`. Ta realizacja oprawy pozostaje pierwszą wersją do oceny.

`football-panels.ts` wyznacza gwiazdy, sześciokąty i ich wspólne krawędzie na przedniej półkuli. `StarBackdrop` rysuje je w SVG i korzysta z kolorów aktywnego wydarzenia przez `--effect-start`, `--effect-middle` i `--effect-end`. Smugi płyną po szwach w cyklach od 11 do 15,8 s. Na telefonie grafika ma mniejszą intensywność.

Warstwa jest dekoracyjna i ukryta przed technologiami asystującymi. Karty typowania mają własne, kryjące tło. Przełącznik „Animacja tła” zatrzymuje ruch, a wybór zapisuje się jako `lmuml.background-motion.v1`. Widok komfortowy i systemowe `prefers-reduced-motion` pokazują statyczną piłkę. Ukryta karta przeglądarki pauzuje animacje.

Źródła techniczne: [Vite](https://vite.dev/guide/), [shadcn/ui dla Vite](https://ui.shadcn.com/docs/installation/vite), [Tailwind dla Vite](https://tailwindcss.com/docs/installation/using-vite), [dostępne animacje Motion](https://motion.dev/docs/react-accessibility), [Fontsource Inter](https://fontsource.org/fonts/inter).
