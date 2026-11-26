import type { FormEvent } from "react";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PlayerNewPasswordFields } from "./PlayerNewPasswordFields";

type PlayerPasswordResetFormProps = {
  validLink: boolean;
  disabled: boolean;
  saving: boolean;
  onSave: (event: FormEvent<HTMLFormElement>) => void;
  onRequestLink: () => void;
  onCancel: () => void;
  backLabel: string;
};

export function PlayerPasswordResetForm({
  validLink,
  disabled,
  saving,
  onSave,
  onRequestLink,
  onCancel,
  backLabel,
}: PlayerPasswordResetFormProps) {
  return (
    <form
      className="player-account-form"
      aria-labelledby="player-password-reset-title"
      onSubmit={onSave}
    >
      <div className="player-account-form-heading">
        <h2 id="player-password-reset-title">Ustaw nowe hasło</h2>
        {validLink && <p>Wybierz hasło, którego użyjesz przy następnym logowaniu.</p>}
      </div>
      {validLink ? (
        <PlayerNewPasswordFields disabled={disabled} />
      ) : (
        <p className="player-account-feedback" data-kind="error" role="alert">
          Ten link jest nieprawidłowy. Poproś o nowy.
        </p>
      )}
      <div className="player-account-form-actions">
        {validLink && (
          <Button type="submit" disabled={disabled}>
            {saving ? "Zapisywanie…" : "Zapisz nowe hasło"}
            <ArrowRight aria-hidden="true" />
          </Button>
        )}
        <Button
          type="button"
          variant={validLink ? "outline" : "default"}
          disabled={disabled}
          onClick={onRequestLink}
        >
          Poproś o nowy link
        </Button>
        <Button
          className="player-account-back"
          type="button"
          variant="ghost"
          disabled={disabled}
          onClick={onCancel}
        >
          <ArrowLeft aria-hidden="true" /> {backLabel}
        </Button>
      </div>
    </form>
  );
}
