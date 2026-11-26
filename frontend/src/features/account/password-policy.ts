const minimumPasswordLength = 8;
export const maximumPasswordLength = 128;

export const passwordLengthHint = `Użyj od ${minimumPasswordLength} do ${maximumPasswordLength} znaków.`;
export const passwordPolicyError = `Hasło musi mieć od ${minimumPasswordLength} do ${maximumPasswordLength} znaków i zawierać znak inny niż biały.`;

export function isValidPlayerPassword(password: string) {
  // Native input limits count UTF-16 units. The server counts Unicode code points.
  const length = Array.from(password).length;
  return length >= minimumPasswordLength && length <= maximumPasswordLength && !!password.trim();
}

export function newPasswordError(password: string, repeatedPassword: FormDataEntryValue | null) {
  if (!isValidPlayerPassword(password)) return passwordPolicyError;
  if (password !== repeatedPassword) {
    return "Nowe hasła różnią się. Wpisz to samo hasło w obu polach.";
  }
  return null;
}
