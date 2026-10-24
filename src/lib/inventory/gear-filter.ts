// Filtros y reglas de la pantalla «Equipar». Funciones puras (sin servidor), para poder probarlas.

import {
  championStatus,
  type ArtifactChampionPerk,
  type Champion,
  type ChampionStatus,
} from "./champions";
import type { Ammo, CharacterInfo, ItemSlot, NormalizedItem } from "./types";

export type WeaponSlot = Extract<ItemSlot, "kinetic" | "energy" | "power">;
export const WEAPON_SLOT_ORDER: readonly WeaponSlot[] = ["kinetic", "energy", "power"];

/** Cómo llama el juego a cada ranura de arma (1.ª, 2.ª y pesada). */
export const SLOT_LABELS: Record<WeaponSlot, { number: string; name: string }> = {
  kinetic: { number: "Ranura 1", name: "Cinética" },
  energy: { number: "Ranura 2", name: "Energía" },
  power: { number: "Ranura 3", name: "Pesada" },
};

export interface GearFilters {
  /** Capacidades pedidas (cualquiera de ellas). Vacío = no filtrar por campeón. */
  champions: readonly Champion[];
  /** Incluir también las armas que la tendrían al activar una ventaja de artefacto. */
  includePotential: boolean;
  type: string;
  element: string;
  /** Tipo de munición; "" = cualquiera. */
  ammo: Ammo | "";
  where: "all" | "vault" | "selected" | "others";
  query: string;
}

export const NO_FILTERS: GearFilters = {
  champions: [],
  includePotential: true,
  type: "",
  element: "",
  ammo: "",
  where: "all",
  query: "",
};

export interface GearContext {
  characterId: string;
  perks: readonly ArtifactChampionPerk[];
  /** Ventajas de artefacto activas del personaje elegido. */
  activePerks: ReadonlySet<number>;
}

export type MatchKind = "now" | "potential" | "none";

export interface GearRow {
  item: NormalizedItem;
  status: ChampionStatus;
  /** Por qué pasa el filtro de campeón (o "none" si no se filtra / no cumple). */
  match: MatchKind;
}

const normalize = (s: string) =>
  s.toLocaleLowerCase("es").normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Evalúa un arma para el personaje elegido y decide si pasa los filtros. null = no pasa. */
export function evaluate(item: NormalizedItem, ctx: GearContext, f: GearFilters): GearRow | null {
  if (f.type && item.type !== f.type) return null;
  if (f.element && item.element !== f.element) return null;
  if (f.ammo && item.ammo !== f.ammo) return null;
  if (f.query.trim() && !normalize(item.name).includes(normalize(f.query.trim()))) return null;

  const isHere = item.location === "character" && item.characterId === ctx.characterId;
  if (f.where === "vault" && item.location !== "vault") return null;
  if (f.where === "selected" && !isHere) return null;
  if (f.where === "others" && (item.location !== "character" || isHere)) return null;

  const status = championStatus(item, ctx.perks, ctx.activePerks);
  let match: MatchKind = "none";
  if (f.champions.length > 0) {
    if (status.now.some((c) => f.champions.includes(c.type))) match = "now";
    else if (f.includePotential && status.potential.some((p) => f.champions.includes(p.type))) match = "potential";
    else return null;
  }
  return { item, status, match };
}

const matchRank: Record<MatchKind, number> = { now: 0, potential: 1, none: 2 };

/** Aplica los filtros y reparte las armas por ranura (1.ª, 2.ª, pesada), mejores primero. */
export function filterGear(
  items: readonly NormalizedItem[],
  ctx: GearContext,
  filters: GearFilters,
): Record<WeaponSlot, GearRow[]> {
  const out: Record<WeaponSlot, GearRow[]> = { kinetic: [], energy: [], power: [] };
  for (const item of items) {
    if (!WEAPON_SLOT_ORDER.includes(item.slot as WeaponSlot)) continue;
    const row = evaluate(item, ctx, filters);
    if (row) out[item.slot as WeaponSlot].push(row);
  }
  for (const rows of Object.values(out)) {
    rows.sort(
      (a, b) =>
        matchRank[a.match] - matchRank[b.match] ||
        Number(b.item.equipped) - Number(a.item.equipped) ||
        (b.item.power ?? 0) - (a.item.power ?? 0) ||
        a.item.name.localeCompare(b.item.name, "es"),
    );
  }
  return out;
}

/** Lo que lleva equipado ahora el personaje, por ranura. */
export function equippedBySlot(
  items: readonly NormalizedItem[],
  characterId: string,
): Partial<Record<WeaponSlot, NormalizedItem>> {
  const out: Partial<Record<WeaponSlot, NormalizedItem>> = {};
  for (const i of items) {
    if (i.equipped && i.location === "character" && i.characterId === characterId) {
      out[i.slot as WeaponSlot] = i;
    }
  }
  return out;
}

export interface EquipPlan {
  slot: WeaponSlot;
  /** Lo que se desequipa al equipar este arma (si ya hay una en esa ranura). */
  replaces?: NormalizedItem;
  /** Ya está equipada en el personaje elegido: no hay nada que hacer. */
  alreadyEquipped: boolean;
  /** De dónde sale el arma antes de equiparla. */
  from: "character" | "vault" | "other-character";
  /** El juego no permite dos exóticas de arma equipadas: la que estorba. */
  exoticConflict?: NormalizedItem;
  /** Motivos que IMPIDEN equiparla ahora, en español. */
  blockers: string[];
  /** Información que no impide nada (p. ej. de dónde sale el arma). */
  notes: string[];
  /** blockers + notes, por compatibilidad. */
  problems: string[];
  /** false si hay algo que impide equiparla ahora mismo. */
  canEquip: boolean;
  /** Ya está en el personaje (en su inventario o equipada): no hace falta mandarla. */
  alreadyThere: boolean;
  /** Se puede mandar al inventario del personaje sin equiparla. La exótica equipada no influye. */
  canSend: boolean;
  /** Motivos que impiden mandarla al inventario. */
  sendBlockers: string[];
}

/** Qué pasaría al equipar `item` en `character`: ranura, reemplazo, movimientos previos y conflictos. */
export function planEquip(
  item: NormalizedItem,
  character: Pick<CharacterInfo, "id" | "free">,
  items: readonly NormalizedItem[],
): EquipPlan {
  const slot = item.slot as WeaponSlot;
  const equipped = equippedBySlot(items, character.id);
  const current = equipped[slot];
  const alreadyEquipped = current?.id === item.id;
  const from: EquipPlan["from"] =
    item.location === "vault"
      ? "vault"
      : item.characterId === character.id
        ? "character"
        : "other-character";
  const blockers: string[] = [];
  const notes: string[] = [];
  const sendBlockers: string[] = [];

  // Dos exóticas de arma a la vez no están permitidas (la de la misma ranura se reemplaza, no estorba).
  const exoticConflict =
    item.tier === "exotic"
      ? WEAPON_SLOT_ORDER.filter((s) => s !== slot)
          .map((s) => equipped[s])
          .find((w) => w?.tier === "exotic")
      : undefined;
  if (exoticConflict) {
    blockers.push(
      `Ya llevas una exótica equipada (${exoticConflict.name}, ${SLOT_LABELS[exoticConflict.slot as WeaponSlot].name.toLowerCase()}). El juego no permite dos exóticas de arma a la vez: cámbiala antes, o mándala al inventario sin equiparla.`,
    );
  }

  const alreadyThere = from === "character";
  if (!alreadyEquipped && !alreadyThere) {
    // Para traerla al personaje (equipada o no) hace falta un hueco en esa ranura.
    if ((character.free[slot] ?? 0) < 1) {
      const msg = `No hay hueco libre en la ranura de ${SLOT_LABELS[slot].name.toLowerCase()} del personaje para traerla.`;
      blockers.push(msg);
      sendBlockers.push(msg);
    }
    notes.push(
      from === "vault"
        ? "Está en el alijo: se moverá al personaje antes de equiparla."
        : "Está en otro personaje: pasará por el alijo hasta el personaje elegido antes de equiparla.",
    );
  }

  return {
    slot,
    replaces: alreadyEquipped ? undefined : current,
    alreadyEquipped,
    from,
    exoticConflict,
    blockers,
    notes,
    problems: [...blockers, ...notes],
    canEquip: blockers.length === 0 && !alreadyEquipped,
    alreadyThere,
    canSend: !alreadyThere && sendBlockers.length === 0,
    sendBlockers,
  };
}
