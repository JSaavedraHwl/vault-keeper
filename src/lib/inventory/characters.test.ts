import type { DestinyProfileResponse } from "bungie-api-ts/destiny2";
import { describe, expect, it } from "vitest";
import type { Manifest } from "../manifest";
import { getCharacters } from "./characters";

const KINETIC = 1498876634;
const HELMET = 3448274439;

const manifest = {
  buckets: {
    [KINETIC]: { hash: KINETIC, name: "Cinéticas", itemCount: 10 },
    [HELMET]: { hash: HELMET, name: "Cascos", itemCount: 10 },
  },
} as unknown as Manifest;

const item = (bucketHash: number) => ({ bucketHash });

const profile = {
  characters: {
    data: {
      old: { characterId: "old", classType: 2, light: 1900, dateLastPlayed: "2026-01-01T00:00:00Z" },
      recent: { characterId: "recent", classType: 0, light: 2000, dateLastPlayed: "2026-10-01T00:00:00Z" },
    },
  },
  characterInventories: {
    data: {
      recent: { items: [item(KINETIC), item(KINETIC), item(KINETIC), item(HELMET)] },
      old: { items: [] },
    },
  },
  characterEquipment: {
    data: { recent: { items: [item(KINETIC), item(HELMET)] }, old: { items: [] } },
  },
} as unknown as DestinyProfileResponse;

describe("personajes y espacio libre", () => {
  const [first, second] = getCharacters(profile, manifest);

  it("ordena del jugado más recientemente al más antiguo y traduce la clase", () => {
    expect(first).toMatchObject({ id: "recent", classType: "titan", light: 2000 });
    expect(second).toMatchObject({ id: "old", classType: "warlock" });
  });

  it("libre = capacidad − inventario − equipado", () => {
    expect(first.free.kinetic).toBe(10 - 3 - 1);
    expect(first.free.helmet).toBe(10 - 1 - 1);
    expect(second.free.kinetic).toBe(10);
  });

  it("una ranura sin dato de capacidad se omite, no se inventa", () => {
    expect(first.free.energy).toBeUndefined();
    expect(first.free.power).toBeUndefined();
  });

  it("nunca devuelve libre negativo", () => {
    const full = {
      ...profile,
      characterInventories: { data: { recent: { items: Array.from({ length: 14 }, () => item(KINETIC)) }, old: { items: [] } } },
    } as unknown as DestinyProfileResponse;
    expect(getCharacters(full, manifest)[0].free.kinetic).toBe(0);
  });

  it("sin personajes o sin inventario, no falla", () => {
    expect(getCharacters({} as DestinyProfileResponse, manifest)).toEqual([]);
    const bare = { characters: { data: { a: { characterId: "a", classType: 1, light: 1, dateLastPlayed: "2026-01-01T00:00:00Z" } } } };
    expect(getCharacters(bare as unknown as DestinyProfileResponse, manifest)[0].free.kinetic).toBe(10);
  });
});
