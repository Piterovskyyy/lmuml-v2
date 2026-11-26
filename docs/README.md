# Dokumentacja LMuML

Dokumentacja opisuje działające przepływy LMuML, decyzje architektoniczne oraz przygotowanie wydania.

| Potrzeba | Dokument |
| --- | --- |
| Zobaczyć najważniejsze ekrany i zapis typu | [Demonstracja](demo/README.md) |
| Prześledzić żądanie przez React, Spring i PostgreSQL | [Architektura](architecture.md) |
| Sprawdzić, które wybory zostały przyjęte | [Rejestr decyzji](decisions/README.md) |
| Przygotować narzędzia, bazę i uruchomić diagnozę | [Środowisko lokalne](development/local-environment.md) |
| Sprawdzić odpowiedź i błędy pierwszego endpointu | [Odczyt meczów sezonu](development/season-matches-api.md) |
| Uruchomić podgląd typowania i katalog meczów, poznać strukturę React | [Frontend](development/frontend.md) |
| Poznać aktywną paletę Ligi Mistrzów i zachowane warianty Euro/Mundial | [Motywy wydarzeń](development/event-themes.md) |
| Przygotować publikację, kopie i wycofanie wdrożenia | [Plan wdrożenia](operations/deployment-plan.md) |
| Uruchomić lokalną próbę obrazów, HTTPS i WebSocket | [Lokalne próbne wdrożenie](operations/rehearsal.md) |
| Sprawdzić kolory, typografię i ograniczenia wykorzystania materiałów UEFA | [Badanie wizualne](research/2026-10-29-uefa-visual-research.md) |
| Poznać możliwości API-Football, typy i luki modelu | [Analiza danych dostawcy](research/2026-10-31-api-football.md) |
| Poznać przyjęty model katalogu i granice jego odpowiedzialności | [Model danych piłkarskich](planning/football-data-model.md) |
| Sprawdzić, które pola zachowujemy w kolumnach i źródłowym JSONB | [Zakres danych dostawcy](planning/provider-data-retention.md) |

Starsze materiały opisują [reguły poprzedniej wersji](domain/legacy-behavior.md) i [zakres pierwszego etapu](planning/first-slice.md).
