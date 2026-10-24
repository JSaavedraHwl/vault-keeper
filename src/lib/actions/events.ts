import type { QueueStop } from "./queue";
import type { ActionPlan, ActionResult } from "./types";
import type { CharacterInfo } from "../inventory/types";

// Tipos compartidos entre el servidor y el navegador (solo tipos: no arrastran código del servidor).

export type ActionsErrorKind = "expired" | "refresh" | "maintenance" | "busy" | "plan" | "bungie" | "other";

export interface ActionsError {
  kind: ActionsErrorKind;
  message: string;
}

/** Respuesta de /api/actions/plan */
export interface PlanResponse {
  plan: ActionPlan;
  characters: CharacterInfo[];
  simulated: boolean;
  /** Si ya se sabe que el alijo admite candado (undefined = aún no probado). */
  vaultLock?: boolean;
  /** Identificador de la última ejecución real (para confirmar un «deshacer»). */
  lastRunId?: string;
}

export interface ResultLine extends ActionResult {
  name: string;
  kind: "lock" | "transfer" | "equip";
  /** Texto corto de lo que se hizo, p. ej. «alijo → Titán» o «bloquear». */
  what: string;
}

export interface ExecutionSummary {
  runId: string;
  dryRun: boolean;
  stopped: QueueStop;
  results: ResultLine[];
  omitted: { itemId: string; name: string; reason: string }[];
  remainingRounds: number;
}

/** Eventos de /api/actions/execute (una línea JSON por evento). */
export type ExecuteEvent =
  | { type: "start"; runId: string; total: number }
  | { type: "progress"; line: ResultLine; done: number; total: number }
  | { type: "done"; summary: ExecutionSummary }
  | ({ type: "error" } & ActionsError);
