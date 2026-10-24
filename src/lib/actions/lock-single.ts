import { randomUUID } from "node:crypto";
import type { InventoryActions } from "../bungie/actions/api";
import type { ActionError } from "../bungie/actions/errors";
import type { ActionsConfig } from "./actions.config";
import { executeRound } from "./execute";
import { VAULT, type PlannedAction } from "./types";
import type { Capabilities } from "./capabilities";

export type LockSingleResult =
  | { ok: true; locked: boolean; via: "direct" | "detour" }
  | { ok: false; error: ActionError };

export interface LockSingleInput {
  actions: InventoryActions;
  /** Ítem del alijo (itemInstanceId, hash y nombre). */
  item: { id: string; hash: number; name: string };
  /** Estado de candado que se quiere dejar. */
  locked: boolean;
  /** Personaje usado para la llamada (y para el rodeo). */
  characterId: string;
  capabilities: Capabilities;
  /** Guarda lo aprendido (si es undefined, no se persiste nada: modo de prueba). */
  saveCapabilities?: (patch: Capabilities) => Promise<void>;
  config?: ActionsConfig;
  auditFile?: string;
  sleep?: (ms: number) => Promise<void>;
}

// Errores en los que tiene sentido probar el rodeo: la llamada directa no aplica a este ítem/lugar.
// El resto (actividad en curso, mantenimiento, sesión, permiso, throttle...) no mejora moviendo el ítem.
const DETOUR_KINDS = new Set(["not_found", "unknown"]);

function lockAction(input: LockSingleInput, n: number): PlannedAction {
  return {
    id: `single-${n}`,
    kind: "lock",
    itemId: input.item.id,
    hash: input.item.hash,
    name: input.item.name,
    state: input.locked,
    previous: !input.locked,
    characterId: input.characterId,
    reason: input.locked ? "Bloqueo individual desde el alijo." : "Desbloqueo individual desde el alijo.",
  };
}

function detourActions(input: LockSingleInput): PlannedAction[] {
  const base = { itemId: input.item.id, hash: input.item.hash, name: input.item.name, stackSize: 1 };
  return [
    { ...base, id: "single-d1", kind: "transfer", from: VAULT, to: input.characterId, reason: "Paso previo: el alijo no admite candado." },
    { ...lockAction(input, 0), id: "single-d2" },
    { ...base, id: "single-d3", kind: "transfer", from: input.characterId, to: VAULT, reason: "Vuelve al alijo." },
  ];
}

/**
 * Bloquea o desbloquea UN ítem del alijo. Prueba primero el candado directo y, si la API no lo admite
 * para ítems del alijo, hace el rodeo (mover al personaje, cambiar el candado y devolver).
 * Recuerda cuál de los dos caminos funciona para no volver a probar.
 */
export async function lockSingleItem(input: LockSingleInput): Promise<LockSingleResult> {
  const run = (actions: PlannedAction[]) =>
    executeRound({ id: randomUUID() }, { index: 0, actions, note: "Acción individual." }, {
      actions: input.actions,
      config: input.config,
      auditFile: input.auditFile,
      sleep: input.sleep,
    });
  const failure = (results: { ok: boolean; error?: ActionError }[]) =>
    results.find((r) => !r.ok)?.error ?? { kind: "unknown" as const, message: "La acción no se completó." };

  if (input.capabilities.vaultLock !== false) {
    const direct = await run([lockAction(input, 1)]);
    if (direct.results[0].ok) {
      if (input.capabilities.vaultLock !== true) await input.saveCapabilities?.({ vaultLock: true });
      return { ok: true, locked: input.locked, via: "direct" };
    }
    const error = failure(direct.results);
    if (!DETOUR_KINDS.has(error.kind)) return { ok: false, error };
  }

  // Rodeo. Si el candado directo ya se sabía que no funciona, se va directo aquí.
  const detour = await run(detourActions(input));
  if (detour.results.every((r) => r.ok)) {
    if (input.capabilities.vaultLock === undefined) await input.saveCapabilities?.({ vaultLock: false });
    return { ok: true, locked: input.locked, via: "detour" };
  }
  // Si el ítem quedó en el personaje por un fallo a medias, se dice claramente.
  const error = failure(detour.results);
  const movedAndStuck = detour.results[0]?.ok && !detour.results[2]?.ok;
  return {
    ok: false,
    error: movedAndStuck
      ? { ...error, message: `${error.message} El ítem quedó en el personaje; devuélvelo al alijo desde el juego o desde «Deshacer».` }
      : error,
  };
}
