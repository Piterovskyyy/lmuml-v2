# ADR 0012 — sygnał aktualizacji wyników przez SSE

- Status: zastąpiony przez [ADR 0013](0013-season-result-websocket.md). SSE było pierwszym działającym lokalnie transportem.
- Data: 25 listopada 2026 r.

## Kontekst

Importer zapisuje terminarz i metadane jego próbki w jednej transakcji PostgreSQL. Rozgrywki i Ranking wcześniej sprawdzały zmiany w regularnych odstępach. Po zakończonym imporcie chcemy odświeżyć otwarte widoki bez czekania na kolejny odczyt z przeglądarki.

## Decyzja

Strumień SSE wysyła kod wersji wynikający z czasu pobrania ostatniej zapisanej próbki sezonu. Rozgrywki i Ranking odczytują dane przez swoje istniejące endpointy po zmianie wersji. Ranking nadal wymaga sesji. Strumień publikuje wyłącznie wersję katalogu.

Spring sprawdza wersje subskrybowanych sezonów jednym wspólnym zapytaniem co około pięć sekund. Wersję czyta z istniejącego widoku `fixture_snapshot_times`. Klient po połączeniu otrzymuje bieżącą wersję i porównuje ją z odpowiedzią REST. Po przerwaniu połączenia wraca do dotychczasowego odświeżania w oknie meczowym. [Spring MVC i odpowiedzi strumieniowe](https://docs.spring.io/spring-framework/reference/web/webmvc/mvc-ann-async.html), [standard SSE](https://html.spec.whatwg.org/multipage/server-sent-events.html).

## Konsekwencje

- Wspólny odczyt działa także wtedy, gdy importer i API są osobnymi procesami. Gdy nikt nie słucha, strumień nie odpytuje bazy.
- Opóźnienie od zapisu do wysłania sygnału obejmuje odstęp między odczytami bazy. Częstotliwość pobierania wyników z API-Football wynika z osobnego harmonogramu importera.
- Liczba połączeń jest ograniczona. Istniejące endpointy obsługują ręczne odświeżanie i odczyt po utracie połączenia.
