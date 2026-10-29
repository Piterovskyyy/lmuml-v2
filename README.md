# LMuML

Aplikacja do wspólnego typowania wyników meczów piłkarskich, śledzenia punktów i porównywania wyników w rankingu.

Nowa wersja powstaje od podstaw, z naciskiem na wygodę korzystania na telefonie, czytelny interfejs i utrzymywalny kod. Dotychczasowa aplikacja pozostaje punktem odniesienia dla funkcji i zasad.

## Stan projektu

Repozytorium zawiera początkową dokumentację. Kod aplikacji oraz konfiguracja uruchamiania będą dodawane w kolejnych etapach.

## Kierunek techniczny

- Frontend: React, TypeScript, Vite, shadcn/ui z Radix, Tailwind CSS i Motion.
- Backend: Java i Spring Boot, organizacja według funkcji w modularnym monolicie.
- Baza danych: PostgreSQL.
- Redis, aktualizacje na żywo i zadania w tle: wdrażane wraz z konkretnymi funkcjami; szczegółowe mechanizmy pozostają do ustalenia.

## Priorytety

- Proste typowanie oraz jednoznaczna informacja o zapisie i terminie.
- Dostępność, obsługa klawiatury, większy tekst i opcjonalne ustawienia komfortu.
- Jawne reguły punktacji, poprawne przeliczenia po korekcie wyniku i spójne rankingi.
- Czytelne granice odpowiedzialności, testy ważnych reguł i powtarzalne uruchamianie.
- Kontrolowane wdrożenia oraz sprawdzone kopie i odtwarzanie danych.

## Pierwszy etap

Ustalenie reguł typowania i punktacji, a następnie mały przepływ odczytu: PostgreSQL → Spring Boot → mobilny widok meczów. Kolejne funkcje będą dodawane stopniowo.

## Decyzje techniczne

- [ADR 0001: komponenty UI i animacje](docs/decisions/0001-frontend-ui.md).
