import { vaultFixtures } from "../../../fixtures/vault-items";
import { MockInventoryActions } from "../bungie/actions/mock";
import type { CharacterInfo, ItemSlot, NormalizedItem } from "../inventory/types";
import { VAULT } from "./types";

// Un «mundo» de juguete en memoria para probar todo el flujo (rondas, deshacer...) sin tocar Bungie.
// Vive mientras el servidor esté encendido.

const CAPACITY = 10;
const SLOTS: ItemSlot[] = ["kinetic", "energy", "power", "helmet", "arms", "chest", "legs", "classItem"];
const CHARACTERS = [
  { id: "sim-titan", classType: "titan", light: 2000 },
  { id: "sim-hunter", classType: "hunter", light: 1950 },
] as const;

interface SimState {
  /** itemId → dónde está y si tiene candado. */
  items: Record<string, { location: string; locked: boolean }>;
  /** Ítems «desmantelados» en el juego. */
  removed: Set<string>;
}

const g = globalThis as unknown as { __simWorld?: SimState };

function fresh(): SimState {
  return {
    items: Object.fromEntries(
      vaultFixtures.map((i) => [i.id, { location: i.location === "vault" ? VAULT : (i.characterId ?? CHARACTERS[0].id), locked: i.locked }]),
    ),
    removed: new Set(),
  };
}

const world = (): SimState => (g.__simWorld ??= fresh());

export function resetSimWorld() {
  g.__simWorld = fresh();
}

/** Todos los ítems no desmantelados, con su lugar y candado actuales. */
function allItems(): NormalizedItem[] {
  const w = world();
  return vaultFixtures
    .filter((i) => !w.removed.has(i.id))
    .map((i) => {
      const s = w.items[i.id];
      const inVault = s.location === VAULT;
      const { characterId: _drop, ...rest } = i;
      void _drop;
      return { ...rest, locked: s.locked, location: inVault ? "vault" : "character", ...(inVault ? {} : { characterId: s.location }) };
    });
}

export function simVaultItems(): NormalizedItem[] {
  return allItems().filter((i) => i.location === "vault");
}

export function simCharacters(): CharacterInfo[] {
  const onChar = allItems().filter((i) => i.location === "character");
  return CHARACTERS.map((c) => ({
    ...c,
    free: Object.fromEntries(
      SLOTS.map((slot) => [slot, Math.max(CAPACITY - onChar.filter((i) => i.characterId === c.id && i.slot === slot).length, 0)]),
    ),
  }));
}

/** Mock de la API con el estado actual del mundo simulado. */
export function simActions(): MockInventoryActions {
  const w = world();
  const equipped = new Set(vaultFixtures.filter((i) => i.equipped).map((i) => i.id));
  return new MockInventoryActions({
    items: Object.fromEntries(
      Object.entries(w.items)
        .filter(([id]) => !w.removed.has(id))
        .map(([id, s]) => [id, { ...s, equipped: equipped.has(id) }]),
    ),
  });
}

/** Guarda en el mundo lo que hizo el mock. */
export function simCommit(mock: MockInventoryActions) {
  const w = world();
  for (const [id, s] of Object.entries(mock.items)) w.items[id] = { location: s.location, locked: s.locked };
}

/** Simula desmantelar en el juego todo lo no equipado que hay en un personaje. Devuelve cuántos. */
export function simDismantle(characterId: string): number {
  const w = world();
  let n = 0;
  for (const item of allItems()) {
    if (item.location === "character" && item.characterId === characterId && !item.equipped) {
      w.removed.add(item.id);
      n++;
    }
  }
  return n;
}
