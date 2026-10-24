import type { DestinyItemComponent, DestinyProfileResponse } from "bungie-api-ts/destiny2";
import { describe, expect, it } from "vitest";
import type { Manifest } from "../manifest";
import { normalizeItem } from "./normalize";

const KINETIC = 1498876634;
const manifest = {
  items: {
    100: { hash: 100, name: "Rifle de prueba", itemType: 3, itemSubType: 0, itemTypeDisplayName: "Fusil de pulsos", classType: 3, tierType: 5, bucketHash: KINETIC, categoryHashes: [], socketCategories: [], icon: "/i.jpg" },
    101: { hash: 101, name: "Exótica", itemType: 3, itemSubType: 0, itemTypeDisplayName: "Arco de combate", classType: 3, tierType: 6, bucketHash: KINETIC, categoryHashes: [2906646562], socketCategories: [], breakerType: 3 },
    200: { hash: 200, name: "Marco", description: "Efectivo contra [Perforación de escudos] campeones de barrera.", itemType: 19, itemSubType: 0, classType: 3, tierType: 2, categoryHashes: [], socketCategories: [], plugCategory: "intrinsics" },
    201: { hash: 201, name: "Rasgo", description: "Acelera la recarga.", itemType: 19, itemSubType: 0, classType: 3, tierType: 2, categoryHashes: [], socketCategories: [], plugCategory: "frames" },
  },
  stats: {},
  damageTypes: { 3: { hash: 1, name: "Solar" }, 1: { hash: 2, name: "Cinético" } },
  breakers: { 1: { name: "Perforación de escudos" }, 2: { name: "Perturbación" }, 3: { name: "Aturdimiento" } },
} as unknown as Manifest;

const component = (itemHash: number, itemInstanceId = "inst-1"): DestinyItemComponent =>
  ({ itemHash, itemInstanceId, bucketHash: KINETIC, quantity: 1, state: 0 }) as DestinyItemComponent;

function profile(over: { damageType?: number; breakerType?: number; plugs?: number[] } = {}): DestinyProfileResponse {
  return {
    itemComponents: {
      instances: { data: { "inst-1": { damageType: over.damageType ?? 3, breakerType: over.breakerType, primaryStat: { value: 2000 } } } },
      stats: { data: {} },
      sockets: { data: { "inst-1": { sockets: (over.plugs ?? []).map((plugHash) => ({ plugHash, isEnabled: true, isVisible: true })) } } },
    },
  } as unknown as DestinyProfileResponse;
}

describe("normalizeItem: elemento y capacidad contra campeones", () => {
  it("el elemento sale del nombre en el manifest", () => {
    expect(normalizeItem(component(100), profile({ damageType: 3 }), manifest)?.element).toBe("Solar");
    expect(normalizeItem(component(100), profile({ damageType: 1 }), manifest)?.element).toBe("Cinético");
  });

  it("detecta la capacidad por el texto de un rasgo que lleva puesto (aunque sea el intrínseco)", () => {
    const item = normalizeItem(component(100), profile({ plugs: [200, 201] }), manifest)!;
    expect(item.champions).toEqual([{ type: "barrier", via: ["plug"] }]);
  });

  it("un rasgo sin la etiqueta no da capacidad", () => {
    expect(normalizeItem(component(100), profile({ plugs: [201] }), manifest)?.champions).toBeUndefined();
  });

  it("detecta la capacidad de la definición del arma y la informada por la instancia", () => {
    const a = normalizeItem(component(101), profile(), manifest)!;
    expect(a.champions).toEqual([{ type: "unstoppable", via: ["item"] }]);
    const b = normalizeItem(component(100), profile({ breakerType: 2 }), manifest)!;
    expect(b.champions).toEqual([{ type: "overload", via: ["instance"] }]);
  });

  it("une vías y no duplica", () => {
    const item = normalizeItem(component(101), profile({ breakerType: 3 }), manifest)!;
    expect(item.champions).toEqual([{ type: "unstoppable", via: ["item", "instance"] }]);
  });

  it("un plug deshabilitado no cuenta", () => {
    const p = profile({ plugs: [200] });
    (p.itemComponents!.sockets!.data!["inst-1"].sockets[0] as { isEnabled: boolean }).isEnabled = false;
    expect(normalizeItem(component(100), p, manifest)?.champions).toBeUndefined();
  });

  it("los ítems que no son armas no llevan estos campos", () => {
    const m = { ...manifest, items: { ...manifest.items, 300: { ...manifest.items[100], hash: 300, itemType: 2, itemTypeDisplayName: "Casco" } } } as unknown as Manifest;
    const armor = normalizeItem(component(300), profile({ plugs: [200] }), m)!;
    expect(armor.champions).toBeUndefined();
    expect(armor.element).toBeUndefined();
  });

  it("un manifest antiguo (sin breakers ni damageTypes) no rompe", () => {
    const old = { ...manifest, breakers: undefined, damageTypes: undefined } as unknown as Manifest;
    const item = normalizeItem(component(100), profile({ plugs: [200] }), old)!;
    expect(item.champions).toBeUndefined();
    expect(item.element).toBeUndefined();
  });
});
