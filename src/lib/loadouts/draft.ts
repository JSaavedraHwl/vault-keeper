// Lógica pura del editor de loadouts (sin React): qué se puede elegir en cada ranura y qué reglas aplican.

import type { CharacterInfo, NormalizedItem } from "../inventory/types";
import {
  ARMOR_EQUIP_SLOTS,
  EQUIP_SLOTS,
  isWeaponSlot,
  WEAPON_EQUIP_SLOTS,
  type EquipSlot,
  type LoadoutClass,
  type LoadoutItemRef,
} from "./types";

/** Lo que se va eligiendo en el editor: una referencia por ranura. */
export type DraftItems = Partial<Record<EquipSlot, LoadoutItemRef>>;

export function refOf(item: NormalizedItem): LoadoutItemRef {
  return { id: item.id, hash: item.hash, name: item.name, icon: item.icon, tier: item.tier };
}

/** Las 8 ranuras con sus piezas equipadas AHORA en un personaje (para «Guardar lo que llevo puesto»). */
export function draftFromEquipped(items: readonly NormalizedItem[], characterId: string): DraftItems {
  const draft: DraftItems = {};
  for (const i of items) {
    if (i.equipped && i.location === "character" && i.characterId === characterId && EQUIP_SLOTS.includes(i.slot as EquipSlot)) {
      draft[i.slot as EquipSlot] = refOf(i);
    }
  }
  return draft;
}

const groupOf = (slot: EquipSlot) => (isWeaponSlot(slot) ? WEAPON_EQUIP_SLOTS : ARMOR_EQUIP_SLOTS);

export interface Candidate {
  item: NormalizedItem;
  /** Motivo por el que no se puede elegir ahora (p. ej. ya hay otra exótica); null si se puede. */
  blockedReason: string | null;
}

/**
 * Piezas que se pueden elegir para una ranura: de esa ranura, y las armaduras solo de la clase del loadout.
 * Si ya hay una exótica del mismo tipo (arma o armadura) en OTRA ranura, las exóticas salen bloqueadas con su
 * motivo. Orden: mayor poder primero.
 */
export function candidatesFor(
  slot: EquipSlot,
  classType: LoadoutClass,
  items: readonly NormalizedItem[],
  draft: DraftItems,
  query = "",
): Candidate[] {
  const otherExotic = groupOf(slot)
    .filter((s) => s !== slot)
    .map((s) => draft[s])
    .find((r) => r?.tier === "exotic");
  const q = query.trim().toLocaleLowerCase("es");

  return items
    .filter((i) => i.slot === slot)
    .filter((i) => isWeaponSlot(slot) || i.classType === null || i.classType === classType)
    .filter((i) => !q || i.name.toLocaleLowerCase("es").includes(q))
    .sort((a, b) => (b.power ?? 0) - (a.power ?? 0) || a.name.localeCompare(b.name, "es"))
    .map((item) => ({
      item,
      blockedReason:
        item.tier === "exotic" && otherExotic
          ? `Ya eligiste ${isWeaponSlot(slot) ? "un arma" : "una armadura"} exótica («${otherExotic.name}»): el juego solo permite una.`
          : null,
    }));
}

/** Pone o quita la pieza de una ranura sin mutar el borrador. */
export function withSlot(draft: DraftItems, slot: EquipSlot, item: NormalizedItem | null): DraftItems {
  const { [slot]: _removed, ...rest } = draft;
  void _removed;
  return item ? { ...rest, [slot]: refOf(item) } : rest;
}

/**
 * Al cambiar de personaje/clase, las armaduras elegidas de otra clase ya no valen. Devuelve el borrador sin ellas
 * (las armas se conservan) y cuántas se quitaron.
 */
export function dropOtherClassArmor(
  draft: DraftItems,
  classType: LoadoutClass,
  items: readonly NormalizedItem[],
): { draft: DraftItems; dropped: number } {
  const byId = new Map(items.map((i) => [i.id, i]));
  let dropped = 0;
  const kept: DraftItems = {};
  for (const slot of EQUIP_SLOTS) {
    const ref = draft[slot];
    if (!ref) continue;
    const item = byId.get(ref.id);
    const wrong = !isWeaponSlot(slot) && item && item.classType !== null && item.classType !== classType;
    if (wrong) dropped++;
    else kept[slot] = ref;
  }
  return { draft: kept, dropped };
}

/** Clase del personaje elegido como clase del loadout (con un valor por defecto si aún no hay personaje). */
export const classOf = (character: Pick<CharacterInfo, "classType"> | undefined): LoadoutClass => character?.classType ?? "titan";
