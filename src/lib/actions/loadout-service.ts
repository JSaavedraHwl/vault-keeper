import { BungieInventoryActions, type InventoryActions } from "../bungie/actions/api";
import { MockInventoryActions, type MockItem } from "../bungie/actions/mock";
import { loadGearData, type GearData } from "../inventory/gear";
import { listLoadouts } from "../loadouts/store";
import { getActionsConfig } from "./actions.config";
import { AUDIT_FILE, MOCK_AUDIT_FILE } from "./audit";
import type { EquipOutcome } from "./equip-service";
import { executeRounds } from "./execute";
import { planEquipLoadout } from "./plan-loadout";
import { isMockMode, withRunLock } from "./service-io";
import { VAULT, type ActionPlan } from "./types";

export class LoadoutError extends Error {}

/** Resuelve qué se va a hacer, con los datos del momento. Función pura. */
export function buildLoadoutPlan(
  gear: Pick<GearData, "items" | "characters">,
  loadout: Parameters<typeof planEquipLoadout>[0]["loadout"] | undefined,
  characterId: string,
  dryRun: boolean,
): ActionPlan {
  if (!loadout) throw new LoadoutError("Ese loadout ya no existe. Recarga la pantalla.");
  const character = gear.characters.find((c) => c.id === characterId);
  if (!character) throw new LoadoutError("No se encontró el personaje elegido.");
  return planEquipLoadout({ loadout, character, items: gear.items, dryRun });
}

const placeName = (names: Map<string, string>, p: string) => (p === VAULT ? "alijo" : (names.get(p) ?? "personaje"));

/**
 * Equipa un loadout: relee la cuenta (armas Y armaduras), recalcula el plan y lo ejecuta.
 * Del navegador solo se acepta el id del loadout y del personaje. Una sola ejecución a la vez.
 */
export async function equipLoadout(args: {
  loadoutId: string;
  characterId: string;
  dryRun: boolean;
  signal?: AbortSignal;
}): Promise<EquipOutcome> {
  return withRunLock(async () => {
    const [gear, loadouts] = await Promise.all([loadGearData({ armor: true }), listLoadouts()]);
    const plan = buildLoadoutPlan(gear, loadouts.find((l) => l.id === args.loadoutId), args.characterId, args.dryRun);

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
    const steps = outcome.results.map((r) => {
      const a = byId.get(r.actionId)!;
      const what =
        a.kind === "equip" ? `equipar en ${names.get(a.characterId) ?? "personaje"}` : a.kind === "transfer" ? `${placeName(names, a.from)} → ${placeName(names, a.to)}` : a.state ? "bloquear" : "desbloquear";
      return { name: a.name, what, ok: r.ok, ...(r.skipped && { skipped: true }), ...(r.error && { error: r.error }) };
    });
    return { ok: outcome.results.every((r) => r.ok), dryRun: args.dryRun, plan, runId: outcome.runId, steps };
  });
}
