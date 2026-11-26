import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, LogOut, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  PlayerAccountError,
  playerAccountApi,
  type PlayerPasswordChange,
  type PlayerSession,
} from "../api/player-account";
import {
  isValidPlayerPassword,
  maximumPasswordLength,
  newPasswordError,
  passwordLengthHint,
  passwordPolicyError,
} from "../password-policy";
import { consumePasswordResetLink } from "../password-reset-link";
import { PlayerPasswordForm } from "./PlayerPasswordForm";
import { PlayerPasswordResetForm } from "./PlayerPasswordResetForm";
import "../player-account.css";

type SessionState =
  { status: "loading" | "disabled" | "error" } | { status: "ready"; session: PlayerSession };
type AccountMode = "login" | "register" | "forgot";
type AccountAction =
  "login" | "register" | "password" | "reset-request" | "reset-confirm" | "logout";
type Feedback = { kind: "error" | "success"; text: string; focusPassword?: true };

const minimumNameLength = 2;
const maximumNameLength = 40;
const accountForms = {
  login: {
    title: "Zaloguj się",
    description: "Wpisz e-mail i hasło do konta.",
    submit: "Zaloguj się",
    pending: "Logowanie…",
    action: "login",
  },
  register: {
    title: "Załóż konto",
    description: "Podaj e-mail i nazwę, pod którą będziesz grać.",
    submit: "Załóż konto",
    pending: "Tworzenie konta…",
    action: "register",
  },
  forgot: {
    title: "Odzyskaj dostęp",
    description: "Wpisz adres e-mail użyty przy zakładaniu konta.",
    submit: "Wyślij link do ustawienia hasła",
    pending: "Wysyłanie…",
    action: "reset-request",
  },
} as const;

function actionError(action: AccountAction, status?: number) {
  if (status === 429) return "Za dużo prób. Spróbuj ponownie później.";
  if (action === "login") {
    return status === 401
      ? "Nieprawidłowy e-mail lub hasło."
      : "Nie udało się zalogować. Spróbuj ponownie.";
  }
  if (action === "register") {
    if (status === 409)
      return "Nie udało się utworzyć konta dla tego adresu. Jeśli masz konto, zaloguj się.";
    if (status === 400) return "Sprawdź e-mail, nazwę gracza i hasło.";
    return "Nie udało się potwierdzić rejestracji. Spróbuj się zalogować lub ponów próbę.";
  }
  if (action === "password") {
    if (status === 400) return passwordPolicyError;
    if (status === 422) return "Obecne hasło jest nieprawidłowe.";
    if (status === 401) return "Sesja wygasła. Zaloguj się ponownie.";
    if (status === 409) return "Hasło zmieniło się w trakcie zapisu. Sprawdź stan konta.";
    return "Nie udało się potwierdzić zmiany hasła. Sprawdź stan konta i spróbuj ponownie.";
  }
  if (action === "reset-request" || action === "reset-confirm") {
    if (status === 503 || status === 404) {
      return "Odzyskiwanie hasła jest chwilowo niedostępne. Spróbuj później.";
    }
    if (action === "reset-request") return "Nie udało się poprosić o link. Spróbuj ponownie.";
    if (status === 400)
      return "Link jest nieprawidłowy, wygasł lub został już użyty. Poproś o nowy.";
    return "Nie udało się potwierdzić zapisu. Spróbuj zalogować się nowym hasłem lub poproś o nowy link.";
  }
  return "Nie udało się wylogować. Spróbuj ponownie.";
}

export function PlayerAccountPage() {
  const [state, setState] = useState<SessionState>({ status: "loading" });
  const [mode, setMode] = useState<AccountMode>("login");
  const [resetToken, setResetToken] = useState<string | null>(null);
  const [email, setEmail] = useState("");
  const [working, setWorking] = useState<AccountAction | null>(null);
  const [feedback, setFeedback] = useState<Feedback | null>(null);
  const pending = useRef(false);
  const focusOnReturn = useRef(false);
  const emailField = useRef<HTMLInputElement>(null);
  const passwordField = useRef<HTMLInputElement>(null);
  const loginModeButton = useRef<HTMLButtonElement>(null);
  const profileHeading = useRef<HTMLHeadingElement>(null);

  const loadSession = useCallback(async (signal?: AbortSignal) => {
    setState({ status: "loading" });
    try {
      const session = await playerAccountApi.session(signal);
      if (!signal?.aborted) setState({ status: "ready", session });
      return session;
    } catch (error) {
      if (!signal?.aborted) {
        setState({
          status:
            error instanceof PlayerAccountError && error.status === 404 ? "disabled" : "error",
        });
      }
      return null;
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadSession(controller.signal);
    return () => controller.abort();
  }, [loadSession]);

  useEffect(() => {
    function captureResetLink() {
      const token = consumePasswordResetLink();
      if (token === null) return;
      setResetToken(token);
      setFeedback(null);
    }
    captureResetLink();
    window.addEventListener("hashchange", captureResetLink);
    return () => window.removeEventListener("hashchange", captureResetLink);
  }, []);

  useEffect(() => {
    if (feedback?.focusPassword && !working) passwordField.current?.focus();
  }, [feedback, working]);

  useEffect(() => {
    if (mode === "forgot" && resetToken === null && state.status === "ready") {
      emailField.current?.focus();
    }
  }, [mode, resetToken, state.status]);

  useEffect(() => {
    if (
      !focusOnReturn.current ||
      working ||
      mode !== "login" ||
      resetToken !== null ||
      state.status !== "ready"
    ) {
      return;
    }
    focusOnReturn.current = false;
    (state.session.authenticated ? profileHeading.current : loginModeButton.current)?.focus();
  }, [mode, resetToken, state, working]);

  function changeMode(next: AccountMode) {
    if (passwordField.current) passwordField.current.value = "";
    setMode(next);
    setResetToken(null);
    setFeedback(null);
  }

  function returnToAccount() {
    focusOnReturn.current = true;
    changeMode("login");
  }

  async function submit(
    action: AccountAction,
    operation: () => Promise<Response>,
    onSuccess: () => void | Promise<void>,
  ) {
    if (pending.current) return;
    pending.current = true;
    setWorking(action);
    setFeedback(null);
    try {
      await operation();
      await onSuccess();
    } catch (error) {
      const status = error instanceof PlayerAccountError ? error.status : undefined;
      const passwordSessionMayHaveChanged =
        action === "password" && (status === 401 || status === 409);
      if (status === 403 || passwordSessionMayHaveChanged) {
        const refreshed = await loadSession();
        if (refreshed) {
          const passwordSessionEnded = action === "password" && !refreshed.authenticated;
          let message = actionError(action, status);
          if (status === 403) message = "Odświeżono sesję. Spróbuj ponownie.";
          if (passwordSessionEnded) message = "Zaloguj się ponownie, aby zmienić hasło.";
          setFeedback({
            kind: "error",
            text: message,
            focusPassword: passwordSessionEnded ? true : undefined,
          });
        }
      } else {
        setFeedback({
          kind: "error",
          text: actionError(action, status),
          focusPassword: action === "login" && status === 401 ? true : undefined,
        });
      }
    } finally {
      pending.current = false;
      setWorking(null);
    }
  }

  const session = state.status === "ready" ? state.session : null;
  const registering = mode === "register";
  const requestingReset = mode === "forgot";
  const confirmingReset = resetToken !== null;
  const accountForm = accountForms[mode];
  const backLabel = session?.authenticated ? "Wróć do konta" : "Wróć do logowania";

  function submitForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || pending.current) return;
    const normalizedEmail = email.trim();
    if (!normalizedEmail) return;
    if (requestingReset) {
      void submit(
        "reset-request",
        () => playerAccountApi.requestPasswordReset(session.csrfToken, normalizedEmail),
        () => {
          setFeedback({
            kind: "success",
            text: "Jeśli ten adres jest przypisany do konta, otrzymasz link do ustawienia nowego hasła. Sprawdź też folder spam.",
          });
        },
      );
      return;
    }
    if (session.authenticated) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password") ?? "");
    const displayName = String(data.get("displayName") ?? "").trim();
    if (registering) {
      // Native length limits use UTF-16 units. The server validates Unicode code points.
      const nameLength = Array.from(displayName).length;
      if (
        nameLength < minimumNameLength ||
        nameLength > maximumNameLength ||
        /\p{Cc}/u.test(displayName)
      ) {
        setFeedback({
          kind: "error",
          text: "Nazwa gracza musi mieć od 2 do 40 znaków i nie może zawierać znaków sterujących.",
        });
        return;
      }
      if (!isValidPlayerPassword(password)) {
        setFeedback({
          kind: "error",
          text: passwordPolicyError,
        });
        return;
      }
    }
    if (!password) return;
    if (passwordField.current) passwordField.current.value = "";
    if (registering) {
      void submit(
        "register",
        () =>
          playerAccountApi.register(session.csrfToken, {
            email: normalizedEmail,
            displayName,
            password,
          }),
        () => {
          setEmail(normalizedEmail);
          setMode("login");
          setFeedback({
            kind: "success",
            text: "Konto zostało utworzone. Zaloguj się, używając swojego hasła.",
            focusPassword: true,
          });
        },
      );
    } else {
      void submit(
        "login",
        () => playerAccountApi.login(session.csrfToken, normalizedEmail, password),
        async () => {
          const refreshed = await loadSession();
          if (refreshed && !refreshed.authenticated) {
            setFeedback({
              kind: "error",
              text: "Nie udało się rozpocząć sesji. Sprawdź ustawienia plików cookie i spróbuj ponownie.",
            });
          }
        },
      );
    }
  }

  function confirmPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session || !resetToken || pending.current) return;
    const data = new FormData(event.currentTarget);
    const newPassword = String(data.get("newPassword") ?? "");
    const validationError = newPasswordError(newPassword, data.get("repeatPassword"));
    if (validationError) {
      setFeedback({ kind: "error", text: validationError });
      return;
    }
    void submit(
      "reset-confirm",
      () => playerAccountApi.confirmPasswordReset(session.csrfToken, resetToken, newPassword),
      async () => {
        const refreshed = await loadSession();
        focusOnReturn.current = refreshed !== null;
        setResetToken((activeToken) => (activeToken === resetToken ? null : activeToken));
        setMode("login");
        setFeedback({
          kind: "success",
          text: refreshed?.authenticated
            ? "Nowe hasło zostało zapisane."
            : "Nowe hasło zostało zapisane. Zaloguj się nowym hasłem.",
        });
      },
    );
  }

  function changePassword(change: PlayerPasswordChange) {
    if (!session?.authenticated || pending.current) return;
    setEmail(session.player.email);
    setMode("login");
    void submit(
      "password",
      () => playerAccountApi.changePassword(session.csrfToken, change),
      async () => {
        const refreshed = await loadSession();
        setFeedback({
          kind: "success",
          text: refreshed?.authenticated
            ? "Hasło zostało zmienione."
            : "Hasło zostało zmienione. Zaloguj się nowym hasłem.",
          focusPassword: refreshed?.authenticated === false ? true : undefined,
        });
      },
    );
  }

  function signOut() {
    if (!session?.authenticated) return;
    void submit(
      "logout",
      () => playerAccountApi.logout(session.csrfToken),
      async () => {
        const refreshed = await loadSession();
        if (refreshed?.authenticated) {
          setFeedback({ kind: "error", text: actionError("logout") });
        } else if (refreshed) {
          setEmail("");
          setMode("login");
          setFeedback({ kind: "success", text: "Wylogowano Cię." });
        }
      },
    );
  }

  return (
    <main
      tabIndex={-1}
      className="page-container player-account"
      aria-labelledby="player-account-title"
    >
      <header className="player-account-header">
        <p className="section-kicker">
          <span className="line-accent" aria-hidden="true" /> Strefa gracza
        </p>
        <h1 id="player-account-title">
          Twoje <span>konto.</span>
        </h1>
        <p className="player-account-intro">Typowanie meczów w gronie znajomych.</p>
      </header>
      <div className="player-account-panel">
        {session && !session.authenticated && !confirmingReset && !requestingReset && (
          <div className="player-account-modes" role="group" aria-label="Opcje konta">
            <Button
              ref={loginModeButton}
              type="button"
              variant="ghost"
              aria-pressed={mode === "login"}
              disabled={!!working}
              onClick={() => mode !== "login" && changeMode("login")}
            >
              Logowanie
            </Button>
            <Button
              type="button"
              variant="ghost"
              aria-pressed={mode === "register"}
              disabled={!!working}
              onClick={() => mode !== "register" && changeMode("register")}
            >
              Rejestracja
            </Button>
          </div>
        )}
        <div className="player-account-content">
          {feedback && (
            <p
              className="player-account-feedback"
              data-kind={feedback.kind}
              role={feedback.kind === "error" ? "alert" : "status"}
            >
              {feedback.text}
            </p>
          )}
          {state.status === "loading" && <p role="status">Sprawdzam sesję…</p>}
          {state.status === "disabled" && <p>Logowanie graczy jest wyłączone w tym środowisku.</p>}
          {state.status === "error" && (
            <>
              <p role="alert">Nie udało się sprawdzić sesji. Spróbuj ponownie.</p>
              <Button type="button" variant="outline" onClick={() => void loadSession()}>
                Spróbuj ponownie
              </Button>
            </>
          )}
          {session && confirmingReset && (
            <PlayerPasswordResetForm
              validLink={Boolean(resetToken)}
              disabled={!!working}
              saving={working === "reset-confirm"}
              onSave={confirmPasswordReset}
              onRequestLink={() => changeMode("forgot")}
              onCancel={returnToAccount}
              backLabel={backLabel}
            />
          )}
          {session?.authenticated && !confirmingReset && !requestingReset && (
            <section className="player-account-details" aria-labelledby="player-account-profile">
              <div className="player-account-profile">
                <span className="player-account-avatar">
                  <UserRound aria-hidden="true" />
                </span>
                <div>
                  <h2 ref={profileHeading} id="player-account-profile" tabIndex={-1}>
                    Cześć, {session.player.displayName}!
                  </h2>
                  <p>{session.player.email}</p>
                </div>
              </div>
              <div className="player-account-details-actions">
                <PlayerPasswordForm
                  email={session.player.email}
                  disabled={!!working}
                  saving={working === "password"}
                  onSave={changePassword}
                />
                <Button type="button" variant="ghost" disabled={!!working} onClick={signOut}>
                  <LogOut aria-hidden="true" />
                  {working === "logout" ? "Wylogowywanie…" : "Wyloguj się"}
                </Button>
              </div>
            </section>
          )}
          {session && !confirmingReset && (!session.authenticated || requestingReset) && (
            <form
              className="player-account-form"
              onSubmit={submitForm}
              aria-labelledby="player-account-form-title"
            >
              <div className="player-account-form-heading">
                <h2 id="player-account-form-title">{accountForm.title}</h2>
                <p>{accountForm.description}</p>
              </div>
              <label>
                Adres e-mail
                <Input
                  ref={emailField}
                  name="email"
                  type="email"
                  autoComplete={mode === "login" ? "username" : "email"}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  maxLength={254}
                  required
                  disabled={!!working}
                />
              </label>
              {registering && (
                <label>
                  Nazwa gracza
                  <Input
                    name="displayName"
                    autoComplete="nickname"
                    maxLength={maximumNameLength * 2}
                    required
                    disabled={!!working}
                  />
                </label>
              )}
              {!requestingReset && (
                <div className="player-account-password-field">
                  <label htmlFor="player-password">Hasło</label>
                  <Input
                    ref={passwordField}
                    id="player-password"
                    name="password"
                    type="password"
                    autoComplete={registering ? "new-password" : "current-password"}
                    maxLength={maximumPasswordLength * 2}
                    aria-describedby={registering ? "player-password-hint" : undefined}
                    required
                    disabled={!!working}
                  />
                  {mode === "login" && (
                    <Button
                      className="player-account-forgot"
                      type="button"
                      variant="link"
                      disabled={!!working}
                      onClick={() => changeMode("forgot")}
                    >
                      Nie pamiętam hasła
                    </Button>
                  )}
                  {registering && <p id="player-password-hint">{passwordLengthHint}</p>}
                </div>
              )}
              <div className="player-account-form-actions">
                <Button type="submit" disabled={!!working}>
                  {working === accountForm.action ? accountForm.pending : accountForm.submit}
                  <ArrowRight aria-hidden="true" />
                </Button>
                {requestingReset && (
                  <Button
                    className="player-account-back"
                    type="button"
                    variant="ghost"
                    disabled={!!working}
                    onClick={returnToAccount}
                  >
                    <ArrowLeft aria-hidden="true" /> {backLabel}
                  </Button>
                )}
              </div>
            </form>
          )}
        </div>
      </div>
    </main>
  );
}
