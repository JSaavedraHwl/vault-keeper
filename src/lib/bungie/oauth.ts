import { env } from "../env";
import { BungieError, SessionExpiredError } from "./errors";

const AUTHORIZE_URL = "https://www.bungie.net/es/OAuth/Authorize";
const TOKEN_URL = "https://www.bungie.net/Platform/App/OAuth/token/";

export interface TokenSet {
  accessToken: string;
  accessExpiresAt: number; // epoch ms
  refreshToken: string;
  refreshExpiresAt: number; // epoch ms
  membershipId: string;
}

export function buildAuthorizeUrl(state: string): string {
  const url = new URL(AUTHORIZE_URL);
  url.searchParams.set("client_id", env.clientId);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", state);
  return url.toString();
}

async function requestTokens(params: Record<string, string>): Promise<TokenSet> {
  const basic = Buffer.from(`${env.clientId}:${env.clientSecret}`).toString("base64");
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basic}`,
      "Content-Type": "application/x-www-form-urlencoded",
      "X-API-Key": env.apiKey,
    },
    body: new URLSearchParams(params),
    cache: "no-store",
  });

  if (!res.ok) {
    if (params.grant_type === "refresh_token" && (res.status === 400 || res.status === 401)) {
      throw new SessionExpiredError();
    }
    throw new BungieError(
      `No se pudo obtener el token de Bungie (HTTP ${res.status}).`,
      undefined,
      res.status,
    );
  }

  const data = (await res.json()) as {
    access_token: string;
    expires_in: number;
    refresh_token: string;
    refresh_expires_in: number;
    membership_id: string;
  };
  const now = Date.now();
  return {
    accessToken: data.access_token,
    accessExpiresAt: now + data.expires_in * 1000,
    refreshToken: data.refresh_token,
    refreshExpiresAt: now + data.refresh_expires_in * 1000,
    membershipId: data.membership_id,
  };
}

export const exchangeCode = (code: string) =>
  requestTokens({ grant_type: "authorization_code", code });

export const refreshTokens = (refreshToken: string) =>
  requestTokens({ grant_type: "refresh_token", refresh_token: refreshToken });
