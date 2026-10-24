import type { NormalizedItem } from "../src/lib/inventory/types";

/**
 * Alijo de ejemplo para el modo simulación y los tests: no depende de la cuenta de Bungie.
 * Cubre cada regla; los comentarios indican el veredicto esperado con la configuración por defecto.
 */

const STAT_KEYS = ["Armas", "Salud", "Clase", "Granada", "Superhabilidad", "Cuerpo a cuerpo"];

function weapon(id: string, name: string, over: Partial<NormalizedItem> = {}): NormalizedItem {
  return {
    id,
    hash: Number(id.replace(/\D/g, "")) || 1,
    name,
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
    ...over,
  };
}

function armor(
  id: string,
  name: string,
  stats: [number, number, number, number, number, number],
  over: Partial<NormalizedItem> = {},
): NormalizedItem {
  return weapon(id, name, {
    hash: 90_000 + Number(id.replace(/\D/g, "")),
    kind: "armor",
    type: "Casco",
    slot: "helmet",
    classType: "titan",
    stats: stats.map((value, i) => ({ name: STAT_KEYS[i], value })),
    armorTotal: stats.reduce((a, b) => a + b, 0),
    ...over,
  });
}

const stat = (value: number) => [{ name: "Estabilidad", value }];

export const vaultFixtures: NormalizedItem[] = [
  // Protección
  weapon("w101", "Rifle bloqueado común", { tier: "common", locked: true }), // keep (candado)
  weapon("w102", "Rifle equipado", {
    tier: "common",
    equipped: true,
    location: "character",
    characterId: "c1",
  }), // keep (equipado)
  // Rareza baja
  weapon("w103", "Pistola común", { tier: "common", type: "Pistola" }), // junk
  weapon("w104", "Fusil raro", { tier: "rare", type: "Fusil de explorador" }), // junk
  // Duplicados (mismo hash 5001)
  weapon("w5001a", "Rifle Alfa", { hash: 5001, power: 250, stats: stat(80) }), // keep (mejor copia)
  weapon("w5001b", "Rifle Alfa", { hash: 5001, power: 200, stats: stat(40) }), // junk (copia peor)
  weapon("w5001c", "Rifle Alfa", { hash: 5001, power: 250, stats: stat(78) }), // archive (casi igual)
  // Única copia
  weapon("w106", "Arco Único", { type: "Arco", slot: "energy" }), // keep
  // Exótico duplicado (hash 5002): la peor no puede ser junk
  weapon("w5002a", "Exótica Beta", { hash: 5002, tier: "exotic", power: 250, stats: stat(80) }), // keep
  weapon("w5002b", "Exótica Beta", { hash: 5002, tier: "exotic", power: 200, stats: stat(30) }), // archive (exótico)
  // Armaduras
  armor("a201", "Casco débil de titán", [8, 8, 8, 8, 8, 8]), // junk (48)
  armor("a202", "Casco fuerte de titán", [12, 12, 12, 12, 12, 12]), // keep (72)
  armor("a203", "Casco medio de titán", [11, 11, 11, 11, 11, 10], { slot: "helmet" }), // archive (65)
  armor("a204", "Guantes débiles de cazador", [9, 9, 8, 8, 8, 8], {
    classType: "hunter",
    type: "Guanteletes",
    slot: "arms",
  }), // junk (50); archive si se desactiva el cazador
  armor("a205", "Peto de hechicero fuerte", [14, 12, 12, 12, 10, 10], {
    classType: "warlock",
    type: "Peto",
    slot: "chest",
  }), // keep (70)
  armor("a206", "Botas exóticas débiles", [5, 5, 5, 5, 5, 5], {
    tier: "exotic",
    type: "Botas",
    slot: "legs",
  }), // archive (exótico)
  armor("a207", "Casco débil con candado", [2, 2, 2, 2, 2, 2], { locked: true }), // keep (candado)
  // Armaduras con nivel de pieza (gearTier)
  armor("a208", "Casco de nivel 1", [10, 9, 9, 9, 9, 9], { gearTier: 1 }), // junk (nivel bajo)
  armor("a209", "Casco de nivel 3", [12, 11, 11, 11, 11, 10], { gearTier: 3 }), // archive (nivel intermedio)
  armor("a210", "Casco de nivel 4", [13, 12, 12, 12, 12, 11], { gearTier: 4 }), // keep (nivel alto)
  // Otros ítems
  {
    ...weapon("o301", "Núcleo de mejora", { tier: "common", kind: "other", type: "Material" }),
    quantity: 50,
  }, // keep (otros)
  weapon("o302", "Mod de ejemplo", { tier: "uncommon", kind: "other", type: "Mod de armadura" }), // keep
];
