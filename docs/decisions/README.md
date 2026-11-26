# Decyzje techniczne

ADR zapisuje istotny wybór, jego powód i konsekwencje. Dokument badawczy lub propozycja w backlogu nie oznacza przyjęcia rozwiązania.

| Numer | Temat | Status |
| --- | --- | --- |
| [0001](0001-frontend-ui.md) | shadcn/ui, Radix, Tailwind i Motion | Przyjęta |
| [0002](0002-local-environment.md) | Temurin 25, Maven Wrapper, Node i lokalny PostgreSQL | Przyjęta |
| [0003](0003-backend-bootstrap.md) | Spring Boot, ograniczona rola bazy i kontrola gotowości | Przyjęta |
| [0004](0004-database-migrations.md) | Flyway, osobny migrator i pierwszy schemat meczów | Przyjęta |
| [0005](0005-football-data-boundary.md) | JdbcClient dla odczytu i osobne kontrakty dostawcy | Przyjęta |
| [0006](0006-betting-rounds.md) | Własne kolejki typowania, runda API osobno | Przyjęta |
| [0007](0007-prediction-score-and-deadline.md) | Wynik regulaminowy i indywidualny termin każdego meczu | Przyjęta |
| [0008](0008-football-catalog-schema.md) | Cztery tabele katalogu i przejście z demonstracyjnej V1 | Przyjęta |
| [0009](0009-provider-metadata-and-snapshots.md) | Szersze metadane i oddzielny ostatni snapshot JSONB | Przyjęta |
| [0010](0010-offline-catalog-import.md) | Import zachowanych próbek, upsert i osobna rola zapisu | Przyjęta |
| [0011](0011-player-accounts.md) | Własne konta graczy, hasze i sesje Spring Security | Przyjęta |
| [0012](0012-season-result-updates.md) | Aktualizacje wyników w Rozgrywkach i Rankingu przez SSE | Zastąpiony przez ADR 0013 |
| [0013](0013-season-result-websocket.md) | Aktualizacje wyników przez WebSocket | Przyjęty |
| [0014](0014-season-catalog-cache.md) | Cache katalogu Rozgrywek w Redisie | Przyjęty |

## Wymagające uzgodnienia przed implementacją danego obszaru

| Wybór | Kiedy jest potrzebny |
| --- | --- |
| Członkostwo we własnej kolejce i kontrakt odczytu | Przed odpowiednią funkcją typowania i endpointem |
| Punktacja, przełożenia, ponowne otwarcie i ujawnianie typów; sposób egzekwowania terminu | Przed zapisem i rozliczaniem typów |
| Weryfikacja e-maili, odzyskiwanie dostępu i powiązanie starych kont | Przed udostępnieniem graczom |
| Dostawca danych i semantyka jego wyników | Przed prawdziwym importerem |
| Hosting, kopie, domena i przełączenie danych | Przed udostępnieniem nowej wersji użytkownikom |

Pierwszy odczyt danych syntetycznych nie wymaga zamknięcia wszystkich powyższych tematów. [Zakres pierwszego przepływu](../planning/first-slice.md) i [plan wdrożenia](../operations/deployment-plan.md) oddzielają propozycje od ustaleń.
