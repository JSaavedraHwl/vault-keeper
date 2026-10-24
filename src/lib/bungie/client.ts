import type { HttpClient, HttpClientConfig } from "bungie-api-ts/http";
import { env } from "../env";
import { BungieError, MaintenanceError, SessionExpiredError } from "./errors";

const BASE_URL = "https://www.bungie.net";
const MAX_ATTEMPTS = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function buildUrl(config: HttpClientConfig): string {
  const url = new URL(config.url, BASE_URL);
  for (const [key, value] of Object.entries(config.params ?? {})) {
    if (value !== undefined && value !== null) url.searchParams.set(key, String(value));
  }
  return url.toString();
}

/**
 * Crea un HttpClient para bungie-api-ts: añade X-API-Key (y el Bearer si hay token),
 * reintenta con backoff ante red caída, 429, 5xx y throttling de Bungie,
 * y convierte los errores en excepciones tipadas.
 */
export function createHttpClient(accessToken?: string): HttpClient {
  return async function http<T>(config: HttpClientConfig): Promise<T> {
    const headers: Record<string, string> = { "X-API-Key": env.apiKey };
    if (accessToken) headers.Authorization = `Bearer ${accessToken}`;
    if (config.body !== undefined) headers["Content-Type"] = "application/json";

    let lastError: unknown;
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      const backoff = 500 * 2 ** (attempt - 1);
      let response: Response;
      try {
        response = await fetch(buildUrl(config), {
          method: config.method,
          headers,
          body: config.body !== undefined ? JSON.stringify(config.body) : undefined,
          cache: "no-store",
        });
      } catch (err) {
        lastError = new BungieError(`No se pudo conectar con Bungie: ${(err as Error).message}`);
        if (attempt < MAX_ATTEMPTS) {
          await sleep(backoff);
          continue;
        }
        throw lastError;
      }

      if (response.status === 401) throw new SessionExpiredError();

      if (response.status === 429 || response.status >= 500) {
        const retryAfter = Number(response.headers.get("Retry-After"));
        lastError = new BungieError(
          `Bungie respondió HTTP ${response.status}.`,
          undefined,
          response.status,
        );
        if (attempt < MAX_ATTEMPTS) {
          await sleep(retryAfter > 0 ? retryAfter * 1000 : backoff);
          continue;
        }
        throw lastError;
      }

      let json: {
        ErrorCode?: number;
        ErrorStatus?: string;
        Message?: string;
        ThrottleSeconds?: number;
      };
      try {
        json = await response.json();
      } catch {
        throw new BungieError("Respuesta de Bungie no válida.", undefined, response.status);
      }

      const code = json.ErrorCode;
      if (code === undefined || code === 1) return json as T;

      // 36 = ThrottleLimitExceededMomentarily
      if (code === 36 && attempt < MAX_ATTEMPTS) {
        await sleep(Math.max(json.ThrottleSeconds ?? 1, 1) * 1000);
        continue;
      }
      // 5 = SystemDisabled (mantenimiento)
      if (code === 5) throw new MaintenanceError(json.Message);
      // 99 = WebAuthRequired
      if (code === 99) throw new SessionExpiredError();
      throw new BungieError(
        json.Message ?? json.ErrorStatus ?? "Error de la API de Bungie.",
        code,
        response.status,
      );
    }
    throw lastError;
  };
}
