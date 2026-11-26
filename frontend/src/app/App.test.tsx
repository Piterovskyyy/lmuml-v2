import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";

vi.mock("@/features/home/HomePage", () => ({
  HomePage: ({
    seasonCode,
    seasonFallback,
  }: {
    seasonCode: string | null;
    seasonFallback?: ReactNode;
  }) => (
    <main tabIndex={-1}>
      <h1>Strona główna testowa</h1>
      {seasonCode ? <p>{seasonCode}</p> : seasonFallback}
    </main>
  ),
}));

vi.mock("@/features/predictions/components/PredictionsPage", () => ({
  PredictionsPage: () => (
    <main tabIndex={-1}>
      <h1>Typowanie testowe</h1>
      <input aria-label="Typ testowy" defaultValue="" />
    </main>
  ),
}));

vi.mock("@/features/predictions/components/PublishedPredictionsPage", () => ({
  PublishedPredictionsPage: ({ seasonCode }: { seasonCode: string }) => (
    <main tabIndex={-1}>
      <h1>Opublikowane kolejki</h1>
      <p>{seasonCode}</p>
    </main>
  ),
}));

vi.mock("@/features/matches/components/MatchesPage", () => ({
  MatchesPage: ({ seasonCode }: { seasonCode: string }) => (
    <main tabIndex={-1}>
      <h1>Mecze testowe</h1>
      <p>{seasonCode}</p>
      <input aria-label="Filtr testowy" defaultValue="" />
    </main>
  ),
}));

vi.mock("@/features/ranking/RankingPage", () => ({
  RankingPage: ({ seasonCode, navigation }: { seasonCode: string; navigation?: ReactNode }) => (
    <main tabIndex={-1}>
      <h1>Ranking testowy</h1>
      {navigation}
      <p>{seasonCode}</p>
    </main>
  ),
}));

vi.mock("@/features/statistics/StatisticsPage", () => ({
  StatisticsPage: ({ seasonCode, navigation }: { seasonCode: string; navigation?: ReactNode }) => (
    <main tabIndex={-1}>
      <h1>Statystyki testowe</h1>
      {navigation}
      <p>{seasonCode}</p>
    </main>
  ),
}));

vi.mock("@/features/players-predictions/PlayersPredictionsPage", () => ({
  PlayersPredictionsPage: ({
    seasonCode,
    navigation,
  }: {
    seasonCode: string;
    navigation?: ReactNode;
  }) => (
    <main tabIndex={-1}>
      <h1>Typy graczy testowe</h1>
      {navigation}
      <p>{seasonCode}</p>
    </main>
  ),
}));

vi.mock("@/features/account/components/PlayerAccountPage", () => ({
  PlayerAccountPage: () => (
    <main tabIndex={-1}>
      <h1>Konto testowe</h1>
    </main>
  ),
}));

function navigate(hash: string) {
  act(() => {
    window.history.replaceState(null, "", `/${window.location.search}${hash}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });
}

beforeEach(() => {
  window.history.replaceState(null, "", "/");
  localStorage.clear();
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => Response.json({ seasonCode: null })),
  );
});

afterEach(() => vi.unstubAllGlobals());

describe("App navigation", () => {
  it("opens public Start with the fallback season and keeps Konto in the header", async () => {
    render(<App />);

    expect(screen.getByRole("heading", { name: "Strona główna testowa" })).toBeInTheDocument();
    expect(await screen.findByText("api-football-2-2024")).toBeInTheDocument();
    expect(document.title).toBe("Start · LMuML");
    expect(screen.queryByLabelText("Filtr testowy")).not.toBeInTheDocument();
    expect(screen.queryByText("Opublikowane kolejki")).not.toBeInTheDocument();
    expect(screen.getByRole("link", { name: "LMuML — strona główna" })).toHaveAttribute(
      "href",
      "#start",
    );
    const navigation = screen.getByRole("navigation", { name: "Nawigacja główna" });
    expect(within(navigation).getAllByRole("link")).toHaveLength(4);
    expect(screen.queryByRole("navigation", { name: "Widoki rankingu" })).not.toBeInTheDocument();
    expect(within(navigation).getByRole("link", { name: "Start" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(navigation).getByRole("link", { name: "Moje typy" })).toHaveAttribute(
      "href",
      "#typy",
    );
    expect(within(navigation).getByRole("link", { name: "Rozgrywki" })).toHaveAttribute(
      "href",
      "#rozgrywki",
    );
    expect(within(navigation).getByRole("link", { name: "Ranking" })).toHaveAttribute(
      "href",
      "#ranking",
    );
    expect(within(navigation).queryByRole("link", { name: "Konto" })).not.toBeInTheDocument();
    expect(within(screen.getByRole("banner")).getByRole("link", { name: "Konto" })).toHaveAttribute(
      "href",
      "#konto",
    );
    expect(document.activeElement).toBe(document.body);
  });

  it("keeps unfinished predictions and match filters across page transitions", () => {
    window.history.replaceState(null, "", "/?demo=1");
    render(<App />);
    fireEvent.change(screen.getByRole("textbox", { name: "Typ testowy" }), {
      target: { value: "2" },
    });

    navigate("#mecze");
    expect(document.title).toBe("Rozgrywki · LMuML");
    fireEvent.change(screen.getByRole("textbox", { name: "Filtr testowy" }), {
      target: { value: "Inter" },
    });
    expect(screen.getByRole("main")).toHaveFocus();
    expect(document.querySelectorAll("#main-content")).toHaveLength(1);

    navigate("#ranking");
    expect(document.title).toBe("Ranking · LMuML");
    expect(screen.getByRole("heading", { name: "Ranking testowy" })).toBeInTheDocument();
    navigate("#konto");
    expect(document.title).toBe("Konto · LMuML");
    expect(screen.getByRole("heading", { name: "Konto testowe" })).toBeInTheDocument();
    navigate("#start");
    expect(screen.getByRole("heading", { name: "Strona główna testowa" })).toBeInTheDocument();
    navigate("#typy");
    expect(document.title).toBe("Moje typy · LMuML");
    expect(screen.queryByText("Strona główna testowa")).not.toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Typ testowy" })).toHaveValue("2");
    navigate("#mecze");
    expect(screen.getByRole("textbox", { name: "Filtr testowy" })).toHaveValue("Inter");
    expect(document.querySelectorAll("#main-content")).toHaveLength(1);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("opens an existing results guide link on the matches page", () => {
    window.history.replaceState(null, "", "/?season=archiwum#o-wynikach");
    render(<App />);

    expect(screen.getByRole("heading", { name: "Mecze testowe" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Rozgrywki" })).toHaveAttribute("aria-current", "page");
    expect(window.location.search).toBe("?season=archiwum");
    expect(screen.getByText("archiwum")).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });

  it("opens a password reset link on the account page", () => {
    window.history.replaceState(null, "", `/#konto?reset=${"a".repeat(43)}`);
    render(<App />);

    expect(screen.getByRole("heading", { name: "Konto testowe" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Konto" })).toHaveAttribute("aria-current", "page");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("opens players predictions within Ranking and switches to the classification in the same season", () => {
    window.history.replaceState(null, "", "/?season=liga-archiwalna#typy-graczy");
    render(<App />);

    expect(document.title).toBe("Typy graczy · LMuML");
    expect(screen.getByRole("heading", { name: "Typy graczy testowe" })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByText("liga-archiwalna")).toBeInTheDocument();
    expect(screen.queryByText("Opublikowane kolejki")).not.toBeInTheDocument();
    expect(screen.queryByText("Mecze testowe")).not.toBeInTheDocument();
    expect(screen.queryByText("Ranking testowy")).not.toBeInTheDocument();
    const primary = screen.getByRole("navigation", { name: "Nawigacja główna" });
    expect(within(primary).getByRole("link", { name: "Ranking" })).toHaveAttribute(
      "aria-current",
      "location",
    );
    expect(within(primary).queryByRole("link", { name: "Typy graczy" })).not.toBeInTheDocument();
    const views = screen.getByRole("navigation", { name: "Widoki rankingu" });
    expect(within(views).getByRole("link", { name: "Typy graczy" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(views).getByRole("link", { name: "Klasyfikacja" })).toHaveAttribute(
      "href",
      "#ranking",
    );
    fireEvent.click(screen.getByRole("link", { name: "Przejdź do treści" }));
    expect(screen.getByRole("main")).toHaveFocus();

    navigate("#ranking");

    expect(screen.queryByText("Typy graczy testowe")).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Ranking testowy" })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByText("liga-archiwalna")).toBeInTheDocument();
    const classificationViews = screen.getByRole("navigation", { name: "Widoki rankingu" });
    expect(within(classificationViews).getByRole("link", { name: "Klasyfikacja" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(within(classificationViews).getByRole("link", { name: "Typy graczy" })).toHaveAttribute(
      "href",
      "#typy-graczy",
    );
    expect(within(classificationViews).getByRole("link", { name: "Statystyki" })).toHaveAttribute(
      "href",
      "#statystyki",
    );
    expect(screen.getByRole("main")).toHaveFocus();
    navigate("#statystyki");
    expect(screen.getByRole("heading", { name: "Statystyki testowe" })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByText("liga-archiwalna")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Statystyki" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    expect(fetch).not.toHaveBeenCalled();
  });

  it("moves the keyboard skip link to active content without changing the route", async () => {
    window.history.replaceState(null, "", "/#ranking");
    render(<App />);
    await screen.findByRole("heading", { name: "Ranking testowy" });

    fireEvent.click(screen.getByRole("link", { name: "Przejdź do treści" }));

    expect(screen.getByRole("main")).toHaveFocus();
    expect(window.location.hash).toBe("#ranking");
  });

  it("keeps readability settings across navigation", async () => {
    render(<App />);
    await screen.findByText("api-football-2-2024");
    fireEvent.click(screen.getByRole("button", { name: "Wygląd" }));
    fireEvent.click(screen.getByRole("switch", { name: /Widok komfortowy/ }));
    fireEvent.click(screen.getByRole("button", { name: "Gotowe" }));

    navigate("#mecze");

    expect(document.documentElement).toHaveAttribute("data-comfort", "true");
    expect(localStorage.getItem("lmuml.comfort.v1")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Wygląd" }));
    expect(screen.getByRole("switch", { name: /Widok komfortowy/ })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    expect(screen.getByRole("switch", { name: /^Animacja tła/ })).toBeDisabled();
    expect(screen.getByRole("switch", { name: /^Animacja tła/ })).toHaveAttribute(
      "aria-checked",
      "false",
    );
    expect(document.querySelector(".star-backdrop")).toHaveAttribute("data-reduced-motion", "true");
  });

  it("remembers an explicit background pause across navigation and remount without changing comfort", () => {
    window.history.replaceState(null, "", "/?demo=1");
    localStorage.setItem("lmuml.background-style.v1", "mesh");
    const view = render(<App />);
    expect(document.querySelector(".star-backdrop")).toHaveAttribute(
      "data-reduced-motion",
      "false",
    );
    fireEvent.click(screen.getByRole("button", { name: "Wygląd" }));
    fireEvent.click(screen.getByRole("switch", { name: /^Animacja tła/ }));
    fireEvent.click(screen.getByRole("button", { name: "Gotowe" }));
    navigate("#konto");
    expect(localStorage.getItem("lmuml.background-motion.v1")).toBe("false");
    expect(localStorage.getItem("lmuml.comfort.v1")).toBe("false");
    expect(document.querySelector(".star-backdrop")).toHaveAttribute("data-reduced-motion", "true");
    view.unmount();
    render(<App />);
    expect(document.querySelector(".star-backdrop")).toHaveAttribute("data-reduced-motion", "true");
  });

  it("resolves the configured season once and shares it across player views", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ seasonCode: "liga-2026" }));
    render(<App />);

    await within(screen.getByRole("main")).findByText("liga-2026");
    navigate("#typy");
    expect(within(screen.getByRole("main")).getByText("liga-2026")).toBeInTheDocument();
    navigate("#rozgrywki");
    expect(within(screen.getByRole("main")).getByText("liga-2026")).toBeInTheDocument();
    navigate("#ranking");
    expect(within(screen.getByRole("main")).getByText("liga-2026")).toBeInTheDocument();
    navigate("#typy-graczy");
    expect(document.title).toBe("Typy graczy · LMuML");
    expect(screen.getByRole("heading", { name: "Typy graczy testowe" })).toBeInTheDocument();
    expect(within(screen.getByRole("main")).getByText("liga-2026")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Typy graczy" })).toHaveAttribute(
      "aria-current",
      "page",
    );
    navigate("#konto");
    expect(screen.queryByRole("heading", { name: "Typy graczy testowe" })).not.toBeInTheDocument();
    expect(vi.mocked(fetch).mock.calls.map(([url]) => url)).toEqual(["/api/v1/seasons/active"]);
  });

  it("keeps Start accessible when the season lookup fails and lets the visitor retry", async () => {
    vi.mocked(fetch)
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(Response.json({ seasonCode: "liga-2026" }));
    render(<App />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "Nie udało się wczytać aktywnego sezonu.",
    );
    expect(screen.getByRole("heading", { name: "Strona główna testowa" })).toBeInTheDocument();
    navigate("#konto");
    expect(screen.getByRole("heading", { name: "Konto testowe" })).toBeInTheDocument();
    navigate("#start");
    fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));

    expect(await screen.findByText("liga-2026")).toBeInTheDocument();
    expect(fetch).toHaveBeenCalledTimes(2);
  });
});
