import type { DestinyProfileResponse } from "bungie-api-ts/destiny2";
import { describe, expect, it } from "vitest";
import type { Manifest } from "../manifest";
import { buildGearData, weaponTypesOf } from "./gear";

const KINETIC = 1498876634;
const ENERGY = 2465295065;
const POWER = 953998645;
const HELMET = 3448274439;
const VAULT = 138197802;
const POSTMASTER = 215593132;

const weapon = (hash: number, name: string, type: string, bucket: number, tier = 5) => ({
  hash, name, itemType: 3, itemSubType: 0, itemTypeDisplayName: type, classType: 3, tierType: tier,
  bucketHash: bucket, categoryHashes: [], socketCategories: [],
});

const manifest = {
  items: {
    1: weapon(1, "Pulsos A", "Fusil de pulsos", KINETIC),
    2: weapon(2, "Arco B", "Arco de combate", ENERGY),
    3: weapon(3, "Lanza C", "Lanzacohetes", POWER),
    4: weapon(4, "Común D", "Pistola", KINETIC, 3), // no cuenta para los tipos (no legendaria)
    5: { hash: 5, name: "Casco", itemType: 2, itemSubType: 0, classType: 0, tierType: 5, bucketHash: HELMET, categoryHashes: [], socketCategories: [] },
    50: { hash: 50, name: "Fusil de pulsos de sobrecarga", itemType: 19, itemSubType: 0, classType: 3, tierType: 5, categoryHashes: [], socketCategories: [] },
    51: { hash: 51, name: "Arco imparable", itemType: 19, itemSubType: 0, classType: 3, tierType: 5, categoryHashes: [], socketCategories: [] },
    52: { hash: 52, name: "Ojiva anticampeones", itemType: 19, itemSubType: 0, classType: 3, tierType: 5, categoryHashes: [], socketCategories: [] },
    53: { hash: 53, name: "Sifón elemental", itemType: 19, itemSubType: 0, classType: 3, tierType: 5, categoryHashes: [], socketCategories: [] },
  },
  stats: {},
  buckets: {},
  damageTypes: {},
  breakers: {},
  artifact: { hash: 9, name: "Artefacto de prueba", perkHashes: [50, 51, 52, 53] },
} as unknown as Manifest;

const comp = (itemHash: number, bucketHash: number, id: string) => ({ itemHash, bucketHash, itemInstanceId: id, quantity: 1, state: 0 });

const profile = {
  profileInventory: { data: { items: [comp(1, VAULT, "v1"), comp(5, VAULT, "v2"), comp(3, KINETIC, "ghost")] } },
  characterInventories: {
    data: {
      c1: { items: [comp(2, ENERGY, "i1"), comp(1, POSTMASTER, "mail"), comp(5, HELMET, "h1")] },
      c2: { items: [] },
    },
  },
  characterEquipment: { data: { c1: { items: [comp(3, POWER, "e1"), comp(5, HELMET, "e2")] }, c2: { items: [] } } },
  characters: {
    data: {
      c1: { characterId: "c1", classType: 2, light: 2000, dateLastPlayed: "2026-10-01T00:00:00Z" },
      c2: { characterId: "c2", classType: 0, light: 1900, dateLastPlayed: "2026-01-01T00:00:00Z" },
    },
  },
  characterProgressions: {
    data: {
      c1: { seasonalArtifact: { tiers: [{ items: [{ itemHash: 50, isActive: true }, { itemHash: 51, isActive: false }] }, { items: [{ itemHash: 53, isActive: true }] }] } },
      c2: { seasonalArtifact: { tiers: [{ items: [{ itemHash: 51, isActive: true }] }] } },
    },
  },
  itemComponents: { instances: { data: {} }, stats: { data: {} }, sockets: { data: {} } },
} as unknown as DestinyProfileResponse;

describe("buildGearData", () => {
  const data = buildGearData(profile, manifest);
  const byId = Object.fromEntries(data.items.map((i) => [i.id, i]));

  it("junta las armas del alijo, de los inventarios y las equipadas, y nada más", () => {
    expect(Object.keys(byId).sort()).toEqual(["e1", "i1", "v1"]);
  });

  it("marca dónde está cada una", () => {
    expect(byId.v1).toMatchObject({ location: "vault", equipped: false });
    expect(byId.i1).toMatchObject({ location: "character", characterId: "c1", equipped: false, slot: "energy" });
    expect(byId.e1).toMatchObject({ location: "character", characterId: "c1", equipped: true, slot: "power" });
  });

  it("excluye el correo y las armaduras", () => {
    expect(byId.mail).toBeUndefined();
    expect(byId.v2).toBeUndefined();
    expect(byId.h1).toBeUndefined();
  });

  it("lee las ventajas de artefacto activas de cada personaje", () => {
    const c1 = data.characters.find((c) => c.id === "c1")!;
    const c2 = data.characters.find((c) => c.id === "c2")!;
    expect(c1.activeArtifactPerks.sort()).toEqual([50, 53]);
    expect(c2.activeArtifactPerks).toEqual([51]);
  });

  it("interpreta las ventajas de campeón y reporta las que no", () => {
    expect(data.artifact.name).toBe("Artefacto de prueba");
    expect(data.artifact.perks.map((p) => [p.name, p.weaponType])).toEqual([
      ["Fusil de pulsos de sobrecarga", "Fusil de pulsos"],
      ["Arco imparable", "Arco de combate"],
    ]);
    expect(data.artifact.unparsed).toEqual(["Ojiva anticampeones"]);
  });

  it("sin datos de progresión o de artefacto, no falla", () => {
    const bare = buildGearData(
      { ...profile, characterProgressions: undefined } as unknown as DestinyProfileResponse,
      { ...manifest, artifact: undefined } as unknown as Manifest,
    );
    expect(bare.characters.every((c) => c.activeArtifactPerks.length === 0)).toBe(true);
    expect(bare.artifact.perks).toEqual([]);
  });
});

describe("weaponTypesOf", () => {
  it("solo tipos de armas legendarias o exóticas de las tres ranuras, ordenados", () => {
    expect(weaponTypesOf(manifest)).toEqual(["Arco de combate", "Fusil de pulsos", "Lanzacohetes"]);
  });
});
