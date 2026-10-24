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
