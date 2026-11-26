import { StrictMode } from "react";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { PlayerSession } from "../api/player-account";
import { PlayerAccountPage } from "./PlayerAccountPage";

const signedOut: PlayerSession = {
  authenticated: false,
  csrfToken: "csrf-before-login",
  player: null,
};
const signedIn: PlayerSession = {
  authenticated: true,
  csrfToken: "csrf-after-login",
  player: {
    id: "40000000-0000-0000-0000-000000000001",
    displayName: "Gracz testowy",
    email: "gracz@example.test",
  },
};
const accountPath = "/api/v1/player";
const testPassword = "test-only-password";
const resetToken = "a".repeat(43);

function submittedCsrf(init?: RequestInit) {
  return new Headers(init?.headers).get("X-CSRF-TOKEN");
}

afterEach(() => {
  vi.unstubAllGlobals();
  window.history.replaceState(null, "", "/");
});

it.each([6, 100])("registers a password with %i emoji and returns to login", async (emojiCount) => {
  const registrationPassword = ` ${"🏆".repeat(emojiCount)} `;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === `${accountPath}/session`) return Response.json(signedOut);
    if (url === `${accountPath}/register` && init?.method === "POST") {
      return new Response(null, { status: 201 });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<PlayerAccountPage />);

  fireEvent.click(await screen.findByRole("button", { name: "Rejestracja", pressed: false }));
  expect(screen.getByRole("button", { name: "Rejestracja", pressed: true })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText("Adres e-mail"), {
    target: { value: signedIn.player.email },
  });
  fireEvent.change(screen.getByLabelText("Nazwa gracza"), {
    target: { value: signedIn.player.displayName },
  });
  fireEvent.change(screen.getByLabelText("Hasło"), { target: { value: registrationPassword } });
  fireEvent.click(screen.getByRole("button", { name: "Załóż konto" }));

  expect(await screen.findByText(/Konto zostało utworzone/)).toBeInTheDocument();
  expect(screen.getByLabelText("Adres e-mail")).toHaveValue(signedIn.player.email);
  expect(screen.getByLabelText("Hasło")).toHaveValue("");
  await waitFor(() => expect(screen.getByLabelText("Hasło")).toHaveFocus());
  const [, registration] = fetchMock.mock.calls.find(([url]) => url === `${accountPath}/register`)!;
  expect(submittedCsrf(registration)).toBe(signedOut.csrfToken);
  expect(JSON.parse(String(registration?.body))).toEqual({
    email: signedIn.player.email,
    displayName: signedIn.player.displayName,
    password: registrationPassword,
  });
  expect(fetchMock.mock.calls.some(([url]) => url === `${accountPath}/login`)).toBe(false);
});

it("keeps a wrong password generic, then uses the refreshed CSRF token to sign out", async () => {
  let session: PlayerSession = signedOut;
  const loginResponses = [401, 204];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === `${accountPath}/session`) return Response.json(session);
    if (url === `${accountPath}/login` && init?.method === "POST") {
      const status = loginResponses.shift();
      if (status === 204) session = signedIn;
      return new Response(null, { status });
    }
    if (url === `${accountPath}/logout` && init?.method === "POST") {
      session = signedOut;
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<PlayerAccountPage />);

  const login = await screen.findByRole("button", { name: "Zaloguj się" });
  fireEvent.change(screen.getByLabelText("Adres e-mail"), {
    target: { value: signedIn.player.email },
  });
  fireEvent.change(screen.getByLabelText("Hasło"), { target: { value: testPassword } });
  fireEvent.click(login);
  expect(await screen.findByRole("alert")).toHaveTextContent("Nieprawidłowy e-mail lub hasło.");
  expect(screen.getByLabelText("Hasło")).toHaveValue("");

  fireEvent.change(screen.getByLabelText("Hasło"), { target: { value: testPassword } });
  fireEvent.click(login);
  expect(await screen.findByRole("heading", { name: "Cześć, Gracz testowy!" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Wyloguj się" }));
  expect(await screen.findByText("Wylogowano Cię.")).toBeInTheDocument();
  const [, loginRequest] = fetchMock.mock.calls.find(([url]) => url === `${accountPath}/login`)!;
  expect(submittedCsrf(loginRequest)).toBe(signedOut.csrfToken);
  expect(loginRequest?.body).toEqual(
    new URLSearchParams({
      username: signedIn.player.email,
      password: testPassword,
    }),
  );
  const [, logoutRequest] = fetchMock.mock.calls.find(([url]) => url === `${accountPath}/logout`)!;
  expect(submittedCsrf(logoutRequest)).toBe(signedIn.csrfToken);
  expect(screen.queryByText(signedIn.player.email)).not.toBeInTheDocument();
});

it("checks password confirmation, handles an incorrect current password and returns to login after saving", async () => {
  let session: PlayerSession = signedIn;
  const changeStatuses = [422, 204];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === `${accountPath}/session`) return Response.json(session);
    if (url === `${accountPath}/password` && init?.method === "POST") {
      const status = changeStatuses.shift();
      if (status === 204) session = signedOut;
      return new Response(null, { status });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<PlayerAccountPage />);

  fireEvent.click(await screen.findByRole("button", { name: "Zmień hasło" }));
  const newPassword = " nowe 🏆 ";
  fireEvent.change(screen.getByLabelText("Obecne hasło"), { target: { value: "niepoprawne" } });
  fireEvent.change(screen.getByLabelText("Nowe hasło"), { target: { value: newPassword } });
  fireEvent.change(screen.getByLabelText("Powtórz nowe hasło"), { target: { value: "różne" } });
  const save = screen.getByRole("button", { name: "Zapisz nowe hasło" });
  fireEvent.click(save);
  expect(screen.getByRole("alert")).toHaveTextContent("Nowe hasła różnią się.");
  expect(fetchMock.mock.calls.some(([url]) => url === `${accountPath}/password`)).toBe(false);

  fireEvent.change(screen.getByLabelText("Powtórz nowe hasło"), { target: { value: newPassword } });
  fireEvent.click(save);
  expect(await screen.findByRole("alert")).toHaveTextContent("Obecne hasło jest nieprawidłowe.");

  fireEvent.change(screen.getByLabelText("Obecne hasło"), { target: { value: testPassword } });
  fireEvent.click(save);
  expect(await screen.findByText(/Hasło zostało zmienione/)).toBeInTheDocument();
  expect(screen.getByLabelText("Adres e-mail")).toHaveValue(signedIn.player.email);
  expect(screen.getByLabelText("Hasło")).toHaveValue("");
  await waitFor(() => expect(screen.getByLabelText("Hasło")).toHaveFocus());

  const [, changeRequest] = fetchMock.mock.calls
    .filter(([url]) => url === `${accountPath}/password`)
    .at(-1)!;
  expect(submittedCsrf(changeRequest)).toBe(signedIn.csrfToken);
  expect(JSON.parse(String(changeRequest?.body))).toEqual({
    currentPassword: testPassword,
    newPassword,
  });
});

it("shows the disabled environment without exposing the account form", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 404 })));
  render(<PlayerAccountPage />);

  expect(await screen.findByText(/Logowanie graczy jest wyłączone/)).toBeInTheDocument();
  expect(screen.queryByRole("form")).not.toBeInTheDocument();
});

it("requests a reset link without exposing whether the account exists", async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === `${accountPath}/session`) return Response.json(signedOut);
    if (url === `${accountPath}/password-reset/request` && init?.method === "POST") {
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  render(<PlayerAccountPage />);

  const forgot = await screen.findByRole("button", { name: "Nie pamiętam hasła" });
  fireEvent.change(screen.getByLabelText("Adres e-mail"), {
    target: { value: signedIn.player.email },
  });
  fireEvent.click(forgot);
  expect(screen.getByLabelText("Adres e-mail")).toHaveFocus();
  expect(screen.getByLabelText("Adres e-mail")).toHaveValue(signedIn.player.email);
  expect(screen.queryByLabelText("Hasło")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Wyślij link do ustawienia hasła" }));

  expect(await screen.findByRole("status")).toHaveTextContent(
    "Jeśli ten adres jest przypisany do konta, otrzymasz link do ustawienia nowego hasła.",
  );
  const [, request] = fetchMock.mock.calls.find(([url]) => url.endsWith("password-reset/request"))!;
  expect(submittedCsrf(request)).toBe(signedOut.csrfToken);
  expect(JSON.parse(String(request?.body))).toEqual({ email: signedIn.player.email });
});

it("removes the reset token from the address, then saves a password only after explicit confirmation", async () => {
  let session: PlayerSession = signedIn;
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (url === `${accountPath}/session`) return Response.json(session);
    if (url === `${accountPath}/password-reset/confirm` && init?.method === "POST") {
      session = signedOut;
      return new Response(null, { status: 204 });
    }
    return new Response(null, { status: 404 });
  });
  vi.stubGlobal("fetch", fetchMock);
  window.history.replaceState(null, "", `/#konto?reset=${resetToken}`);
  render(
    <StrictMode>
      <PlayerAccountPage />
    </StrictMode>,
  );

  const save = await screen.findByRole("button", { name: "Zapisz nowe hasło" });
  expect(window.location.hash).toBe("#konto");
  expect(screen.queryByText(resetToken)).not.toBeInTheDocument();
  expect(fetchMock.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);
  const newPassword = " nowe 🏆 ";
  fireEvent.change(screen.getByLabelText("Nowe hasło"), { target: { value: newPassword } });
  fireEvent.change(screen.getByLabelText("Powtórz nowe hasło"), { target: { value: "różne" } });
  fireEvent.click(save);
  expect(screen.getByRole("alert")).toHaveTextContent("Nowe hasła różnią się.");
  expect(fetchMock.mock.calls.every(([, init]) => init?.method !== "POST")).toBe(true);

  fireEvent.change(screen.getByLabelText("Powtórz nowe hasło"), { target: { value: newPassword } });
  fireEvent.click(save);
  expect(await screen.findByText(/Nowe hasło zostało zapisane/)).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Zaloguj się" })).toBeInTheDocument();
  const [, confirm] = fetchMock.mock.calls.find(([url]) => url.endsWith("password-reset/confirm"))!;
  expect(submittedCsrf(confirm)).toBe(signedIn.csrfToken);
  expect(JSON.parse(String(confirm?.body))).toEqual({ token: resetToken, newPassword });
});

it("allows requesting another link after an expired or used token is rejected", async () => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) =>
      url === `${accountPath}/session`
        ? Response.json(signedOut)
        : new Response(null, { status: 400 }),
    ),
  );
  render(<PlayerAccountPage />);
  await screen.findByRole("heading", { name: "Zaloguj się" });
  act(() => {
    window.history.replaceState(null, "", `/#konto?reset=${resetToken}`);
    window.dispatchEvent(new HashChangeEvent("hashchange"));
  });

  fireEvent.change(screen.getByLabelText("Nowe hasło"), { target: { value: testPassword } });
  fireEvent.change(screen.getByLabelText("Powtórz nowe hasło"), {
    target: { value: testPassword },
  });
  fireEvent.click(screen.getByRole("button", { name: "Zapisz nowe hasło" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("wygasł lub został już użyty");
  fireEvent.click(screen.getByRole("button", { name: "Poproś o nowy link" }));
  expect(screen.getByRole("heading", { name: "Odzyskaj dostęp" })).toBeInTheDocument();
  expect(window.location.hash).toBe("#konto");
});
