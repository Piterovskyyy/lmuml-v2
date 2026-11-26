import { useSyncExternalStore } from "react";
import { isPasswordResetLink } from "@/features/account/password-reset-link";

export type AppPage =
  "start" | "typy" | "typy-graczy" | "mecze" | "ranking" | "statystyki" | "konto";

function readPage(): AppPage {
  if (isPasswordResetLink(window.location.hash)) return "konto";
  switch (window.location.hash) {
    case "#start":
      return "start";
    case "#typy":
      return "typy";
    case "#typy-graczy":
      return "typy-graczy";
    case "#rozgrywki":
    case "#tabela":
    case "#drabinka":
    case "#mecze":
    case "#o-wynikach":
      return "mecze";
    case "#ranking":
      return "ranking";
    case "#statystyki":
      return "statystyki";
    case "#konto":
      return "konto";
    case "":
      return new URLSearchParams(window.location.search).get("demo") === "1" ? "typy" : "start";
    default:
      return "start";
  }
}

function subscribe(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

export function useAppPage() {
  return useSyncExternalStore(subscribe, readPage);
}
