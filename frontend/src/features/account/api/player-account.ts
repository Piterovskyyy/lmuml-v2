import { z } from "zod";

const csrfToken = z.string().min(1);
const playerSchema = z.object({
  id: z.guid(),
  displayName: z.string().min(1),
  email: z.string().min(1),
});
const sessionSchema = z.discriminatedUnion("authenticated", [
  z.object({ authenticated: z.literal(false), csrfToken, player: z.null() }),
  z.object({ authenticated: z.literal(true), csrfToken, player: playerSchema }),
]);

export type PlayerSession = z.infer<typeof sessionSchema>;
export type PlayerRegistration = {
  email: string;
  displayName: string;
  password: string;
};
export type PlayerPasswordChange = {
  currentPassword: string;
  newPassword: string;
};

export class PlayerAccountError extends Error {
  constructor(readonly status: number) {
    super("Nie udało się wykonać operacji na koncie.");
  }
}

async function request(
  path:
    | "session"
    | "login"
    | "register"
    | "password"
    | "password-reset/request"
    | "password-reset/confirm"
    | "logout",
  options?: RequestInit,
) {
  const timeout = AbortSignal.timeout(12_000);
  const response = await fetch(`/api/v1/player/${path}`, {
    cache: "no-store",
    credentials: "same-origin",
    redirect: "error",
    ...options,
    signal: options?.signal ? AbortSignal.any([options.signal, timeout]) : timeout,
  });
  if (!response.ok) throw new PlayerAccountError(response.status);
  return response;
}

export const playerAccountApi = {
  async session(signal?: AbortSignal): Promise<PlayerSession> {
    const response = await request("session", { headers: { Accept: "application/json" }, signal });
    return sessionSchema.parse(await response.json());
  },
  login(token: string, email: string, password: string) {
    return request("login", {
      method: "POST",
      headers: { "X-CSRF-TOKEN": token },
      body: new URLSearchParams({ username: email, password }),
    });
  },
  register(token: string, registration: PlayerRegistration) {
    return request("register", {
      method: "POST",
      headers: { "X-CSRF-TOKEN": token, "Content-Type": "application/json" },
      body: JSON.stringify(registration),
    });
  },
  changePassword(token: string, change: PlayerPasswordChange) {
    return request("password", {
      method: "POST",
      headers: { "X-CSRF-TOKEN": token, "Content-Type": "application/json" },
      body: JSON.stringify(change),
    });
  },
  requestPasswordReset(csrf: string, email: string) {
    return request("password-reset/request", {
      method: "POST",
      headers: { "X-CSRF-TOKEN": csrf, "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });
  },
  confirmPasswordReset(csrf: string, token: string, newPassword: string) {
    return request("password-reset/confirm", {
      method: "POST",
      headers: { "X-CSRF-TOKEN": csrf, "Content-Type": "application/json" },
      body: JSON.stringify({ token, newPassword }),
    });
  },
  logout(token: string) {
    return request("logout", { method: "POST", headers: { "X-CSRF-TOKEN": token } });
  },
};
