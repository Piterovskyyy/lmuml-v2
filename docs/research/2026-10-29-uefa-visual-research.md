# UEFA Champions League: kolory i detale wizualne

Data obserwacji: **29 października 2026 r.** Status: materiał badawczy. Paleta LMuML w dalszej części jest propozycją do późniejszej oceny, a nie przyjętą decyzją.

**Przyjęta baza kolorów:** ciemne tło `#000040`, powierzchnie `#0A0A61` / `#151573` / `#17177A` i cyjan interakcji `#00EEFF`. Wariant LMuML poniżej dokumentuje wcześniejsze porównanie. [Konfiguracja motywów](../development/event-themes.md).

## Wniosek dla LMuML

Najbardziej użyteczny kierunek to chłodny granat, jasny akcent interakcji i wyraźne rozdzielenie powierzchni. W LMuML preferowane wartości kolorów należy połączyć z własną typografią, komponentami i sposobem ich użycia. Układ powstanie pod typowanie i ranking; nie odtwarzamy strony UEFA.

Wzorzec wart rozważenia: ciemna oprawa sportowa i jasne powierzchnie do czytania danych. Nie oznacza to konieczności dodawania od razu globalnego przełącznika motywu.

## Co i jak sprawdzono

- Stronę główną UCL oraz widok tabeli, w przeglądarce przy szerokości 1280 px.
- Mobilne reguły typografii przy ustawionej szerokości CSS 390 px.
- Deklaracje motywu UCL i wspólne tokeny UEFA; wybrane wartości potwierdzono przez computed styles.
- Wnętrza komponentów `pk-match-unit` i `pk-button`, ponieważ sam styl zewnętrznego elementu nie opisuje wyglądu kontrolki w Shadow DOM.
- Kontrast wybranych par kolorów, z użyciem luminancji sRGB.
- Warunki korzystania UEFA oraz licencje kandydatów na font LMuML.

To obserwacja aktualnej witryny, nie oficjalny podręcznik identyfikacji marki ani pełny audyt dostępności. Wartości mogą się zmienić.

### Ważna pułapka techniczna

Motyw UCL jest określony przez `[pk-competition=ucl]` lub `.pk-competition--ucl`. Badane `body` ma `pk-competition="ucl"` i `pk-theme="dark"`. Wewnątrz występują również sekcje jasne.

Odczyt zmiennych wyłącznie z `document.documentElement` zwraca także ogólne wartości UEFA, np. inny kolor interakcji. Prawidłowym punktem odniesienia jest `body` albo konkretny komponent. Nie należy też utożsamiać deklaracji tokenu z jego użyciem na całej stronie.

Źródła: [motyw UCL](https://www.uefa.com/CompiledAssets/UefaCom/css/competitions/uefachampionsleague/base.css?_t=38f96a1241c121b9efe8df00ff74e5be), [wspólne tokeny i aliasy](https://www.uefa.com/CompiledAssets/UefaCom/css/preload.css?_t=e0bce221b4cac338a8af15bf5dbf353e).

## Dokładna paleta UCL

### Rodziny marki

Poniższe wartości są zadeklarowane w zakresie UCL. Samo istnienie mięty lub magenty nie oznacza, że jest to kolor głównego przycisku.

| Rodzina | Warianty w kolejności tokenów |
| --- | --- |
| Granat `primary` | `#00004B`, `#61619F`, `#363683`, `#010141` |
| Niebieski `secondary` | `#0D3AFF`, `#0929C9`, `#061DA5`, `#041181` |
| Mięta `tertiary` | `#5AF7DC`, `#A0FBEB`, `#74F6E0`, `#22E3C2` |
| Magenta `accent` | `#FF16FF`, `#FC84FC`, `#CC05CC` |

**Istotne różnice:** mięta marki `#5AF7DC` i cyjan interakcji `#00EEFF` są odrębnymi kolorami. Tak samo niebieski marki `#0D3AFF` różni się od interakcji jasnego motywu `#0232FF`. [Źródło wartości](https://www.uefa.com/CompiledAssets/UefaCom/css/competitions/uefachampionsleague/base.css?_t=38f96a1241c121b9efe8df00ff74e5be).

### Powierzchnie, tekst i interakcje

| Rola / alias tokenu | Motyw ciemny UCL | Motyw jasny UCL |
| --- | --- | --- |
| Tło `--pk-background` | `#000040` | `#F1F3F8` |
| Powierzchnia 1 `--pk-elevation-01` | `#0A0A61` | `#FFFFFF` |
| Powierzchnia 2 `--pk-elevation-02` | `#151573` | `#FFFFFF` |
| Powierzchnia 3 `--pk-elevation-03` | `#17177A` | `#FFFFFF` |
| Interakcja `--pk-interaction` | `#00EEFF` | `#0232FF` |
| Tekst na interakcji `--pk-interaction-compl` | `#00004B` | `#FFFFFF` |
| Tekst główny `--pk-text-01` | `#FFFFFF` | `#1A313C` |
| Tekst drugorzędny `--pk-text-02` | `#FFFFFFB3` | `#455C67` |
| Tekst dalszego planu `--pk-text-03` | `#FFFFFF80` | `#637A85` |
| UI 01 | `#FFFFFF1A` | `#E8EAF3` |
| UI 02 | `#FFFFFF40` | `#DBDDE9` |
| UI 03 | `#FFFFFF59` | `#C1C2D5` |
| UI 04 | `#FFFFFF8C` | `#A3A4B7` |
| UI 05 | `#FFFFFFCC` | `#252663` |
| UI 06 | `#FFFFFF` | `#0A0A2F` |

Osiem cyfr w HEX oznacza kanał alfa: np. `B3` to 179/255, około 70,2%. Wynikowy kolor zależy od podłoża. Nie należy traktować półprzezroczystej bieli jak jednej stałej szarości.

Potwierdzone w przeglądarce: tło `body` `#000040`, ciemna karta meczu `#0A0A61`, cyjan obrysu i tekstu przycisku „View all matches” oraz jasna sekcja tabeli `#F1F3F8`. Stopka ma dodatkowy kolor `#040A63`. [Strona główna](https://www.uefa.com/uefachampionsleague/), [tabela](https://www.uefa.com/uefachampionsleague/standings/), [definicje motywu](https://www.uefa.com/CompiledAssets/UefaCom/css/competitions/uefachampionsleague/base.css?_t=38f96a1241c121b9efe8df00ff74e5be).

### Pozostałe grupy

| Grupa | Wartości |
| --- | --- |
| Kolory wsparcia | zielony `#32A72C`, niebieski `#0085E5`, pomarańczowy `#DF6817`, czerwony `#CB333B`, żółty `#FFCD44` |
| Serie danych — dark | `#00EEFF`, `#FFFFFF`, `#FF51A2`, `#385DFF` |
| Serie danych — light | `#0232FF`, `#00E4EB`, `#FF51A2`, `#9A00FF` |

Są to grupy tokenów, nie potwierdzenie konkretnego znaczenia każdej etykiety meczu. Kolor statusu LMuML powinien być zawsze uzupełniony tekstem lub ikoną. [Źródło](https://www.uefa.com/CompiledAssets/UefaCom/css/competitions/uefachampionsleague/base.css?_t=38f96a1241c121b9efe8df00ff74e5be).

## Gradienty i światło

| Deklaracja motywu | Parametry |
| --- | --- |
| Obszar pierwszego poziomu | 93,5°; `#0232FF` przy 0,59% → `#010056` przy 94,82% |
| Hero meczu | 207°; `#1730A8` przy 9% → `#0C0C58` przy 83% |
| Hero zakładek | 270°; `#010156` → `#0230F8` |
| Dekoracyjny pasek dużej karty | 90°; `#0232FF` → `#FFD300` → `#9A00FF` |

To opis wybranych deklaracji, nie pełna recepta na widoczną oprawę. Nawigacja korzysta również z obrazu tła UEFA. Sam gradient nie odtworzy całości.

**Propozycja dla LMuML:** własny, spokojny gradient granatu, z niewielką poświatą akcentu poza tekstem i polami edycji. Bez gwiezdnych ilustracji UEFA, wielobarwnego paska marki i obrazów pobieranych z ich CDN. [Źródło obserwacji](https://www.uefa.com/CompiledAssets/UefaCom/css/competitions/uefachampionsleague/base.css?_t=38f96a1241c121b9efe8df00ff74e5be).

## Typografia i wykończenie

| Element | Obserwacja |
| --- | --- |
| Tekst i nawigacja | Manrope regular / semibold / bold |
| Nagłówki redakcyjne UCL | Champions; m.in. wariant Bold |
| Nagłówek sekcji strony głównej | 32 px / 35,2 px na desktopie; 24 px / 26,4 px przy szerokości CSS 390 px |
| Nagłówek sekcji tabeli | Manrope semibold, 20 px / 26 px |
| Nazwy drużyn w małej karcie | Manrope, 14 px / 18,2 px |
| Data i godzina małej karty | 12 px / 15,6 px, biały z alfą 50% |
| Mała karta meczu | promień 8 px; obrys 1 px, biały z alfą 10%; bez aktywnego cienia |
| Przycisk obrysowany | promień 8 px; cyjanowy obrys 1 px |
| Skala promieni w systemie | 2 / 4 / 8 / 16 / 24 px |
| Skala interlinii w systemie | 1,1 / 1,3 / 1,5 |

Pomiar Shadow DOM jest istotny: zewnętrzny `pk-button` ma promień 0 px, ale właściwy element przycisku wewnątrz ma 8 px. Podobnie grubość fontu „semibold” bywa zakodowana w osobnej nazwie rodziny, a nie w wartości `font-weight: 600`.

System definiuje też delikatne cienie, ale nie są one używane wszędzie. Widoczna głębia ciemnych kart wynika przede wszystkim ze zmiany powierzchni. [Wspólna skala](https://www.uefa.com/CompiledAssets/UefaCom/css/preload.css?_t=e0bce221b4cac338a8af15bf5dbf353e), [konfiguracja typografii UCL](https://www.uefa.com/CompiledAssets/UefaCom/css/competitions/uefachampionsleague/base.css?_t=38f96a1241c121b9efe8df00ff74e5be).

### Font dla LMuML

Fontów Champions i plików fontów z CDN UEFA nie przenosimy. Do rozważenia:

- **Inter z oficjalnej dystrybucji autora:** przeznaczony m.in. do interfejsów, z cyframi tabelarycznymi przydatnymi w rankingach. [Opis](https://rsms.me/inter/), [licencja OFL](https://raw.githubusercontent.com/rsms/inter/master/LICENSE.txt).
- **Manrope z dystrybucji Google Fonts:** licencja OFL 1.1. Nie należy utożsamiać go z obecnym Manrope V5 ze strony autora, który ma odrębne warunki. [OFL Google Fonts](https://github.com/google/fonts/blob/main/ofl/manrope/OFL.txt), [wyjaśnienie autora](https://www.sharanda.com/manrope).

Wybór pozostaje otwarty. Rekomendowany punkt wyjścia to jeden font, tekst 16–18 px, interlinia około 1,5 i cyfry tabelaryczne dla wyników. Nie kopiujemy ciasnej interlinii redakcyjnych nagłówków do formularzy.

## Ruch, hover i fokus

Zmierzony link „View all” przechodzi między kolorami tekstu, obramowania i tła przez **300 ms, ease-out**. Właściwy przycisk w Shadow DOM ma przejścia **300 ms, cubic-bezier(0.4, 0, 0.2, 1)**. To wybrane elementy, nie uniwersalny czas wszystkich animacji serwisu.

W dwóch przejrzanych podstawowych arkuszach nie znaleziono `prefers-reduced-motion`. Nie rozstrzyga to o pozostałych paczkach i komponentach. Nie wykonano pełnego audytu fokusu ani animacji całego serwisu.

**Propozycja dla LMuML:**

- Krótka zmiana stanu kontrolki: orientacyjnie 120–180 ms.
- Przejście układu lub rozwinięcie szczegółów: orientacyjnie 180–240 ms.
- Animacja wspiera potwierdzenie zapisu lub zmianę pozycji; nie przesuwa edytowanego pola.
- Jedna warstwa Motion i obsługa ograniczenia ruchu, bez niezależnych mechanizmów w każdym komponencie.
- Widoczny fokus, stan aktywny i komunikat tekstowy również bez najechania myszą.

Te czasy są własną propozycją. Obsługa preferencji ruchu wynika również z potrzeb użytkowników; [W3C opisuje ograniczanie animacji wywołanych interakcją](https://www.w3.org/WAI/WCAG22/Understanding/animation-from-interactions.html).

## Kontrast: co warto zachować, czego nie przenosić w ciemno

| Para kolorów UCL: tekst / tło | Wynik | Wniosek |
| --- | ---: | --- |
| `#FFFFFF` / `#000040` | 19,55:1 | Bardzo mocny kontrast |
| `#FFFFFF` / `#0A0A61` | 17,09:1 | Czytelna ciemna powierzchnia |
| `#00EEFF` / `#000040` | 13,66:1 | Wyrazisty link w ciemnym motywie |
| `#00004B` / `#00EEFF` | 13,32:1 | Odpowiednia para dla jasnego CTA |
| `#FFFFFF` / `#00EEFF` | 1,43:1 | Nie stosować białej etykiety na tym cyjanie |
| `#FFFFFF` / `#0232FF` | 7,23:1 | Czytelna para niebieskiego CTA |
| `#637A85` / `#FFFFFF` | 4,51:1 | Mały zapas ponad próg zwykłego tekstu |
| `#637A85` / `#F1F3F8` | 4,07:1 | Ta sama barwa nie spełnia tego progu na innym tle |

Wyniki są własnymi obliczeniami z tokenów, zaokrąglonymi do prezentacji. Ocena progów opiera się na wartości przed zaokrągleniem. To nie są zarzuty dotyczące całego serwisu: nie każda hipotetyczna para występuje w rzeczywistym komponencie.

WCAG AA wymaga co najmniej 4,5:1 dla zwykłego tekstu, z wyjątkami opisanymi w kryterium. Dla istotnych wskazówek wizualnych kontrolek obowiązuje osobne kryterium 3:1 względem sąsiednich kolorów. Nie wystarczy sprawdzić samej etykiety przycisku. [Tekst](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html), [elementy nietekstowe](https://www.w3.org/WAI/WCAG22/Understanding/non-text-contrast.html).

## Wariant porównawczy kolorów LMuML

Poniższa propozycja dokumentuje wcześniejsze porównanie odcieni.

Kierunek: granat o bardziej stalowym odcieniu, turkus zamiast neonowego cyjanu, spokojniejsze powierzchnie. Rezygnacja z charakterystycznej magenty i dekoracji UCL. Warianty poniżej umożliwiają ocenę kolorów; nie przesądzają, czy cała aplikacja otrzyma dwa motywy.

| Rola | LMuML — ciemny | LMuML — jasny |
| --- | --- | --- |
| Tło | `#101B35` | `#F5F7FC` |
| Karta | `#182845` | `#FFFFFF` |
| Podwyższona powierzchnia | `#223556` | `#EAF0F9` |
| Tekst główny | `#F4F7FC` | `#14243C` |
| Tekst drugorzędny | `#B5C4D9` | `#51647F` |
| Główna akcja | `#38D6C6` | `#284ED8` |
| Tekst na akcji | `#082C32` | `#FFFFFF` |
| Link | `#73DBD2` | `#2444B8` |
| Obramowanie kontrolki | `#6F85A6` | `#74849C` |
| Dekoracyjny separator | `#3B4F70` | `#D5DEEC` |

Obramowanie kontrolki i dekoracyjny separator mają różne obowiązki. Subtelny separator nie powinien być jedyną wskazówką granicy pola edycji lub stanu zaznaczenia.

### Sprawdzenie proponowanych par

Podane zakresy obejmują tło, kartę i podwyższoną powierzchnię.

| Sprawdzana para | Ciemny | Jasny |
| --- | ---: | ---: |
| Tekst główny / powierzchnie | 11,43–15,90:1 | 13,61–15,59:1 |
| Tekst drugorzędny / powierzchnie | 6,93–9,64:1 | 5,27–6,04:1 |
| Link / powierzchnie | 7,47–10,40:1 | 7,07–8,10:1 |
| Obramowanie kontrolki / powierzchnie | 3,26–4,54:1 | 3,32–3,80:1 |
| Tekst / główna akcja | 8,19:1 | 6,62:1 |
| Wypełnienie akcji / powierzchnie | 6,78–9,43:1 | 5,78–6,62:1 |

Te konkretne pary mają odpowiedni zapas dla założonych progów. Nie oznacza to jeszcze zgodności całego przyszłego UI: osobno trzeba sprawdzić fokus, błędy, stany, skalowanie tekstu i rzeczywiste tła.

## Prawa i własna tożsamość

Ogólny pomysł stylistyczny należy odróżnić od konkretnego wykonania. Polskie prawo autorskie rozróżnia ideę i sposób jej wyrażenia. Nie jest to jednak zgoda na odtworzenie całej identyfikacji UEFA. [Art. 1 ust. 2¹, tekst jednolity z 2025 r.](https://eli.gov.pl/api/acts/DU/2025/24/text/I/D20250024.pdf).

Regulamin UEFA nie udziela ogólnej licencji na logo, oznaczenia, fonty, zdjęcia, filmy czy inne materiały. Ogranicza również reprodukcję i automatyczne gromadzenie treści. Niekomercyjny charakter LMuML sam nie zastępuje zgody. Wynikiem badania są własne notatki; pełne kopie HTML/CSS nie są zachowywane, a aplikacja nie otrzymuje zależności od assetów UEFA. [UEFA, pkt 6.2 i 8](https://www.uefa.com/termsconditions/).

Dla LMuML przyjmujemy jako granicę prac: własne logo, własne CSS, własne komponenty i oprawę, font z potwierdzoną licencją, bez starball i sugerowania afiliacji UEFA. Przy odsyłaniu do UEFA nie sugerujemy ich poparcia. [UEFA, pkt 6.9](https://www.uefa.com/termsconditions/).

Nie należy obiecywać, że „każdy kolor jest wolny”: kolor i zestawienie kolorów mogą być znakami towarowymi. Nie przeprowadzono badania konkretnych rejestracji UEFA. Własna paleta zmniejsza podobieństwo wizualne; sama zmiana kilku wartości HEX nie gwarantuje braku naruszenia. [EUIPO: znaki kolorowe](https://guidelines.euipo.europa.eu/2319054/2228017/trade-mark-guidelines/14-colour-marks).

## Co wykorzystać w kolejnej rozmowie

1. Ocenić preferowane oryginalne kolory na własnej karcie typowania, z własnymi nazwami, bez grafik UEFA.
2. Porównać jasną powierzchnię danych z ciemną; nie projektować osobnych funkcji dla każdego wyglądu.
3. Wybrać jeden font z konkretnej dystrybucji i zachować jego licencję.
4. Ustalić semantyczne nazwy kolorów: powierzchnia, tekst, akcja, fokus, stan — bez powielania surowych HEX w komponentach.
5. Sprawdzić czytelność na telefonie, powiększony tekst i cele dotykowe. Jako cel wygody można przyjąć co najmniej 44 × 44 px; [W3C opisuje to w kryterium rozszerzonym AAA](https://www.w3.org/WAI/WCAG22/Understanding/target-size-enhanced.html).

Badanie nie zmienia wybranego zestawu React, shadcn/ui, Radix, Tailwind i Motion. Nie wymaga nowej usługi ani zwiększenia kosztów utrzymania. Implementacja produktu pozostaje osobnym etapem.

## Rozwinięcie motywu światła — 3 listopada 2026

Kierunek oprawy LMuML łączy pryzmatyczne gradienty, błękitne refleksy i przejścia w neonowy fiolet. Referencje łączą ciemne płaszczyzny danych, barwne światło na obrzeżach oraz wyraźne, szklane krawędzie.

Oficjalny komunikat UEFA z 23 sierpnia 2024 r. potwierdza koncepcję „Kick of Light”: pryzmat rozszczepiający światło i szklane formy z kolorowymi krawędziami. To źródło opisu kierunku artystycznego, nie licencja na assety. [Komunikat UEFA](https://www.uefa.com/news-media/news/0290-1badd36e73b2-c3e5755b7fae-1000--uefa-unveils-new-uefa-champions-league-brand-identity/).

Aktualna próba LMuML wykorzystuje miękkie błękitno-fioletowe poświaty i nieregularną sieć cienkich połączeń SVG na całym ekranie. Kolor wzmacnia się lokalnie w pobliżu kursora. Interakcje pozostają błękitne, formularze mają kryjące granatowe powierzchnie, a podsumowanie i mobilna wyspa nawigacji mają szklaną oprawę. Ruch jest ciągły i spokojny, z przełącznikiem zatrzymania. Komfort i ograniczenie ruchu pokazują stan statyczny. Referencje: [Beams](https://www.shadcn.io/background/beams), [Gradient](https://www.shadcn.io/background/gradient), [Fluid Simulation](https://paveldogreat.github.io/WebGL-Fluid-Simulation/). Realizacja pozostaje własnym CSS/SVG i nie instaluje tych silników ani komponentów. To wersja do oceny w aplikacji, a nie zatwierdzona finalna identyfikacja.
