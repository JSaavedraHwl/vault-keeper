// Qué pasaría al equipar un loadout en un personaje. Módulo puro (sirve en el navegador para la vista previa y
// en el servidor para el plan real, que se recalcula con datos frescos antes de ejecutar).

import type { CharacterInfo, NormalizedItem } from "../inventory/types";
import {
  ARMOR_EQUIP_SLOTS,
  EQUIP_SLOT_LABELS,
  EQUIP_SLOTS,
  WEAPON_EQUIP_SLOTS,
  type EquipSlot,
  type Loadout,
  type LoadoutItemRef,
} from "./types";

export type SlotStatus =
  | "empty" // el loadout no tiene pieza para esta ranura
  | "equipped" // ya la lleva equipada el personaje
  | "in-inventory" // está en el inventario del personaje: solo hay que equiparla
  | "from-vault" // se traerá del alijo
  | "from-other" // está en otro personaje: pasará por el alijo
  | "missing" // la pieza ya no existe (p. ej. se desmanteló)
  | "wrong-class"; // armadura de otra clase

export interface SlotAnalysis {
  slot: EquipSlot;
  status: SlotStatus;
  ref?: LoadoutItemRef;
  item?: NormalizedItem;
  /** Lo que lleva equipado ahora en esa ranura (si es otra cosa). */
  replaces?: NormalizedItem;
}

export interface LoadoutAnalysis {
  slots: SlotAnalysis[];
  /** Motivos que IMPIDEN equipar el loadout. */
  blockers: string[];
  /** Información o piezas que se omiten; no impiden equipar el resto. */
  warnings: string[];
  /** Piezas que hay que equipar (las que no están ya equipadas). */
  toDo: number;
  canEquip: boolean;
}

export const NEEDS_EQUIP: readonly SlotStatus[] = ["in-inventory", "from-vault", "from-other"];

const CLASS_NAMES = { titan: "Titán", hunter: "Cazador", warlock: "Hechicero" } as const;

const isWeapon = (slot: EquipSlot) => WEAPON_EQUIP_SLOTS.includes(slot);

/** Lo que lleva equipado el personaje, por ranura de equipo. */
function equippedOf(items: readonly NormalizedItem[], characterId: string): Partial<Record<EquipSlot, NormalizedItem>> {
  const out: Partial<Record<EquipSlot, NormalizedItem>> = {};
  for (const i of items) {
    if (i.equipped && i.location === "character" && i.characterId === characterId && EQUIP_SLOTS.includes(i.slot as EquipSlot)) {
      out[i.slot as EquipSlot] = i;
    }
  }
  return out;
}

export function analyzeLoadout(
  loadout: Pick<Loadout, "classType" | "items">,
  character: Pick<CharacterInfo, "id" | "classType" | "free">,
  items: readonly NormalizedItem[],
): LoadoutAnalysis {
  const byId = new Map(items.map((i) => [i.id, i]));
  const equipped = equippedOf(items, character.id);
  const blockers: string[] = [];
  const warnings: string[] = [];

  if (loadout.classType !== character.classType) {
    blockers.push(
      `Este loadout es de ${CLASS_NAMES[loadout.classType]} y el personaje elegido es ${CLASS_NAMES[character.classType]}.`,
    );
  }

  const slots: SlotAnalysis[] = EQUIP_SLOTS.map((slot): SlotAnalysis => {
    const ref = loadout.items[slot];
    if (!ref) return { slot, status: "empty" };

    const item = byId.get(ref.id);
    const label = `${EQUIP_SLOT_LABELS[slot].toLowerCase()} «${ref.name}»`;
    if (!item) {
      warnings.push(`La pieza de ${label} ya no existe; se omite.`);
      return { slot, status: "missing", ref };
    }
    // Una armadura de otra clase no se puede equipar (las armas no tienen clase).
    if (!isWeapon(slot) && item.classType !== null && item.classType !== character.classType) {
      warnings.push(`La pieza de ${label} es de otra clase; se omite.`);
      return { slot, status: "wrong-class", ref, item };
    }

    const current = equipped[slot];
    if (current?.id === item.id) return { slot, status: "equipped", ref, item };

    const hereInInventory = item.location === "character" && item.characterId === character.id;
    const status: SlotStatus = hereInInventory ? "in-inventory" : item.location === "vault" ? "from-vault" : "from-other";

    // Traerla al personaje necesita un hueco libre en esa ranura (una ranura sin dato cuenta como sin hueco).
    if (status !== "in-inventory" && (character.free[slot as keyof typeof character.free] ?? 0) < 1) {
      blockers.push(`No hay hueco libre en ${EQUIP_SLOT_LABELS[slot].toLowerCase()} del personaje para traer «${ref.name}».`);
    }
    return { slot, status, ref, item, replaces: current };
  });

  // Estado final del equipo: lo del loadout donde se equipa, y lo que ya llevaba donde el loadout no toca.
  const finalItem = (s: SlotAnalysis): NormalizedItem | undefined =>
    s.status === "equipped" || NEEDS_EQUIP.includes(s.status) ? s.item : equipped[s.slot];
  for (const [group, label] of [
    [WEAPON_EQUIP_SLOTS, "arma"],
    [ARMOR_EQUIP_SLOTS, "armadura"],
  ] as const) {
    const exotics = slots
      .filter((s) => group.includes(s.slot))
      .map(finalItem)
      .filter((i): i is NormalizedItem => i?.tier === "exotic");
    if (exotics.length > 1) {
      blockers.push(
        `El juego solo permite una ${label} exótica equipada a la vez, y quedarían ${exotics.map((e) => `«${e.name}»`).join(" y ")}.`,
      );
    }
  }

  const toDo = slots.filter((s) => NEEDS_EQUIP.includes(s.status)).length;
  if (toDo === 0 && blockers.length === 0) warnings.push("No hay nada que equipar: el personaje ya lleva todo lo que se puede.");

  return { slots, blockers, warnings, toDo, canEquip: blockers.length === 0 && toDo > 0 };
}
