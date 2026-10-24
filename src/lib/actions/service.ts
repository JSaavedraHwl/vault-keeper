import type { ClassificationResult } from "../classify/types";
import type { CharacterInfo, NormalizedItem } from "../inventory/types";
import { DEFAULT_ACTIONS_CONFIG, type ActionsConfig } from "./actions.config";
import type { Capabilities } from "./capabilities";
import { planLockKeepers, planMoveJunk } from "./plan";
import { planUndo } from "./undo";
import type { ActionPlan, AuditEntry, PlanKind, PlanRound, PlannedAction, SkippedItem } from "./types";

/** Error con mensaje pensado para mostrarse al usuario tal cual. */
export class PlanError extends Error {}

export interface PlanContext {
  /** Ítems del alijo, recién leídos. */
  items: readonly NormalizedItem[];
  characters: readonly CharacterInfo[];
  /** Veredictos finales (reglas + correcciones), recién calculados. */
  results: readonly ClassificationResult[];
  /** itemInstanceId marcados «siempre conservar». */
  protectedIds: ReadonlySet<string>;
  capabilities: Capabilities;
  /** Última ejecución real registrada (para deshacer). */
  lastRun: { runId: string; entries: AuditEntry[] } | null;
  config?: ActionsConfig;
}

export interface PlanRequest {
  kind: PlanKind;
  /** Personaje destino (mover) o con el que se llama a la API (bloquear). Por defecto, el más reciente. */
  characterId?: string;
  /** Máximo de ítems de la primera ronda (para probar con pocos). */
  limit?: number;
  dryRun: boolean;
}

/** Recorta una ronda a sus primeros `limit` ítems (un ítem puede tener varias acciones). */
export function limitItems(round: PlanRound, limit: number): PlanRound {
  const keep = new Set<string>();
  for (const a of round.actions) {
    if (keep.size >= limit && !keep.has(a.itemId)) continue;
    keep.add(a.itemId);
  }
  const actions = round.actions.filter((a) => keep.has(a.itemId));
  return { ...round, actions, note: `${round.note} (limitada a ${keep.size} ítems)` };
}

/** Construye el plan con los datos del momento. Función pura. */
export function buildPlan(ctx: PlanContext, req: PlanRequest): ActionPlan {
  const config = ctx.config ?? DEFAULT_ACTIONS_CONFIG;

  let plan: ActionPlan;
  if (req.kind === "undo") {
    if (!ctx.lastRun) throw new PlanError("No hay ninguna ejecución anterior que deshacer.");
    plan = { ...planUndo(ctx.lastRun.entries), dryRun: req.dryRun };
  } else {
    const character = req.characterId
      ? ctx.characters.find((c) => c.id === req.characterId)
      : ctx.characters[0];
    if (!character) throw new PlanError("No se encontró el personaje elegido.");

    const common = { items: ctx.items, results: ctx.results, config, dryRun: req.dryRun, characterId: character.id };
    plan =
      req.kind === "lock-keepers"
        ? planLockKeepers({ ...common, vaultLockSupported: ctx.capabilities.vaultLock !== false, free: character.free })
        : planMoveJunk({ ...common, free: character.free, protectedIds: ctx.protectedIds });
  }

  if (req.limit !== undefined && plan.rounds.length > 0) {
    const limit = Math.max(1, Math.floor(req.limit));
    plan = { ...plan, rounds: [limitItems(plan.rounds[0], limit), ...plan.rounds.slice(1)] };
  }
  return plan;
}

export interface Execution {
  plan: ActionPlan;
  /** Lo que se va a ejecutar: la primera ronda del plan fresco, restringida a lo confirmado. */
  round: PlanRound | null;
  /** Confirmado por el usuario pero que ya no cumple las condiciones. */
  omitted: SkippedItem[];
  /** Rondas que quedan después de esta. */
  remainingRounds: number;
}

/**
 * Decide qué se ejecuta de verdad. Parte siempre de un plan RECALCULADO ahora (nunca del que
 * mandó el navegador) y solo toma de su primera ronda lo que el usuario confirmó. Así nada
 * que haya cambiado desde la vista previa (candado, equipado, veredicto...) llega a ejecutarse.
 */
export function prepareExecution(
  ctx: PlanContext,
  req: PlanRequest,
  confirmedItemIds: readonly string[],
): Execution {
  const plan = buildPlan(ctx, { ...req, limit: undefined });
  const first = plan.rounds[0];
  const confirmed = new Set(confirmedItemIds);
  const names = new Map(ctx.items.map((i) => [i.id, i.name]));

  if (!first) return { plan, round: null, omitted: [...confirmed].map(omit(names)), remainingRounds: 0 };

  const allowed = new Set(first.actions.map((a) => a.itemId));
  const actions: PlannedAction[] = first.actions.filter((a) => confirmed.has(a.itemId));
  const omitted = [...confirmed].filter((id) => !allowed.has(id)).map(omit(names));

  return {
    plan,
    round: actions.length > 0 ? { ...first, actions } : null,
    omitted,
    remainingRounds: Math.max(plan.rounds.length - 1, 0),
  };
}

const omit =
  (names: Map<string, string>) =>
  (itemId: string): SkippedItem => ({
    itemId,
    name: names.get(itemId) ?? itemId,
    reason: "Ya no cumple las condiciones (cambió desde la vista previa).",
  });
