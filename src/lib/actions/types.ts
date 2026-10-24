import type { ActionError } from "../bungie/actions/errors";

/** "vault" o el characterId de un personaje. */
export type Place = string;
export const VAULT: Place = "vault";

interface BaseAction {
  /** Identificador estable dentro del plan. */
  id: string;
  itemId: string;
  hash: number;
  name: string;
  /** Por qué se hace esta acción (se muestra en la confirmación). */
  reason: string;
}

export type LockAction = BaseAction & {
  kind: "lock";
  /** Estado de candado que se quiere dejar. */
  state: boolean;
  /** Estado de candado antes de la acción (para deshacer). */
  previous: boolean;
  /** Personaje con el que se hace la llamada a la API. */
  characterId: string;
};

export type TransferAction = BaseAction & {
  kind: "transfer";
  from: Place;
  to: Place;
  stackSize: number;
};

export type PlannedAction = LockAction | TransferAction;

export type PlanKind = "lock-keepers" | "move-junk" | "undo";

export interface PlanRound {
  index: number;
  actions: PlannedAction[];
  /** Explicación de lo que cubre la ronda (capacidad, ranuras...). */
  note: string;
}

export interface SkippedItem {
  itemId: string;
  name: string;
  reason: string;
}

export interface ActionPlan {
  id: string;
  kind: PlanKind;
  createdAt: string;
  dryRun: boolean;
  targetCharacterId?: string;
  rounds: PlanRound[];
  skipped: SkippedItem[];
  warnings: string[];
}

export interface ActionResult {
  actionId: string;
  itemInstanceId: string;
  ok: boolean;
  /** true si no se llamó a Bungie (simulación o cancelado antes de llegar). */
  skipped?: boolean;
  error?: ActionError;
}

export interface AuditEntry {
  runId: string;
  planId: string;
  at: string;
  dryRun: boolean;
  action: PlannedAction;
  ok: boolean;
  error?: ActionError;
}
