const resetLinkPrefix = "#konto?reset=";

export function isPasswordResetLink(hash: string) {
  return hash.startsWith(resetLinkPrefix);
}

export function consumePasswordResetLink() {
  const hash = window.location.hash;
  if (!isPasswordResetLink(hash)) return null;

  // Keep the token in memory and replace the current history entry before continuing.
  window.history.replaceState(window.history.state, "", "#konto");
  const token = hash.slice(resetLinkPrefix.length);
  return /^[A-Za-z0-9_-]{43}$/.test(token) ? token : "";
}
