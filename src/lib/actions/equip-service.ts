import { BungieInventoryActions, type InventoryActions } from "../bungie/actions/api";
import type { ActionError } from "../bungie/actions/errors";
import { MockInventoryActions, type MockItem } from "../bungie/actions/mock";
import type { GearData } from "../inventory/gear";
import { loadGearData } from "../inventory/gear";
import { getActionsConfig } from "./actions.config";
import { AUDIT_FILE, MOCK_AUDIT_FILE } from "./audit";
import { executeRounds } from "./execute";
import { planEquipWeapon, planSendToCharacter } from "./plan-equip";
import { isMockMode, withRunLock } from "./service-io";
import { VAULT, type ActionPlan, type ActionResult } from "./types";

export interface EquipOutcome {
  ok: boolean;
  dryRun: boolean;
  plan: ActionPlan;
  runId?: string;
  /** Resultado de cada paso (traer, equipar...). */
  steps: { name: string; what: string; ok: boolean; skipped?: boolean; error?: ActionError }[];
  /** Motivos por los que no se pudo ni empezar. */
  blocked?: string[];
}

export class EquipError extends Error {}

/** «equip»: traerla y equiparla. «send»: dejarla en el inventario del personaje, sin equiparla. */
export type EquipMode = "equip" | "send";

/** Resuelve qué se va a hacer, con los datos del momento. Función pura. */
export function buildEquipPlan(
  gear: Pick<GearData, "items" | "characters">,
  itemId: string,
  characterId: string,
  dryRun: boolean,
  mode: EquipMode = "equip",
): ActionPlan {
  const item = gear.items.find((i) => i.id === itemId);
  if (!item) throw new EquipError("El arma ya no está donde se esperaba. Recarga la pantalla.");
  const character = gear.characters.find((c) => c.id === characterId);
  if (!character) throw new EquipError("No se encontró el personaje elegido.");
  const plan = mode === "send" ? planSendToCharacter : planEquipWeapon;
  return plan({ item, character, items: gear.items, dryRun });
}

function describeStep(a: ActionPlan["rounds"][number]["actions"][number], names: Map<string, string>): string {
  const place = (p: string) => (p === VAULT ? "alijo" : (names.get(p) ?? "personaje"));
  if (a.kind === "equip") return `equipar en ${names.get(a.characterId) ?? "personaje"}`;
  if (a.kind === "transfer") return `${place(a.from)} → ${place(a.to)}`;
  return a.state ? "bloquear" : "desbloquear";
}

/** Equipa un arma: relee la cuenta, recalcula el plan y lo ejecuta. Una sola ejecución a la vez. */
export async function equipWeapon(args: {
  itemId: string;
  characterId: string;
  dryRun: boolean;
  mode?: EquipMode;
  signal?: AbortSignal;
}): Promise<EquipOutcome> {
  return withRunLock(async () => {
    const gear = await loadGearData();
    const plan = buildEquipPlan(gear, args.itemId, args.characterId, args.dryRun, args.mode);

    if (plan.rounds.length === 0) {
      return { ok: false, dryRun: args.dryRun, plan, steps: [], blocked: plan.warnings };
    }

    const mock = isMockMode();
    const actions: InventoryActions = mock
      ? new MockInventoryActions({
          items: Object.fromEntries(
            gear.items.map<[string, MockItem]>((i) => [
              i.id,
              { location: i.location === "vault" ? VAULT : i.characterId!, locked: i.locked, equipped: i.equipped, slot: i.slot, exotic: i.tier === "exotic" },
            ]),
          ),
        })
      : new BungieInventoryActions(gear.accessToken, gear.membershipType);

    const outcome = await executeRounds({ id: plan.id }, plan.rounds, {
      actions,
      config: getActionsConfig(),
      dryRun: args.dryRun,
      signal: args.signal,
      auditFile: mock ? MOCK_AUDIT_FILE : AUDIT_FILE,
    });

    const names = new Map(gear.characters.map((c) => [c.id, c.classType]));
    const byId = new Map(plan.rounds.flatMap((r) => r.actions).map((a) => [a.id, a]));
    const steps = outcome.results.map((r: ActionResult) => {
      const a = byId.get(r.actionId)!;
      return { name: a.name, what: describeStep(a, names), ok: r.ok, ...(r.skipped && { skipped: true }), ...(r.error && { error: r.error }) };
    });
    return { ok: outcome.results.every((r) => r.ok), dryRun: args.dryRun, plan, runId: outcome.runId, steps };
  });
}
