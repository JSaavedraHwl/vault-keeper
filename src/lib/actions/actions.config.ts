export interface ActionsConfig {
  /** Máximo de ítems por ejecución (una ronda). Evita errores masivos. */
  maxItemsPerRun: number;
  /** Pausa entre llamadas a Bungie (la API exige al menos 100 ms). */
  delayBetweenCallsMs: number;
  /** Reintentos ante límites de peticiones. */
  maxRetries: number;
  /** Espera inicial del reintento; se duplica en cada intento. */
  retryBaseDelayMs: number;
  /** Qué veredictos se bloquean con «Bloquear los que conservo». */
  lockVerdicts: ("keep" | "archive")[];
}

export const DEFAULT_ACTIONS_CONFIG: ActionsConfig = {
  maxItemsPerRun: 50,
  delayBetweenCallsMs: 250,
  maxRetries: 3,
  retryBaseDelayMs: 1000,
  lockVerdicts: ["keep", "archive"],
};

export const actionsConfig: ActionsConfig = DEFAULT_ACTIONS_CONFIG;

/**
 * Configuración efectiva. `ACTIONS_MAX_ITEMS_PER_RUN` (entero de 1 a 500) cambia el tamaño de tanda:
 * útil para probar con tandas pequeñas o para repartir un lote grande en menos tandas.
 */
export function getActionsConfig(env: Record<string, string | undefined> = process.env): ActionsConfig {
  const raw = Number(env.ACTIONS_MAX_ITEMS_PER_RUN);
  const valid = Number.isInteger(raw) && raw >= 1 && raw <= 500;
  return valid ? { ...DEFAULT_ACTIONS_CONFIG, maxItemsPerRun: raw } : DEFAULT_ACTIONS_CONFIG;
}
