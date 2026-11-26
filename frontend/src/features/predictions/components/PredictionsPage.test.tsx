import { fireEvent, render, screen, within } from "@testing-library/react";
import { LazyMotion, domAnimation } from "motion/react";
import { describe, expect, it, vi } from "vitest";
import { PredictionsPage } from "./PredictionsPage";

function renderPage() {
  render(
    <LazyMotion features={domAnimation}>
      <PredictionsPage reduceMotion />
    </LazyMotion>,
  );
}

function psgCard() {
  return within(screen.getByRole("article", { name: "Paris Saint-Germain — Arsenal" }));
}

describe("prediction preview", () => {
  it("saves all ready predictions together and leaves incomplete scores in the preview", () => {
    const fetch = vi.spyOn(globalThis, "fetch");
    renderPage();
    expect(screen.getByText(/Przykładowe mecze i wyniki/)).toBeInTheDocument();
    const card = psgCard();
    const fields = card.getAllByRole("textbox");
    const save = screen.getByRole("button", { name: /^Zapisz typy/ });
    expect(screen.getAllByRole("button", { name: /^Zapisz typy/ })).toHaveLength(1);
    expect(fields[0]).toHaveValue("");
    expect(save).toBeDisabled();
    fireEvent.change(fields[0], { target: { value: "0" } });
    expect(card.getByText("Niezapisane zmiany")).toBeInTheDocument();
    expect(card.getByText("Uzupełnij oba pola wyniku.")).toBeInTheDocument();
    expect(save).toBeDisabled();
    fireEvent.change(fields[1], { target: { value: "0" } });
    const liverpool = within(screen.getByRole("article", { name: "Liverpool — FC Barcelona" }));
    const liverpoolFields = liverpool.getAllByRole("textbox");
    fireEvent.change(liverpoolFields[0], { target: { value: "2" } });
    const benfica = within(screen.getByRole("article", { name: "Benfica — Juventus" }));
    const benficaFields = benfica.getAllByRole("textbox");
    fireEvent.change(benficaFields[0], { target: { value: "1" } });
    fireEvent.change(benficaFields[1], { target: { value: "2" } });
    expect(save).toBeEnabled();
    expect(save).toHaveAccessibleName("Zapisz typy (2)");
    fireEvent.click(save);
    expect(card.getByText("Zapisany w podglądzie")).toBeInTheDocument();
    expect(fields[0]).toHaveValue("0");
    expect(fields[1]).toHaveValue("0");
    expect(benfica.getByText("Zapisany w podglądzie")).toBeInTheDocument();
    expect(liverpoolFields[0]).toHaveValue("2");
    expect(liverpoolFields[1]).toHaveValue("");
    expect(liverpool.getByText("Niezapisane zmiany")).toBeInTheDocument();
    expect(save).toBeDisabled();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "4");
    expect(screen.getByRole("status")).toHaveTextContent("Zapisane typy w podglądzie: 2.");
    expect(screen.getByRole("status")).toHaveTextContent("Niepełne typy zostają w szkicu.");
    expect(fetch).not.toHaveBeenCalled();
  });

  it("returns a saved prediction to clean state when edits are reverted", () => {
    renderPage();
    const card = within(
      screen.getByRole("article", { name: "Bayern Monachium — Borussia Dortmund" }),
    );
    const field = card.getAllByRole("textbox")[0];
    fireEvent.change(field, { target: { value: "3" } });
    expect(card.getByText("Niezapisane zmiany")).toBeInTheDocument();
    fireEvent.change(field, { target: { value: "2" } });
    expect(card.getByText("Zapisany w podglądzie")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Zapisz typy/ })).toBeDisabled();
  });

  it("locks started matches individually while allowing later ones and retaining each scenario's draft", () => {
    renderPage();
    fireEvent.change(psgCard().getAllByRole("textbox")[0], { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "W trakcie" }));
    const locked = within(
      screen.getByRole("article", { name: "Bayern Monachium — Borussia Dortmund" }),
    );
    expect(locked.queryByRole("textbox")).not.toBeInTheDocument();
    expect(locked.getByText("Typowanie zamknięte")).toBeInTheDocument();
    expect(locked.getByText("W trakcie · 30′")).toBeInTheDocument();
    expect(locked.getByText("Wynik na żywo")).toBeInTheDocument();
    expect(psgCard().getAllByRole("textbox")).toHaveLength(2);
    expect(psgCard().getAllByRole("textbox")[0]).toHaveValue("");
    fireEvent.change(psgCard().getAllByRole("textbox")[0], { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Przed meczami" }));
    expect(psgCard().getAllByRole("textbox")[0]).toHaveValue("4");
    fireEvent.click(screen.getByRole("button", { name: "W trakcie" }));
    expect(psgCard().getAllByRole("textbox")[0]).toHaveValue("1");
  });

  it("shows all finished predictions and regulation scores without inventing points or editable controls", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Po meczach" }));
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Zapisz typ/ })).not.toBeInTheDocument();
    expect(screen.getAllByText("Po 90 min")).toHaveLength(6);
    expect(screen.getAllByText("Do przerwy")).toHaveLength(6);
    expect(screen.getByText(/Punktację i rozliczanie rundy dodamy/)).toBeInTheDocument();
    expect(screen.getByRole("progressbar")).toHaveAttribute("value", "6");
  });

  it("moves to the next missing prediction using the summary action", () => {
    renderPage();
    fireEvent.click(screen.getByRole("button", { name: "Uzupełnij kolejny typ" }));
    expect(psgCard().getAllByRole("textbox")[0]).toHaveFocus();
  });
});
