import type { ItemSlot } from "./types";

/** Bucket del alijo general. */
export const VAULT_BUCKET_HASH = 138197802;

/** Bucket de la definición → ranura. */
export const SLOT_BY_BUCKET: Record<number, ItemSlot> = {
  1498876634: "kinetic",
  2465295065: "energy",
  953998645: "power",
  3448274439: "helmet",
  3551918588: "arms",
  14239492: "chest",
  20886954: "legs",
  1585787867: "classItem",
};

/** Las 6 stats de armadura, en el orden en que se muestran. */
export const ARMOR_STAT_HASHES = [
  2996146975, // Armas
  392767087, // Salud
  1943323491, // Clase
  1735777505, // Granada
  144602215, // Superhabilidad
  4244567218, // Cuerpo a cuerpo
] as const;

/** Stats que no son "de combate" y no se muestran en las armas (poder, defensa). */
export const HIDDEN_STAT_HASHES = new Set([1935470627, 3897883278, 1480404414]);

/** Categorías de socket que contienen perks (arma y armadura). */
export const PERK_SOCKET_CATEGORIES = new Set([
  4241085061, // VENTAJAS DE ARMA
  3410521964, // Ventajas de arma
  2518356196, // VENTAJAS DE ARMADURA
  3154740035, // VENTAJAS DE ARMADURA
]);

export const ITEM_TYPE_ARMOR = 2;
export const ITEM_TYPE_WEAPON = 3;
