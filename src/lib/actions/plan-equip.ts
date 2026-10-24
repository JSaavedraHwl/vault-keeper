import { randomUUID } from "node:crypto";
import { planEquip, SLOT_LABELS, type WeaponSlot } from "../inventory/gear-filter";
import type { CharacterInfo, NormalizedItem } from "../inventory/types";
import { VAULT, type ActionPlan, type PlannedAction } from "./types";

/**
 * Plan para equipar un arma en un personaje: traerla al personaje si hace falta (pasando por el alijo
 * si está en otro personaje) y equiparla. Si algo lo impide, el plan sale SIN rondas y con los motivos
 * en `warnings`: nunca se ejecuta a medias.
 */
export function planEquipWeapon(input: {
  item: NormalizedItem;
  character: Pick<CharacterInfo, "id" | "free">;
  /** Armas conocidas (alijo y personajes), para saber qué hay equipado. */
  items: readonly NormalizedItem[];
  dryRun?: boolean;
}): ActionPlan {
  const { item, character } = input;
  const equip = planEquip(item, character, input.items);

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

  if (equip.alreadyEquipped) {
    plan.warnings.push(`${item.name} ya está equipada en este personaje.`);
    return plan;
  }
  if (!equip.canEquip) {
    plan.warnings.push(...equip.blockers);
    return plan;
  }

  const base = { itemId: item.id, hash: item.hash, name: item.name };
  const actions: PlannedAction[] = [];
  const slotName = SLOT_LABELS[equip.slot as WeaponSlot];
  // Cada paso depende del anterior: si no se pudo traer, no se intenta equipar.
  const after = () => (actions.length > 0 ? { requires: [actions[actions.length - 1].id] } : {});

  if (equip.from === "other-character") {
    actions.push({ ...base, id: "equip-1", kind: "transfer", from: item.characterId!, to: VAULT, stackSize: 1, reason: "Paso previo: sale del otro personaje." });
  }
  if (equip.from !== "character") {
    actions.push({ ...base, ...after(), id: `equip-${actions.length + 1}`, kind: "transfer", from: VAULT, to: character.id, stackSize: 1, reason: "Paso previo: llevarla al personaje." });
  }
  actions.push({
    ...base,
    ...after(),
    id: `equip-${actions.length + 1}`,
    kind: "equip",
    characterId: character.id,
    ...(equip.replaces && { previous: { itemId: equip.replaces.id, hash: equip.replaces.hash, name: equip.replaces.name } }),
    reason: `Equipar en la ${slotName.number.toLowerCase()} (${slotName.name.toLowerCase()})${equip.replaces ? `, en lugar de ${equip.replaces.name}` : ""}.`,
  });

  plan.rounds.push({ index: 0, actions, note: `Equipar ${item.name} en ${slotName.number.toLowerCase()} (${slotName.name.toLowerCase()}).` });
  // Avisos informativos (de dónde sale), que no impiden hacerlo.
  plan.warnings.push(...equip.notes);
  return plan;
}

/**
 * Plan para mandar un arma al INVENTARIO de un personaje sin equiparla (desde el alijo o desde otro
 * personaje). Sirve cuando no se puede equipar ahora (p. ej. ya llevas otra exótica) pero se quiere
 * tenerla a mano. Si algo lo impide, el plan sale sin rondas y con los motivos en `warnings`.
 */
export function planSendToCharacter(input: {
  item: NormalizedItem;
  character: Pick<CharacterInfo, "id" | "free">;
  items: readonly NormalizedItem[];
  dryRun?: boolean;
}): ActionPlan {
  const { item, character } = input;
  const equip = planEquip(item, character, input.items);

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

  if (equip.alreadyThere) {
    plan.warnings.push(
      equip.alreadyEquipped ? `${item.name} ya está equipada en este personaje.` : `${item.name} ya está en el inventario de este personaje.`,
    );
    return plan;
  }
  if (!equip.canSend) {
    plan.warnings.push(...equip.sendBlockers);
    return plan;
  }

  const base = { itemId: item.id, hash: item.hash, name: item.name };
  const actions: PlannedAction[] = [];
  if (equip.from === "other-character") {
    actions.push({ ...base, id: "send-1", kind: "transfer", from: item.characterId!, to: VAULT, stackSize: 1, reason: "Paso previo: sale del otro personaje." });
  }
  actions.push({
    ...base,
    ...(actions.length > 0 && { requires: [actions[0].id] }),
    id: `send-${actions.length + 1}`,
    kind: "transfer",
    from: VAULT,
    to: character.id,
    stackSize: 1,
    reason: "Mandar al inventario del personaje, sin equiparla.",
  });

  const slotName = SLOT_LABELS[equip.slot as WeaponSlot];
  plan.rounds.push({ index: 0, actions, note: `Mandar ${item.name} al inventario (${slotName.number.toLowerCase()}, ${slotName.name.toLowerCase()}).` });
  plan.warnings.push(...equip.notes);
  return plan;
}
