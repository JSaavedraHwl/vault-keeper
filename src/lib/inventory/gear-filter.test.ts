import { describe, expect, it } from "vitest";
import { makeItem } from "../classify/testing";
import type { ArtifactChampionPerk } from "./champions";
import { equippedBySlot, filterGear, NO_FILTERS, planEquip, type GearContext, type GearFilters } from "./gear-filter";
import type { ItemSlot, NormalizedItem } from "./types";

const perks: ArtifactChampionPerk[] = [
  { hash: 10, name: "Fusil de pulsos de sobrecarga", champion: "overload", weaponType: "Fusil de pulsos" },
  { hash: 11, name: "Fusil de pulsos antibarrera", champion: "barrier", weaponType: "Fusil de pulsos" },
  { hash: 12, name: "Arco imparable", champion: "unstoppable", weaponType: "Arco de combate" },
];

const ctx = (active: number[] = [], characterId = "c1"): GearContext => ({ characterId, perks, activePerks: new Set(active) });
const f = (over: Partial<GearFilters> = {}): GearFilters => ({ ...NO_FILTERS, ...over });

const gun = (slot: ItemSlot, over: Partial<NormalizedItem> = {}) =>
  makeItem({ slot, type: "Fusil de pulsos", location: "vault", ...over });
const ids = (rows: { item: NormalizedItem }[]) => rows.map((r) => r.item.id);

describe("separación por ranura", () => {
  it("reparte las armas en 1.ª (cinética), 2.ª (energía) y pesada", () => {
    const [k, e, p] = [gun("kinetic"), gun("energy"), gun("power")];
    const out = filterGear([k, e, p], ctx(), f());
    expect(ids(out.kinetic)).toEqual([k.id]);
    expect(ids(out.energy)).toEqual([e.id]);
    expect(ids(out.power)).toEqual([p.id]);
  });

  it("ignora lo que no es de las tres ranuras de arma", () => {
    const out = filterGear([gun("helmet"), gun("other")], ctx(), f());
    expect(out.kinetic.length + out.energy.length + out.power.length).toBe(0);
  });
});

describe("filtro por campeón", () => {
  it("una ventaja activa da la capacidad ahora; las demás del mismo tipo son potenciales", () => {
    const pulse = gun("kinetic");
    const now = filterGear([pulse], ctx([10]), f({ champions: ["overload"] })).kinetic;
    expect(now).toHaveLength(1);
    expect(now[0].match).toBe("now");

    const pot = filterGear([pulse], ctx([10]), f({ champions: ["barrier"] })).kinetic;
    expect(pot[0].match).toBe("potential");
    expect(pot[0].status.potential[0].perk).toBe("Fusil de pulsos antibarrera");
  });

  it("sin «incluir potenciales», solo aparecen las que lo hacen ahora", () => {
    const pulse = gun("kinetic");
    expect(filterGear([pulse], ctx([10]), f({ champions: ["barrier"], includePotential: false })).kinetic).toEqual([]);
    expect(filterGear([pulse], ctx([10]), f({ champions: ["overload"], includePotential: false })).kinetic).toHaveLength(1);
  });

  it("varias capacidades pedidas = cualquiera de ellas", () => {
    const arc = gun("energy", { type: "Arco de combate" });
    const out = filterGear([gun("kinetic"), arc], ctx([10, 12]), f({ champions: ["unstoppable", "overload"] }));
    expect(out.kinetic).toHaveLength(1);
    expect(out.energy).toHaveLength(1);
  });

  it("la capacidad propia del arma (de serie, rasgo) cuenta aunque no haya ventajas activas", () => {
    const own = gun("power", { type: "Lanzacohetes", champions: [{ type: "unstoppable", via: ["item"] }] });
    const out = filterGear([own], ctx([]), f({ champions: ["unstoppable"] }));
    expect(out.power[0].match).toBe("now");
  });

  it("depende del personaje elegido", () => {
    const pulse = gun("kinetic");
    const a = filterGear([pulse], ctx([10]), f({ champions: ["overload"], includePotential: false }));
    const b = filterGear([pulse], ctx([]), f({ champions: ["overload"], includePotential: false }));
    expect(a.kinetic).toHaveLength(1);
    expect(b.kinetic).toHaveLength(0);
  });

  it("ordena primero las que lo hacen ahora, luego las potenciales", () => {
    const potential = gun("kinetic", { power: 999 });
    const now = gun("kinetic", { power: 1, champions: [{ type: "overload", via: ["item"] }], type: "Escopeta" });
    const out = filterGear([potential, now], ctx([]), f({ champions: ["overload"] })).kinetic;
    expect(ids(out)).toEqual([now.id, potential.id]);
  });

  it("sin filtro de campeón no se descarta nada", () => {
    const items = [gun("kinetic"), gun("kinetic"), gun("energy")];
    const out = filterGear(items, ctx(), f());
    expect(out.kinetic).toHaveLength(2);
    expect(out.kinetic.every((r) => r.match === "none")).toBe(true);
  });
});

describe("otros filtros", () => {
  const items = [
    gun("kinetic", { name: "Águila Solar", element: "Solar", type: "Fusil de pulsos" }),
    gun("kinetic", { name: "Espada Vacía", element: "Vacío", type: "Espada" }),
    gun("energy", { name: "Arco", element: "Arco", type: "Arco de combate", location: "character", characterId: "c1" }),
    gun("power", { name: "Lanza", element: "Cinético", type: "Lanzacohetes", location: "character", characterId: "c2" }),
  ];
  const count = (o: Partial<GearFilters>) => Object.values(filterGear(items, ctx(), f(o))).flat().length;

  it("por tipo y por elemento", () => {
    expect(count({ type: "Espada" })).toBe(1);
    expect(count({ element: "Solar" })).toBe(1);
    expect(count({ type: "Espada", element: "Solar" })).toBe(0);
  });

  it("por nombre, sin importar tildes ni mayúsculas", () => {
    expect(count({ query: "aguila" })).toBe(1);
    expect(count({ query: "  VACIA " })).toBe(1);
    expect(count({ query: "zzz" })).toBe(0);
  });

  it("por ubicación: alijo, personaje elegido u otros personajes", () => {
    expect(count({ where: "vault" })).toBe(2);
    expect(count({ where: "selected" })).toBe(1);
    expect(count({ where: "others" })).toBe(1);
    expect(count({ where: "all" })).toBe(4);
  });
});

describe("equipar: ranura, reemplazo y conflictos", () => {
  const char = (free: Partial<Record<ItemSlot, number>> = { kinetic: 3, energy: 3, power: 3 }) => ({ id: "c1", free });
  const equipped = (slot: ItemSlot, over: Partial<NormalizedItem> = {}) =>
    gun(slot, { location: "character", characterId: "c1", equipped: true, ...over });

  it("dice a qué ranura irá y qué reemplaza", () => {
    const current = equipped("energy", { name: "Actual" });
    const next = gun("energy", { name: "Nueva" });
    const plan = planEquip(next, char(), [current, next]);
    expect(plan.slot).toBe("energy");
    expect(plan.replaces?.name).toBe("Actual");
    expect(plan.canEquip).toBe(true);
  });

  it("si la ranura está vacía no reemplaza nada", () => {
    const plan = planEquip(gun("power"), char(), []);
    expect(plan.replaces).toBeUndefined();
  });

  it("indica el origen: personaje, alijo u otro personaje", () => {
    expect(planEquip(gun("kinetic", { location: "character", characterId: "c1" }), char(), []).from).toBe("character");
    expect(planEquip(gun("kinetic"), char(), []).from).toBe("vault");
    expect(planEquip(gun("kinetic", { location: "character", characterId: "c2" }), char(), []).from).toBe("other-character");
    expect(planEquip(gun("kinetic"), char(), []).problems.join(" ")).toMatch(/alijo/);
  });

  it("ya equipada: no hay nada que hacer", () => {
    const w = equipped("kinetic");
    const plan = planEquip(w, char(), [w]);
    expect(plan.alreadyEquipped).toBe(true);
    expect(plan.canEquip).toBe(false);
    expect(plan.replaces).toBeUndefined();
  });

  it("dos exóticas de arma a la vez no están permitidas", () => {
    const exoticEquipped = equipped("kinetic", { tier: "exotic", name: "Exótica A" });
    const exoticNew = gun("energy", { tier: "exotic", name: "Exótica B" });
    const plan = planEquip(exoticNew, char(), [exoticEquipped, exoticNew]);
    expect(plan.canEquip).toBe(false);
    expect(plan.exoticConflict?.name).toBe("Exótica A");
    expect(plan.problems.join(" ")).toMatch(/Exótica A/);
  });

  it("reemplazar la exótica de la MISMA ranura sí está permitido", () => {
    const exoticEquipped = equipped("kinetic", { tier: "exotic" });
    const exoticNew = gun("kinetic", { tier: "exotic" });
    const plan = planEquip(exoticNew, char(), [exoticEquipped, exoticNew]);
    expect(plan.exoticConflict).toBeUndefined();
    expect(plan.canEquip).toBe(true);
  });

  it("una legendaria nunca choca con una exótica equipada", () => {
    const exoticEquipped = equipped("kinetic", { tier: "exotic" });
    expect(planEquip(gun("energy"), char(), [exoticEquipped]).canEquip).toBe(true);
  });

  it("traerla del alijo sin hueco libre en la ranura lo impide", () => {
    const plan = planEquip(gun("power"), char({ power: 0, kinetic: 5 }), []);
    expect(plan.canEquip).toBe(false);
    expect(plan.problems.join(" ")).toMatch(/hueco libre/);
    // una ranura sin dato de capacidad cuenta como sin espacio, nunca como infinita
    expect(planEquip(gun("power"), char({}), []).canEquip).toBe(false);
  });

  it("si ya está en el personaje no necesita hueco", () => {
    const w = gun("power", { location: "character", characterId: "c1" });
    expect(planEquip(w, char({ power: 0 }), [w]).canEquip).toBe(true);
  });

  it("equippedBySlot solo mira lo equipado del personaje pedido", () => {
    const [mine, other, inInv] = [equipped("kinetic"), { ...equipped("energy"), characterId: "c2" }, gun("power", { location: "character", characterId: "c1" })];
    const out = equippedBySlot([mine, other, inInv], "c1");
    expect(out.kinetic?.id).toBe(mine.id);
    expect(out.energy).toBeUndefined();
    expect(out.power).toBeUndefined();
  });
});
