# ADR 0013 — aktualizacje wyników przez WebSocket

- Status: przyjęty. Zastępuje transport opisany w [ADR 0012](0012-season-result-updates.md).
- Data: 25 listopada 2026 r.

## Kontekst

Rozgrywki i Ranking potrzebują aktualnej wersji wyników, także po powrocie do aplikacji lub utracie sieci. SSE obsługiwało powiadomienia jednokierunkowe i automatyczne ponowne połączenie. WebSocket pozwala przeglądarce wysłać polecenie subskrypcji na otwartym połączeniu, a aplikacji kontrolować ponowienia, limity i zamykanie sesji.

## Decyzja

Przeglądarka otwiera WebSocket w tej samej domenie i subskrybuje jeden sezon. Spring wysyła bieżącą wersję przy subskrypcji, potem tylko jej zmiany. Wspólny cykl sprawdza wersje subskrybowanych sezonów w PostgreSQL co około pięć sekund. Implementacja korzysta z natywnego WebSocket i istniejącego modelu danych. [Kontrakt aktualizacji](../development/season-matches-api.md#aktualizacje-wyników).

Rozgrywki i Ranking pobierają pełne dane przez REST po wykryciu zmiany. Odczyt rankingu nadal wymaga sesji gracza. Po ponownym połączeniu klient porównuje wersję z ostatnim odczytem. W razie braku połączenia stosuje odpytywanie w oknie meczowym.

## Konsekwencje

- Utrzymujemy jedno połączenie dla aktywnego widoku. Backend ogranicza ich liczbę i sprawdza żywotność przez ping/pong.
- Proxy na wdrożeniu musi obsługiwać przełączenie protokołu dla `/api/v1/season-updates`. Na stronie udostępnianej przez HTTPS klient używa `wss:`. Trasę i zachowanie bezczynnego połączenia sprawdzimy przez docelowe proxy. [Plan wdrożenia](../operations/deployment-plan.md).
