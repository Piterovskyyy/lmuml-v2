import { useId } from "react";
import { Input } from "@/components/ui/input";
import { maximumPasswordLength, passwordLengthHint } from "../password-policy";

export function PlayerNewPasswordFields({ disabled }: { disabled: boolean }) {
  const hintId = useId();

  return (
    <>
      <label>
        Nowe hasło
        <Input
          name="newPassword"
          type="password"
          autoComplete="new-password"
          maxLength={maximumPasswordLength * 2}
          aria-describedby={hintId}
          required
          disabled={disabled}
        />
      </label>
      <p id={hintId}>{passwordLengthHint}</p>
      <label>
        Powtórz nowe hasło
        <Input
          name="repeatPassword"
          type="password"
          autoComplete="new-password"
          maxLength={maximumPasswordLength * 2}
          required
          disabled={disabled}
        />
      </label>
    </>
  );
}
