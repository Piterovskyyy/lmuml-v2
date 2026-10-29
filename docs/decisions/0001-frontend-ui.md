# ADR 0001 — komponenty UI i animacje

Status: przyjęta przez właściciela projektu 29 października 2026 r.

## Kontekst

LMuML potrzebuje czytelnego interfejsu mobilnego dla użytkowników o różnym wieku i doświadczeniu. Domyślny widok ma być wygodny, a opcjonalny komfortowy zwiększać tekst, cele dotykowe i odstępy przy wspólnych funkcjach. Zależy nam na estetycznej oprawie, kontrolowanych animacjach i utrzymywalnym kodzie.

Porównano shadcn/ui, Mantine i MUI oraz przygotowano stylizowane makiety głównych ekranów. Makiety ilustrowały możliwości wizualne; nie stanowiły pomiaru wydajności ani testu pełnych bibliotek.

## Decyzja

Wybieramy **shadcn/ui z bazą Radix, Tailwind CSS oraz Motion do animacji**, w aplikacji React z TypeScript i Vite.

Komponenty shadcn dodajemy wraz z potrzebami funkcji. Ich wspólne warianty, semantyka i wygląd są utrzymywane centralnie. Komponenty domenowe, np. karta typowania, pozostają oddzielone od podstawowych kontrolek.

Wspólne zmienne i warianty rozmiaru obsługują ustawienie standardowe i komfortowe. Animacje informują o zmianie stanu, respektują preferencję ograniczenia ruchu i zachowują stabilność pól podczas edycji.

## Uzasadnienie

- Własny kod komponentów pozwala dostosować wygląd i czytelność do LMuML.
- Tailwind pozwala spójnie dostosować wygląd lokalnych komponentów oraz warianty rozmiaru i czytelności.
- Radix dostarcza podstawy zachowania złożonych kontrolek, takie jak obsługa klawiatury i fokusu.
- Motion pozwala wprowadzać animacje stanu i układu w jednym spójnym mechanizmie.
- Dobór do projektu wynika z kontroli i sposobu utrzymania kodu. Podobieństwo makiet nie rozstrzyga jakości bibliotek.

## Alternatywy

Mantine pozostaje pełnym zestawem gotowych komponentów z własnym systemem motywu. MUI dostarcza rozbudowane komponenty Material Design. Oba rozwiązania pozwalają budować estetyczne i dostępne aplikacje; dla LMuML wybrano model lokalnego kodu i dopasowania oprawy.

## Konsekwencje

- Odpowiadamy za przegląd i utrzymanie lokalnie zmienionych komponentów shadcn.
- Pochodzenie i istotne modyfikacje komponentów mają być możliwe do odtworzenia.
- Biblioteka nie zastępuje sprawdzenia dostępności całego procesu: etykiet, kontrastu, powiększenia, celów dotykowych, błędów i fokusu.
- Konkretne wersje, preset Radix i zgodność zależności sprawdzimy przy inicjalizacji. Ta decyzja określa bazę nowego frontendu; instalacja zależności nastąpi w pierwszym zadaniu implementacyjnym.
- Ponownie rozważymy wybór, jeżeli istotne wymaganie nie daje się spełnić bez nadmiernych lokalnych modyfikacji lub koszt utrzymania staje się nieproporcjonalny.

## Źródła

- [Model shadcn/ui](https://ui.shadcn.com/docs).
- [Dostępność Radix](https://www.radix-ui.com/primitives/docs/overview/accessibility).
- [Integracja Motion i Radix](https://motion.dev/docs/radix).
