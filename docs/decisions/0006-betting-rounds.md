# ADR 0006 — kolejka typowania niezależna od rundy dostawcy

Status: przyjęta 2 listopada 2026 r.

## Problem

API-Football opisuje rundę turnieju tekstem, np. fazą ligową lub ćwierćfinałem. LMuML potrzebuje własnego zestawu meczów, na który użytkownicy oddają typy. Przełożenie meczu lub zmiana oznaczenia rundy u dostawcy nie powinny samoczynnie reorganizować tego zestawu.

## Decyzja

LMuML zachowuje własne kolejki typowania. Runda API jest osobną informacją o meczu. Nie wyliczamy numeru kolejki typowania z tekstu rundy ani automatycznie z daty rozpoczęcia meczu.

## Konsekwencje

- Synchronizacja terminarza nie zmienia samodzielnie przynależności do kolejki graczy.
- Kolejka typowania ma własną tożsamość i jawne przypisania meczów.
- Dotychczasowe `matches.matchday` z demonstracyjnej V1 nie staje się polem rundy API.
- Zasady ręcznego przenoszenia meczów i ponownego otwierania typowania wymagają osobnego ustalenia. Wynik do punktacji opisuje [ADR 0007](0007-prediction-score-and-deadline.md).

## Uzupełnienie z 4 listopada 2026 r.

- W panelu administracyjnym administrator wybiera gotowe grupy spotkań z terminarza. Jedna kolejka typowania może łączyć kilka grup, np. półfinały i finał.
- Wybrany blok spotkań trafia w całości do jednej kolejki typowania. Administrator widzi w podglądzie daty i liczbę spotkań przed publikacją.
- Po publikacji skład wynika z zapisanych identyfikatorów meczów. Aktualizacja daty lub nazwy rundy w katalogu sama nie przesuwa meczu między kolejkami.
- Proponowany podział w panelu to jedna grupa na numer kolejki UEFA w fazie ligowej i osobne grupy na pierwsze mecze i rewanże w fazie pucharowej. W danych sezonu 2024/25 `League Stage - 1` to 18 meczów rozłożonych na trzy daty. `Round of 16` obejmuje pierwsze mecze 4–5 marca i rewanże 11–12 marca. Obie grupy można przypisać do tej samej kolejki typowania. Zachowany kod starej aplikacji pokazuje wybór dat, a historyczny przydział konkretnych dat nie jest dostępny lokalnie.

## Model bazy

Migracja [V7](../../backend/src/main/resources/db/migration/V7__add_betting_rounds.sql) dodaje `betting_rounds` z numerem w sezonie i momentem publikacji. Od V15 baza wylicza nazwę `Runda N` z numeru. `betting_round_groups` wiąże wybrane bloki z kolejką, a `betting_round_matches` zapisuje identyfikatory meczów. Identyfikator bloku jest osobny od tekstu rundy API, więc pierwsze mecze i rewanże mogą mieć wspólną etykietę dostawcy. Klucze bazy egzekwują przynależność do tego samego sezonu, unikalność bloku w sezonie i pojedyncze przypisanie każdego meczu.

## Panel i publikacja

W Lidze Mistrzów typowanie zaczyna się od pierwszej kolejki fazy ligowej. Panel udostępnia numerowane kolejki tej fazy oraz bloki fazy pucharowej. Kwalifikacje pozostają dostępne w katalogu rozgrywek.

Administrator zapisuje całe bloki jako szkic, a publikację zatwierdza osobno. Żądanie zapisu zawiera identyfikatory meczów widocznych w podglądzie. Backend ponownie odczytuje grupy, odrzuca nieaktualny wybór i zapisuje całość w jednej transakcji. Można odrzucić szkic i zwolnić jego bloki. Opublikowaną kolejkę identyfikuje `published_at`.

Jeśli finał jeszcze czeka na parę, administrator może zarezerwować jego blok przy półfinałach. Po pojawieniu się spotkania potwierdza jego dopięcie. Tę operację można wykonać także po publikacji i dotyczy ona tylko zarezerwowanego finału.

Panel działa pod `/admin/`. Spring Security kontroluje rolę `ADMIN` dla odczytu i zmian w `/api/admin/`, utrzymuje sesję w ciasteczku i sprawdza token CSRF dla operacji zmieniających stan. Konto administracyjne jest konfigurowane skrótem hasła i służy temu panelowi. Mechanizm kont graczy pozostaje osobnym etapem. [Ochrona CSRF w Spring Security](https://docs.spring.io/spring-security/reference/servlet/exploits/csrf.html)

[Propozycja mapowania](../planning/football-data-model.md).
