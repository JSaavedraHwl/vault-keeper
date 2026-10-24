/**
 * Ítem normalizado: compacto, plano y serializable (JSON puro, sin hashes que haya
 * que resolver después). Es el tipo que recibirá el módulo de clasificación con IA.
 */
export interface NormalizedItem {
  /** itemInstanceId; en ítems apilables (sin instancia) es el hash como texto. */
  id: string;
  hash: number;
  name: string;
  /** URL absoluta del ícono, o null. */
  icon: string | null;
  kind: "weapon" | "armor" | "other";
  /** Nombre visible del tipo: "Rifle de pulsos", "Casco"... */
  type: string;
  slot: ItemSlot;
  tier: ItemTier;
  /** Nivel de poder; null en ítems sin poder. */
  power: number | null;
  /** Nivel de la pieza (`gearTier` de Bungie), si la API lo informa. */
  gearTier?: number;
  /** Clase a la que pertenece (armaduras); null si sirve a todas. */
  classType: "titan" | "hunter" | "warlock" | null;
  /** Perks activos (los insertados en cada columna). */
  perks: { name: string; description?: string }[];
  /** Stats con valor; en armaduras, las 6 en orden fijo. */
  stats: { name: string; value: number }[];
  /** Suma de las 6 stats de la armadura. */
  armorTotal?: number;
  quantity: number;
  /** Con candado en el juego. */
  locked: boolean;
  /** Equipado en un personaje (nunca en el alijo). */
  equipped: boolean;
  location: "vault" | "character";
  /** Solo si location es "character". */
  characterId?: string;
}

/** Un personaje de la cuenta y el espacio libre que tiene por ranura. */
export interface CharacterInfo {
  id: string;
  classType: "titan" | "hunter" | "warlock";
  /** Nivel de poder. */
  light: number;
  /** Huecos libres por ranura (incluye el equipado como ocupado). Una ranura ausente = sin dato. */
  free: Partial<Record<ItemSlot, number>>;
}

export type ItemSlot =
  | "kinetic"
  | "energy"
  | "power"
  | "helmet"
  | "arms"
  | "chest"
  | "legs"
  | "classItem"
  | "other";

export type ItemTier = "common" | "uncommon" | "rare" | "legendary" | "exotic";
