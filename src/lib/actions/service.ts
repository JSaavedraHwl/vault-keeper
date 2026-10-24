import type { ClassificationResult } from "../classify/types";
import type { CharacterInfo, NormalizedItem } from "../inventory/types";
import { DEFAULT_ACTIONS_CONFIG, type ActionsConfig } from "./actions.config";
import type { Capabilities } from "./capabilities";
import { planLockKeepers, planMoveJunk } from "./plan";
import { planUndo } from "./undo";
import { chainsRounds, type ActionPlan, type AuditEntry, type PlanKind, type PlanRound, type PlannedAction, type SkippedItem } from "./types";

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

/** Agrupa las acciones por ítem, conservando el orden (un ítem puede tener varias acciones seguidas). */
function groupByItem(actions: readonly PlannedAction[]): PlannedAction[][] {
  const groups = new Map<string, PlannedAction[]>();
  for (const a of actions) groups.set(a.itemId, [...(groups.get(a.itemId) ?? []), a]);
  return [...groups.values()];
}

/**
 * Limita el TOTAL de ítems de un plan encadenable (p. ej. «probar con 1») y lo reparte de nuevo
 * en rondas del tamaño del tope por ejecución.
 */
function limitChainedPlan(plan: ActionPlan, limit: number, cap: number): ActionPlan {
  const items = groupByItem(plan.rounds.flatMap((r) => r.actions)).slice(0, limit);
  const rounds: PlanRound[] = [];
  for (let i = 0; i < items.length; i += cap) {
    rounds.push({
      index: rounds.length,
      actions: items.slice(i, i + cap).flat(),
      note: "",
    });
  }
  rounds.forEach((r, i) => {
    const n = new Set(r.actions.map((a) => a.itemId)).size;
    r.note = `Tanda ${i + 1} de ${rounds.length}: ${n} ítems.`;
  });
  return { ...plan, rounds };
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
    plan = chainsRounds(req.kind)
      ? limitChainedPlan(plan, limit, config.maxItemsPerRun)
      : { ...plan, rounds: [limitItems(plan.rounds[0], limit), ...plan.rounds.slice(1)] };
  }
  return plan;
}

export interface Execution {
  plan: ActionPlan;
  /**
   * Lo que se va a ejecutar, en orden: las rondas del plan fresco restringidas a lo confirmado.
   * Si la acción encadena rondas (bloquear) son todas; si no (mover basura), solo la primera.
   */
  rounds: PlanRound[];
  /** Confirmado por el usuario pero que ya no cumple las condiciones. */
  omitted: SkippedItem[];
  /** Rondas del plan que quedan para más tarde, tras desmantelar (nunca en acciones encadenadas). */
  remainingRounds: number;
}

/**
 * Decide qué se ejecuta de verdad. Parte siempre de un plan RECALCULADO ahora (nunca del que
 * mandó el navegador) y solo toma de él lo que el usuario confirmó. Así nada que haya cambiado
 * desde la vista previa (candado, equipado, veredicto...) llega a ejecutarse.
 */
export function prepareExecution(
  ctx: PlanContext,
  req: PlanRequest,
  confirmedItemIds: readonly string[],
): Execution {
  const plan = buildPlan(ctx, { ...req, limit: undefined });
  const eligible = chainsRounds(req.kind) ? plan.rounds : plan.rounds.slice(0, 1);
  const confirmed = new Set(confirmedItemIds);
  const names = new Map(ctx.items.map((i) => [i.id, i.name]));

  const allowed = new Set(eligible.flatMap((r) => r.actions.map((a) => a.itemId)));
  const rounds = eligible
    .map((r) => ({ ...r, actions: r.actions.filter((a) => confirmed.has(a.itemId)) }))
    .filter((r) => r.actions.length > 0)
    .map((r, i) => ({ ...r, index: i }));

  return {
    plan,
    rounds,
    omitted: [...confirmed].filter((id) => !allowed.has(id)).map(omit(names)),
    remainingRounds: plan.rounds.length - eligible.length,
  };
}

const omit =
  (names: Map<string, string>) =>
  (itemId: string): SkippedItem => ({
    itemId,
    name: names.get(itemId) ?? itemId,
    reason: "Ya no cumple las condiciones (cambió desde la vista previa).",
  });
