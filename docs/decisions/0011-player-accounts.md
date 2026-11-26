# ADR 0011 — własne konta graczy

Status: przyjęta 10 listopada 2026 r.

## Decyzja

LMuML obsługuje rejestrację i logowanie graczy we własnym backendzie. PostgreSQL zapisuje konto pod własnym UUID. Gracz loguje się e-mailem, a wyświetlana nazwa jest osobnym polem. E-mail przechodzi normalizację przed wyszukaniem i zapisem, a jego unikalność egzekwuje baza.

Spring Security porównuje hasło ze skrótem PBKDF2 z losową solą. Po poprawnym logowaniu klient dostaje ciasteczko sesji `HttpOnly`, a serwer zmienia identyfikator sesji. Zmiany stanu wymagają tokenu CSRF. Konteksty gracza i administratora są odrębne. [Przechowywanie haseł](https://docs.spring.io/spring-security/reference/features/authentication/password-storage.html) · [Zarządzanie sesją](https://docs.spring.io/spring-security/reference/servlet/authentication/session-management.html)

## Przepływ

| Żądanie | Wynik |
| --- | --- |
| `GET /api/v1/player/session` | Stan sesji, token CSRF i dane własnego profilu po zalogowaniu |
| `POST /api/v1/player/register` | Walidacja, haszowanie i zapis konta, odpowiedź 201 |
| `POST /api/v1/player/login` | Weryfikacja e-maila i hasła, odpowiedź 204 lub 401 |
| `POST /api/v1/player/password` | Weryfikacja obecnego hasła i zapis nowego, odpowiedź 204. Wymaga sesji gracza i CSRF. |
| `POST /api/v1/player/password-reset/request` | Zlecenie wysyłki linku. Odpowiedź 204 jest taka sama dla znanego i nieznanego adresu. Wymaga CSRF. |
| `POST /api/v1/player/password-reset/confirm` | Zużycie jednorazowego linku i zapis nowego hasła. Wymaga CSRF. |
| `POST /api/v1/player/logout` | Wylogowanie gracza, odpowiedź 204 |

Rejestracja tworzy konto, po czym użytkownik loguje się w tym samym widoku. Kolejne operacje gracza mogą odczytać jego UUID z sesji. Ustalenie sposobu powiązania ze starą historią to osobny etap. Sam adres e-mail wpisany przy rejestracji nie potwierdza własności starego konta.

Zmiana hasła w jednej operacji SQL zapisuje nowy skrót i zwiększa wersję danych logowania. Filtr przy kolejnym żądaniu gracza porównuje wersję z sesji z aktualną wersją w bazie. Usuwa nieaktualny kontekst gracza wraz z jego tokenem CSRF, zachowując osobny kontekst administratora. Dzięki warunkowi wersji przy zapisie tylko jedno z dwóch równoczesnych żądań zmiany może się powieść.

Odzyskiwanie hasła wysyła link z losowym tokenem w fragmencie URL. W bazie zapisuje wyłącznie jego skrót SHA-256 i czas wystawienia. Link wygasa po 30 minutach, a kolejne wystawienie dla tego samego adresu jest możliwe po minucie. Wysłanie wiadomości odbywa się poza wątkiem HTTP w kolejce o ograniczonej pojemności. Po zatwierdzeniu nowego hasła ta sama operacja SQL usuwa skrót tokenu i zwiększa wersję danych logowania. Zmiana hasła w zalogowanej sesji też unieważnia aktywny link. [Odzyskiwanie hasła według OWASP](https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html)

Lokalny launcher włącza logowanie. Wdrożenie wymaga jawnego `LMUML_PLAYER_AUTH_ENABLED=true`, a odzyskiwanie hasła wymaga osobnego włączenia i skonfigurowania SMTP oraz publicznego adresu aplikacji. Potwierdzenie e-maila przy rejestracji i ograniczenie prób logowania pozostają osobnymi decyzjami.
