# Motywy wydarzeń

Aktywną oprawą aplikacji jest Liga Mistrzów. Palety Euro 2028 i Mundialu 2030 pozostają zachowane w CSS na przyszłość; tymczasowy przełącznik porównawczy został usunięty. Motyw określa wygląd, a wybór danych sezonu pozostaje osobną odpowiedzialnością.

## Gdzie zmienić kolory

`frontend/src/app/themes/event-themes.css` jest wspólnym źródłem palet. Każdy profil definiuje ten sam zestaw tokenów:

- Powierzchnie i czytelność: `--background`, `--card`, `--popover`, `--foreground`, `--muted-foreground`.
- Interakcje: `--primary`, `--primary-foreground`, `--accent`.
- Szkło kart i nawigacji: `--glass-*`, `--feature-*`, `--light-edge`.
- Sieć i poświaty: `--effect-start`, `--effect-middle`, `--effect-end`.

Komponenty korzystają z tokenów, a przezroczyste tinty wyliczają przez `color-mix`. Kolory stanów sukcesu, ostrzeżenia i błędu są wspólne. Logo w nagłówku jest tym samym własnym monogramem SVG z kolorami aktywnego profilu; favicon pozostaje bazowym znakiem aplikacji.

| Profil | Tło | Powierzchnia karty | Akcent interakcji | Kolory sieci |
| --- | --- | --- | --- | --- |
| Liga Mistrzów | `#000040` | `#0A0A61` | `#00EEFF` | `#00D4FF`, `#3974FF`, `#973FFF` |
| Euro 2028 | `#10052D` | `#25104F` | `#FF70AA` | `#009BFF`, `#FC0064`, `#00C878` |
| Mundial 2030 | `#23080F` | `#431320` | `#F8D818` | `#FF4058`, `#F8D818`, `#10A058` |

To własne warianty UI do oceny, inspirowane [materiałami wydarzeń](../research/2026-11-03-event-palettes.md). Ciemne powierzchnie oraz czytelne odcienie przycisków są dobrane do aplikacji.

## Wybór aktywnego motywu

`frontend/index.html` ustawia `data-event-theme="champions-league"` bezpośrednio na elemencie `html`, więc kolory obowiązują od pierwszego malowania. W tym samym pliku `meta[name="theme-color"]` ma wartość `#000040`, odpowiadającą tokenowi `--background` Ligi Mistrzów.

Aplikacja nie odczytuje ani nie zapisuje preferencji motywu w localStorage. Wartość `lmuml.preview-event-theme.v1` pozostawiona po porównywaniu palet nie wpływa na wygląd. Komfort i ograniczenie ruchu nadal mają własne ustawienia i działają niezależnie od palety.

Przy przyszłym uruchomieniu innego wydarzenia można wskazać profil `euro-2028` albo `world-cup-2030` i ustawić zgodny kolor przeglądarki. Powiązanie oprawy z aktywnymi rozgrywkami i konfiguracja organizatora pozostają osobnym etapem. Sam wybór palety nie zmienia terminarza ani typów.

## Weryfikacja

Przy przygotowaniu trzech palet sprawdzono w przeglądarce szkło, sieć, dialog i małe ekrany. Podstawowe pary tekst–tło oraz tekst–przycisk zostały policzone dla wszystkich profili; nie jest to pełny audyt dostępności całej aplikacji. Testy aplikacji obejmują zachowanie stanu stron i niezależnych preferencji czytelności podczas nawigacji.
