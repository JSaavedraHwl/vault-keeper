import { cookies } from "next/headers";
import { getIronSession, type SessionOptions } from "iron-session";
import { env } from "../env";
import { NeedsRefreshError, SessionExpiredError } from "./errors";
import { refreshTokens, type TokenSet } from "./oauth";

export type SessionData = Partial<TokenSet>;

const EXPIRY_MARGIN_MS = 60_000;

function options(): SessionOptions {
  return {
    password: env.sessionSecret,
    cookieName: "dim_session",
    cookieOptions: {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), options());
}

export async function saveTokens(tokens: TokenSet) {
  const session = await getSession();
  Object.assign(session, tokens);
  await session.save();
}

export async function destroySession() {
  const session = await getSession();
  session.destroy();
}

/**
 * Devuelve un access token vigente.
 * - Sin sesión o refresh token vencido → SessionExpiredError.
 * - Access token vencido → NeedsRefreshError (en Server Components no se pueden escribir
 *   cookies, así que la página redirige a /api/auth/refresh, que sí puede).
 */
export async function getAccessToken(): Promise<{ accessToken: string; membershipId: string }> {
  const s = await getSession();
  const now = Date.now();
  if (!s.accessToken || !s.refreshToken || !s.membershipId) throw new SessionExpiredError();
  if ((s.refreshExpiresAt ?? 0) <= now) throw new SessionExpiredError();
  if ((s.accessExpiresAt ?? 0) - EXPIRY_MARGIN_MS <= now) throw new NeedsRefreshError();
  return { accessToken: s.accessToken, membershipId: s.membershipId };
}

/** ¿Hay una sesión utilizable (aunque el access token necesite refrescarse)? */
export async function hasValidSession(): Promise<boolean> {
  const s = await getSession();
  return Boolean(s.accessToken && s.refreshToken && (s.refreshExpiresAt ?? 0) > Date.now());
}

/** Solo desde Route Handlers / Server Actions (escribe cookies). */
export async function refreshSession(): Promise<void> {
  const s = await getSession();
  if (!s.refreshToken || (s.refreshExpiresAt ?? 0) <= Date.now()) {
    throw new SessionExpiredError();
  }
  await saveTokens(await refreshTokens(s.refreshToken));
}
