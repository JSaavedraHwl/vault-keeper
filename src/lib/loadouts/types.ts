// Modelo de los loadouts. Módulo puro: sirve en el servidor y en el navegador.

import type { ItemTier } from "../inventory/types";

/** Las 8 ranuras de equipo de un loadout: 3 armas y 5 piezas de armadura. */
export type EquipSlot = "kinetic" | "energy" | "power" | "helmet" | "arms" | "chest" | "legs" | "classItem";

export const WEAPON_EQUIP_SLOTS: readonly EquipSlot[] = ["kinetic", "energy", "power"];
export const ARMOR_EQUIP_SLOTS: readonly EquipSlot[] = ["helmet", "arms", "chest", "legs", "classItem"];
export const EQUIP_SLOTS: readonly EquipSlot[] = [...WEAPON_EQUIP_SLOTS, ...ARMOR_EQUIP_SLOTS];

export const EQUIP_SLOT_LABELS: Record<EquipSlot, string> = {
  kinetic: "Cinética",
  energy: "Energía",
  power: "Pesada",
  helmet: "Casco",
  arms: "Guanteletes",
  chest: "Peto",
  legs: "Botas",
  classItem: "Objeto de clase",
};

export const isWeaponSlot = (slot: EquipSlot) => WEAPON_EQUIP_SLOTS.includes(slot);

export type LoadoutClass = "titan" | "hunter" | "warlock";

/**
 * Referencia a una pieza dentro de un loadout. Guarda una «foto» (nombre, ícono, rareza) para poder mostrar el
 * loadout aunque la pieza ya no exista (p. ej. si se desmanteló).
 */
export interface LoadoutItemRef {
  /** itemInstanceId */
  id: string;
  hash: number;
  name: string;
  icon: string | null;
  tier: ItemTier;
}

export interface Loadout {
  id: string;
  name: string;
  /** Clase para la que es. Sirve para cualquier personaje de esa clase. */
  classType: LoadoutClass;
  notes?: string;
  items: Partial<Record<EquipSlot, LoadoutItemRef>>;
  createdAt: string;
  updatedAt: string;
}

/** Lo que se envía para crear o actualizar un loadout (con `id` si ya existe). */
export type LoadoutInput = Omit<Loadout, "id" | "createdAt" | "updatedAt"> & { id?: string };

export const MAX_LOADOUTS = 100;
