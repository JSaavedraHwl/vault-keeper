import { randomUUID } from "node:crypto";
import type { CharacterInfo, NormalizedItem } from "../inventory/types";
import { analyzeLoadout, NEEDS_EQUIP, type SlotAnalysis } from "../loadouts/analyze";
import { EQUIP_SLOT_LABELS, type Loadout } from "../loadouts/types";
import { VAULT, type ActionPlan, type PlannedAction } from "./types";

/**
 * Plan para equipar un loadout completo en un personaje: por cada pieza que no lleve ya puesta, la trae (pasando
 * por el alijo si está en otro personaje) y la equipa. Si algo lo impide, el plan sale SIN rondas y con los motivos
 * en `warnings`: nunca se ejecuta a medias.
 *
 * Orden: primero se equipan las piezas NO exóticas y al final las exóticas. Así, si el loadout cambia la exótica
 * que llevas por otra en otra ranura, la vieja ya se ha quitado cuando se equipa la nueva (el juego rechaza dos
 * exóticas de arma, o de armadura, a la vez).
 */
export function planEquipLoadout(input: {
  loadout: Pick<Loadout, "name" | "classType" | "items">;
  character: Pick<CharacterInfo, "id" | "classType" | "free">;
  /** Armas y armaduras conocidas (alijo y personajes). */
  items: readonly NormalizedItem[];
  dryRun?: boolean;
}): ActionPlan {
  const { loadout, character } = input;
  const analysis = analyzeLoadout(loadout, character, input.items);

  const plan: ActionPlan = {
    id: randomUUID(),
    kind: "equip",
    createdAt: new Date().toISOString(),
    dryRun: input.dryRun ?? false,
    targetCharacterId: character.id,
    rounds: [],
    skipped: [],
    warnings: [],
  };

  if (analysis.blockers.length > 0) {
    plan.warnings.push(...analysis.blockers);
    return plan;
  }
  const todo = analysis.slots.filter((s) => NEEDS_EQUIP.includes(s.status));
  plan.warnings.push(...analysis.warnings);
  if (todo.length === 0) return plan;

  // No exóticas primero (estable: respeta el orden de las ranuras).
  const ordered = [...todo].sort((a, b) => Number(a.item?.tier === "exotic") - Number(b.item?.tier === "exotic"));

  const actions: PlannedAction[] = ordered.flatMap((s) => actionsFor(s, character.id));
  plan.rounds.push({
    index: 0,
    actions,
    note: `Equipar «${loadout.name}»: ${todo.length} ${todo.length === 1 ? "pieza" : "piezas"}.`,
  });
  for (const s of analysis.slots) {
    if (s.status === "missing" || s.status === "wrong-class") {
      plan.skipped.push({ itemId: s.ref?.id ?? s.slot, name: s.ref?.name ?? EQUIP_SLOT_LABELS[s.slot], reason: s.status === "missing" ? "Ya no existe." : "Es de otra clase." });
    }
  }
  return plan;
}

function actionsFor(s: SlotAnalysis, characterId: string): PlannedAction[] {
  const item = s.item!;
  const base = { itemId: item.id, hash: item.hash, name: item.name };
  const id = (n: number) => `lo-${s.slot}-${n}`;
  const out: PlannedAction[] = [];

  if (s.status === "from-other") {
    out.push({ ...base, id: id(1), kind: "transfer", from: item.characterId!, to: VAULT, stackSize: 1, reason: "Paso previo: sale del otro personaje." });
  }
  if (s.status !== "in-inventory") {
    out.push({
      ...base,
      ...(out.length > 0 && { requires: [out[out.length - 1].id] }),
      id: id(out.length + 1),
      kind: "transfer",
      from: VAULT,
      to: characterId,
      stackSize: 1,
      reason: "Paso previo: llevarla al personaje.",
    });
  }
  out.push({
    ...base,
    ...(out.length > 0 && { requires: [out[out.length - 1].id] }),
    id: id(out.length + 1),
    kind: "equip",
    characterId,
    ...(s.replaces && { previous: { itemId: s.replaces.id, hash: s.replaces.hash, name: s.replaces.name } }),
    reason: `Equipar en ${EQUIP_SLOT_LABELS[s.slot].toLowerCase()}${s.replaces ? `, en lugar de ${s.replaces.name}` : ""}.`,
  });
  return out;
}
