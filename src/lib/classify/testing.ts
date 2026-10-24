import { ARMOR_STAT_KEYS } from "../inventory/constants";
import type { NormalizedItem } from "../inventory/types";

let counter = 0;

/** Ítem de ejemplo: un arma legendaria sin perks ni stats. Sobrescribe lo que necesites. */
export function makeItem(overrides: Partial<NormalizedItem> = {}): NormalizedItem {
  counter += 1;
  return {
    id: `item-${counter}`,
    hash: 1000 + counter,
    name: `Ítem ${counter}`,
    icon: null,
    kind: "weapon",
    type: "Rifle de pulsos",
    slot: "kinetic",
    tier: "legendary",
    power: 200,
    classType: null,
    perks: [],
    stats: [],
    quantity: 1,
    locked: false,
    equipped: false,
    location: "vault",
    ...overrides,
  };
}

/** Armadura legendaria con las 6 stats dadas (en orden: armas, salud, clase, granada, super, cuerpo a cuerpo). */
export function makeArmor(
  stats: readonly [number, number, number, number, number, number],
  overrides: Partial<NormalizedItem> = {},
): NormalizedItem {
  return makeItem({
    kind: "armor",
    type: "Casco",
    slot: "helmet",
    classType: "titan",
    stats: stats.map((value, i) => ({ name: ARMOR_STAT_KEYS[i], value })),
    armorTotal: stats.reduce((a, b) => a + b, 0),
    ...overrides,
  });
}
