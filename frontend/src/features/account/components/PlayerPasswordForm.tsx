import { useState, type FormEvent } from "react";
import { KeyRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlayerPasswordChange } from "../api/player-account";
import { maximumPasswordLength, newPasswordError } from "../password-policy";
import { PlayerNewPasswordFields } from "./PlayerNewPasswordFields";

type PlayerPasswordFormProps = {
  email: string;
  disabled: boolean;
  saving: boolean;
  onSave: (change: PlayerPasswordChange) => void;
};

export function PlayerPasswordForm({ email, disabled, saving, onSave }: PlayerPasswordFormProps) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    const data = new FormData(event.currentTarget);
    const currentPassword = String(data.get("currentPassword") ?? "");
    const newPassword = String(data.get("newPassword") ?? "");
    const validationError = newPasswordError(newPassword, data.get("repeatPassword"));
    setError(validationError);
    if (validationError) return;
    onSave({ currentPassword, newPassword });
  }

  return (
    <>
      <Button
        type="button"
        variant="outline"
        disabled={disabled}
        aria-expanded={open}
        aria-controls={open ? "player-password-form" : undefined}
        onClick={() => {
          setError(null);
          setOpen(!open);
        }}
      >
        <KeyRound aria-hidden="true" /> {open ? "Anuluj zmianę hasła" : "Zmień hasło"}
      </Button>
      {open && (
        <form
          id="player-password-form"
          className="player-account-form"
          aria-labelledby="player-password-form-title"
          onSubmit={submit}
        >
          <div className="player-account-form-heading">
            <h2 id="player-password-form-title">Zmiana hasła</h2>
            <p>Po zmianie hasła zalogujesz się ponownie.</p>
          </div>
          <input type="hidden" name="username" value={email} autoComplete="username" />
          <label>
            Obecne hasło
            <Input
              name="currentPassword"
              type="password"
              autoComplete="current-password"
              maxLength={maximumPasswordLength * 2}
              required
              disabled={disabled}
            />
          </label>
          <PlayerNewPasswordFields disabled={disabled} />
          {error && (
            <div role="alert" className="player-account-feedback" data-kind="error">
              {error}
            </div>
          )}
          <Button type="submit" disabled={disabled}>
            {saving ? "Zapisywanie…" : "Zapisz nowe hasło"}
          </Button>
        </form>
      )}
    </>
  );
}
