import { randomUUID } from "node:crypto";
import type { ClassificationResult, Verdict } from "../classify/types";
import type { ItemSlot, NormalizedItem } from "../inventory/types";
import { DEFAULT_ACTIONS_CONFIG, type ActionsConfig } from "./actions.config";
import { VAULT, type ActionPlan, type PlanRound, type PlannedAction, type SkippedItem } from "./types";

const SLOT_ORDER: ItemSlot[] = ["kinetic", "energy", "power", "helmet", "arms", "chest", "legs", "classItem", "other"];
const SLOT_LABELS: Record<ItemSlot, string> = {
  kinetic: "cinéticas",
  energy: "de energía",
  power: "pesadas",
  helmet: "cascos",
  arms: "guanteletes",
  chest: "petos",
  legs: "botas",
  classItem: "objetos de clase",
  other: "otros",
};

/** Capacidad libre del personaje destino, por ranura. */
export type FreeSlots = Partial<Record<ItemSlot, number>>;

export interface PlanInput {
  items: readonly NormalizedItem[];
  /** Veredictos finales (reglas + correcciones manuales). */
  results: readonly ClassificationResult[];
  config?: ActionsConfig;
  dryRun?: boolean;
}

/** Un ítem apilable (sin instancia) usa su hash como id; solo los instanciados se bloquean/mueven así. */
const isInstanced = (item: NormalizedItem) => item.id !== String(item.hash);

const bySlotThenName = (a: NormalizedItem, b: NormalizedItem) =>
  SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot) || a.name.localeCompare(b.name, "es");

function verdictMap(results: readonly ClassificationResult[]): Map<string, Verdict> {
  return new Map(results.map((r) => [r.itemId, r.verdict]));
}

function newPlan(kind: ActionPlan["kind"], dryRun: boolean | undefined, targetCharacterId?: string): ActionPlan {
  return {
    id: randomUUID(),
    kind,
    createdAt: new Date().toISOString(),
    dryRun: dryRun ?? false,
    ...(targetCharacterId && { targetCharacterId }),
    rounds: [],
    skipped: [],
    warnings: [],
  };
}

function chunk<T>(list: readonly T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

/**
 * Plan para bloquear lo que se conserva (keep y/o archive).
 * Si el candado no funciona en el alijo, cada ítem del alijo se mueve al personaje,
 * se bloquea y se devuelve (necesita al menos 1 hueco libre en su ranura).
 */
export function planLockKeepers(
  input: PlanInput & { characterId: string; vaultLockSupported: boolean; free?: FreeSlots },
): ActionPlan {
  const config = input.config ?? DEFAULT_ACTIONS_CONFIG;
  const plan = newPlan("lock-keepers", input.dryRun, input.characterId);
  const verdicts = verdictMap(input.results);
  const skipped: SkippedItem[] = [];
  let alreadyLocked = 0;

  const candidates = input.items
    .filter((item) => {
      const verdict = verdicts.get(item.id);
      if (!verdict || !(config.lockVerdicts as Verdict[]).includes(verdict)) return false;
      if (item.kind === "other" || !isInstanced(item)) return false;
      if (item.locked) {
        alreadyLocked += 1;
        return false;
      }
      return true;
    })
    .sort(bySlotThenName);

  let counter = 0;
  const actionsFor = (item: NormalizedItem): PlannedAction[] | null => {
    const base = { itemId: item.id, hash: item.hash, name: item.name };
    const reason = `Se conserva (${verdicts.get(item.id) === "keep" ? "guardar" : "archivar"}).`;
    const id = () => `lock-${++counter}`;

    if (item.location === "character") {
      return [{ ...base, id: id(), kind: "lock", state: true, previous: false, characterId: item.characterId ?? input.characterId, reason }];
    }
    if (input.vaultLockSupported) {
      return [{ ...base, id: id(), kind: "lock", state: true, previous: false, characterId: input.characterId, reason }];
    }
    if ((input.free?.[item.slot] ?? 0) < 1) {
      skipped.push({ itemId: item.id, name: item.name, reason: `Sin hueco libre en el personaje para ${SLOT_LABELS[item.slot]}.` });
      return null;
    }
    return [
      { ...base, id: id(), kind: "transfer", from: VAULT, to: input.characterId, stackSize: item.quantity, reason: "Paso previo para poder bloquearlo." },
      { ...base, id: id(), kind: "lock", state: true, previous: false, characterId: input.characterId, reason },
      { ...base, id: id(), kind: "transfer", from: input.characterId, to: VAULT, stackSize: item.quantity, reason: "Vuelve al alijo." },
    ];
  };

  // Una ronda = hasta maxItemsPerRun ítems (cada ítem puede traer varias acciones).
  const planned = candidates.flatMap((item) => {
    const actions = actionsFor(item);
    return actions ? [actions] : [];
  });
  chunk(planned, config.maxItemsPerRun).forEach((group, i, all) => {
    plan.rounds.push({
      index: i,
      actions: group.flat(),
      note: `Ronda ${i + 1} de ${all.length}: bloquear ${group.length} ítems.`,
    });
  });

  plan.skipped = skipped;
  if (alreadyLocked > 0) plan.warnings.push(`${alreadyLocked} ítems ya tienen candado y se omiten.`);
  if (!input.vaultLockSupported && planned.length > 0) {
    plan.warnings.push("El alijo no admite candado: cada ítem se mueve al personaje, se bloquea y se devuelve.");
  }
  if (planned.length === 0) plan.warnings.push("No hay nada que bloquear.");
  return plan;
}

/**
 * Plan para mover la basura del alijo a un personaje, por rondas del tamaño de su espacio libre
 * (por ranura) y del tope por ejecución. Se asume que entre rondas se desmantela lo movido.
 */
export function planMoveJunk(
  input: PlanInput & { characterId: string; free: FreeSlots; protectedIds?: ReadonlySet<string> },
): ActionPlan {
  const config = input.config ?? DEFAULT_ACTIONS_CONFIG;
  const plan = newPlan("move-junk", input.dryRun, input.characterId);
  const verdicts = verdictMap(input.results);
  const skipped: SkippedItem[] = [];

  const queues = new Map<ItemSlot, NormalizedItem[]>();
  for (const item of [...input.items].sort(bySlotThenName)) {
    if (verdicts.get(item.id) !== "junk") continue;
    // Defensa en profundidad: aunque el veredicto diga basura, estas condiciones lo impiden.
    const blocker = item.equipped
      ? "está equipado"
      : item.locked
        ? "tiene candado"
        : input.protectedIds?.has(item.id)
          ? "está marcado «siempre conservar»"
          : item.kind === "other" || !isInstanced(item)
            ? "no es un arma ni una armadura"
            : item.location !== "vault"
              ? "no está en el alijo"
              : null;
    if (blocker) {
      skipped.push({ itemId: item.id, name: item.name, reason: `No se mueve: ${blocker}.` });
      continue;
    }
    const list = queues.get(item.slot) ?? [];
    list.push(item);
    queues.set(item.slot, list);
  }

  let counter = 0;
  for (let round = 0; ; round++) {
    const actions: PlannedAction[] = [];
    const counts: string[] = [];
    let progress = false;

    for (const slot of SLOT_ORDER) {
      const queue = queues.get(slot);
      if (!queue?.length) continue;
      const room = Math.min(input.free[slot] ?? 0, config.maxItemsPerRun - actions.length);
      const taken = queue.splice(0, Math.max(room, 0));
      if (taken.length === 0) continue;
      progress = true;
      counts.push(`${taken.length} ${SLOT_LABELS[slot]}`);
      for (const item of taken) {
        actions.push({
          id: `move-${++counter}`,
          kind: "transfer",
          itemId: item.id,
          hash: item.hash,
          name: item.name,
          from: VAULT,
          to: input.characterId,
          stackSize: item.quantity,
          reason: "Basura confirmada: se lleva al personaje para desmantelarla en el juego.",
        });
      }
    }

    if (!progress) break;
    plan.rounds.push({ index: round, actions, note: `Ronda ${round + 1}: ${actions.length} ítems (${counts.join(", ")}).` });
  }

  // Lo que quedó sin hueco en ninguna ronda.
  for (const [slot, queue] of queues) {
    for (const item of queue) {
      skipped.push({ itemId: item.id, name: item.name, reason: `Sin espacio en el personaje para ${SLOT_LABELS[slot]}.` });
    }
  }

  plan.skipped = skipped;
  if (plan.rounds.length > 1) {
    plan.warnings.push(
      `Se necesitan ${plan.rounds.length} rondas. Entre una y otra debes desmantelar en el juego lo que se movió.`,
    );
  }
  if (plan.rounds.length === 0) plan.warnings.push("No hay basura que mover.");
  return plan;
}

export function totalActions(plan: Pick<ActionPlan, "rounds">): number {
  return plan.rounds.reduce((sum, r: PlanRound) => sum + r.actions.length, 0);
}
