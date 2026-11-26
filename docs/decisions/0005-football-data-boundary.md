# ADR 0005 — odczyt SQL i granica danych dostawcy

Status: przyjęta 31 października 2026 r. w zakresie opisanym poniżej.

## Decyzja

Użytkownik wybrał **JdbcClient z jawnym SQL** dla pierwszego odczytu, po porównaniu z JPA/Hibernate. Obecny starter JDBC zapewnia potrzebne narzędzia; wybór nie przesądza persystencji kolejnych funkcji.

Przed implementacją endpointu użytkownik wskazał API-Football do analizy i przygotowania typów. Typy transportowe w `pl.lmuml.football.apifootball.dto` odwzorowują format dostawcy. Model naszej aplikacji i odpowiedź dla frontendu będą osobnymi kontraktami.

## Konsekwencje i granice

- Nie mapujemy bezpośrednio JSON-a dostawcy na encje bazy ani nie udostępniamy klucza frontendowi.
- Nie utożsamiamy rundy turnieju z kolejką typowania.
- Etap przygotowania DTO nie obejmował klienta HTTP, importera ani zmian schematu. V1 pozostaje demonstracyjnym szkieletem do weryfikacji.
- API-Football jest analizowanym źródłem wskazanym przez użytkownika. Zakup, dostęp do konta, rzeczywiste pokrycie i gotowość produkcyjna nie zostały potwierdzone.
- Kontrakt endpointu został odłożony do czasu przeglądu danych i reguł. Szkic jego testów pozostaje prywatnym materiałem roboczym, poza zestawem wykonywanych testów.

[Raport, mapa możliwości i niewiadome](../research/2026-10-31-api-football.md).

## Aktualizacja 2 listopada 2026 r.

Kolejny etap dodaje konkretny klient odczytu API-Football oparty na Spring RestClient, dla metadanych rozgrywek i listy meczów. Klient sprawdza status HTTP oraz kopertę, zachowuje paginację i metadane limitów. Nie importuje danych, nie ponawia automatycznie wywołań i nie kontaktuje się z dostawcą przy starcie aplikacji.

Konfiguracja jest opcjonalna i domyślnie wyłączona. Klucz pozostaje po stronie backendu; proces migracji go nie otrzymuje. Testy korzystają z lokalnego serwera HTTP. Użytkownik potwierdził posiadanie konta Free, ale rzeczywiste odpowiedzi i pokrycie konta nie zostały jeszcze zweryfikowane. [Konfiguracja i ograniczenia klienta](../development/local-environment.md#klient-api-football).

Kolejny krok tego samego dnia dodał jawny profil i komendę diagnostyczną bez datasource/HTTP. Klient wewnętrznie rozdziela pobranie poprawnej koperty od konwersji do DTO; publiczne metody nadal zwracają typowane odpowiedzi. Pozwala to zachować oryginalny JSON przed możliwym błędem konwersji, bez dodawania surowych danych do przyszłego publicznego API. Dwa rzeczywiste odczyty potwierdziły metadane i 279 meczów Ligi Mistrzów 2024/25 na koncie Free. [Zakres i ograniczenia próbki](../research/2026-10-31-api-football.md#pierwsza-próbka-z-konta-free--2-listopada-2026-r).
