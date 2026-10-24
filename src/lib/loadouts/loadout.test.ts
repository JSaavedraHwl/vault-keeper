import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockInventoryActions, type MockItem } from "../bungie/actions/mock";
import { makeItem } from "../classify/testing";
import { lastRun } from "../actions/audit";
import { executeRounds } from "../actions/execute";
import { buildLoadoutPlan, LoadoutError } from "../actions/loadout-service";
import { planEquipLoadout } from "../actions/plan-loadout";
import { planUndo } from "../actions/undo";
import { VAULT, type PlannedAction } from "../actions/types";
import type { CharacterInfo, ItemSlot, NormalizedItem } from "../inventory/types";
import { analyzeLoadout, type SlotStatus } from "./analyze";
import { EQUIP_SLOTS, isWeaponSlot, type EquipSlot, type Loadout, type LoadoutClass } from "./types";

const ME = "me";
const OTHER = "other";
const fast = { sleep: async () => {} };
const allFree: CharacterInfo["free"] = Object.fromEntries(EQUIP_SLOTS.map((s) => [s, 5]));
const character = (over: Partial<CharacterInfo> = {}): CharacterInfo => ({ id: ME, classType: "warlock", light: 2000, free: allFree, ...over });

type Where = "vault" | "inv" | "equipped" | "other";
function piece(slot: EquipSlot, where: Where, over: Partial<NormalizedItem> = {}): NormalizedItem {
  const weapon = isWeaponSlot(slot);
  return makeItem({
    slot: slot as ItemSlot,
    kind: weapon ? "weapon" : "armor",
    type: weapon ? "Fusil de pulsos" : "Casco",
    classType: weapon ? null : "warlock",
    location: where === "vault" ? "vault" : "character",
    ...(where !== "vault" && { characterId: where === "other" ? OTHER : ME }),
    equipped: where === "equipped",
    ...over,
  });
}

const loadoutOf = (items: Partial<Record<EquipSlot, NormalizedItem>>, classType: LoadoutClass = "warlock"): Loadout => ({
  id: "lo", name: "Prueba", classType, createdAt: "x", updatedAt: "x",
  items: Object.fromEntries(
    Object.entries(items).map(([slot, i]) => [slot, { id: i!.id, hash: i!.hash, name: i!.name, icon: null, tier: i!.tier }]),
  ),
});

const statuses = (a: ReturnType<typeof analyzeLoadout>) => Object.fromEntries(a.slots.map((s) => [s.slot, s.status])) as Record<EquipSlot, SlotStatus>;

describe("analizar un loadout", () => {
  it("clasifica cada ranura según dónde está la pieza", () => {
    const equipped = piece("kinetic", "equipped");
    const inv = piece("energy", "inv");
    const vault = piece("power", "vault");
    const other = piece("helmet", "other");
    const gone = piece("arms", "vault");
    const wrong = piece("chest", "vault", { classType: "titan" });
    const known = [equipped, inv, vault, other, wrong];

    const a = analyzeLoadout(loadoutOf({ kinetic: equipped, energy: inv, power: vault, helmet: other, arms: gone, chest: wrong }), character(), known);

    expect(statuses(a)).toEqual({
      kinetic: "equipped", energy: "in-inventory", power: "from-vault", helmet: "from-other",
      arms: "missing", chest: "wrong-class", legs: "empty", classItem: "empty",
    });
    expect(a.slots.map((s) => s.slot)).toEqual([...EQUIP_SLOTS]);
    expect(a.toDo).toBe(4 - 1); // energía, pesada y casco (la cinética ya está puesta)
    expect(a.warnings.join(" ")).toMatch(/ya no existe/);
    expect(a.warnings.join(" ")).toMatch(/otra clase/);
    expect(a.blockers).toEqual([]);
    expect(a.canEquip).toBe(true);
  });

  it("indica qué reemplaza en cada ranura", () => {
    const current = piece("helmet", "equipped", { name: "Casco viejo" });
    const next = piece("helmet", "vault");
    const a = analyzeLoadout(loadoutOf({ helmet: next }), character(), [current, next]);
    expect(a.slots.find((s) => s.slot === "helmet")?.replaces?.name).toBe("Casco viejo");
  });

  it("un loadout de otra clase bloquea", () => {
    const w = piece("kinetic", "vault");
    const a = analyzeLoadout(loadoutOf({ kinetic: w }, "titan"), character(), [w]);
    expect(a.canEquip).toBe(false);
    expect(a.blockers.join(" ")).toMatch(/Titán.*Hechicero/);
  });

  it("sin hueco libre para traer una pieza: bloquea (una ranura sin dato cuenta como sin hueco)", () => {
    const w = piece("power", "vault");
    expect(analyzeLoadout(loadoutOf({ power: w }), character({ free: { power: 0 } }), [w]).blockers.join(" ")).toMatch(/hueco libre/);
    expect(analyzeLoadout(loadoutOf({ power: w }), character({ free: {} }), [w]).canEquip).toBe(false);
  });

  it("una pieza que ya está en el inventario del personaje no necesita hueco", () => {
    const w = piece("power", "inv");
    expect(analyzeLoadout(loadoutOf({ power: w }), character({ free: {} }), [w]).canEquip).toBe(true);
  });

  it("nada que hacer: avisa y no se puede equipar", () => {
    const w = piece("kinetic", "equipped");
    const a = analyzeLoadout(loadoutOf({ kinetic: w }), character(), [w]);
    expect(a.toDo).toBe(0);
    expect(a.canEquip).toBe(false);
    expect(a.warnings.join(" ")).toMatch(/nada que equipar/);
  });

  describe("exóticas", () => {
    it("traer una exótica de arma mientras otra exótica sigue equipada en una ranura que el loadout no toca bloquea", () => {
      const keepExotic = piece("kinetic", "equipped", { tier: "exotic", name: "Exótica A" });
      const newExotic = piece("energy", "vault", { tier: "exotic", name: "Exótica B" });
      const a = analyzeLoadout(loadoutOf({ energy: newExotic }), character(), [keepExotic, newExotic]);
      expect(a.canEquip).toBe(false);
      expect(a.blockers.join(" ")).toMatch(/arma exótica.*Exótica A.*Exótica B/);
    });

    it("si el loadout reemplaza esa exótica por una no exótica, ya no hay conflicto", () => {
      const oldExotic = piece("kinetic", "equipped", { tier: "exotic" });
      const legendary = piece("kinetic", "vault");
      const newExotic = piece("energy", "vault", { tier: "exotic" });
      const a = analyzeLoadout(loadoutOf({ kinetic: legendary, energy: newExotic }), character(), [oldExotic, legendary, newExotic]);
      expect(a.blockers).toEqual([]);
      expect(a.canEquip).toBe(true);
    });

    it("cambiar una exótica por otra en la MISMA ranura es válido", () => {
      const oldExotic = piece("kinetic", "equipped", { tier: "exotic" });
      const newExotic = piece("kinetic", "vault", { tier: "exotic" });
      expect(analyzeLoadout(loadoutOf({ kinetic: newExotic }), character(), [oldExotic, newExotic]).blockers).toEqual([]);
    });

    it("armas y armaduras cuentan por separado: una exótica de cada tipo conviven", () => {
      const w = piece("kinetic", "vault", { tier: "exotic" });
      const h = piece("helmet", "vault", { tier: "exotic" });
      expect(analyzeLoadout(loadoutOf({ kinetic: w, helmet: h }), character(), [w, h]).blockers).toEqual([]);
    });

    it("dos exóticas de armadura bloquean aunque una ya esté puesta", () => {
      const worn = piece("legs", "equipped", { tier: "exotic", name: "Botas exóticas" });
      const next = piece("helmet", "vault", { tier: "exotic", name: "Casco exótico" });
      const a = analyzeLoadout(loadoutOf({ helmet: next }), character(), [worn, next]);
      expect(a.blockers.join(" ")).toMatch(/armadura exótica/);
    });

    it("una pieza omitida (ya no existe) no cuenta como exótica final: queda lo que ya llevaba", () => {
      const worn = piece("kinetic", "equipped", { tier: "exotic" });
      const ghost = piece("kinetic", "vault", { tier: "exotic" }); // el loadout la quiere, pero ya no se conoce
      const real = piece("energy", "vault", { tier: "exotic" });
      const a = analyzeLoadout(loadoutOf({ kinetic: ghost, energy: real }), character(), [worn, real]);
      expect(a.blockers.join(" ")).toMatch(/arma exótica/); // la vieja sigue puesta + la nueva
    });
  });

  it("no modifica sus entradas", () => {
    const w = piece("kinetic", "vault");
    const lo = loadoutOf({ kinetic: w });
    const snapshot = JSON.stringify([lo, w]);
    analyzeLoadout(lo, character(), [w]);
    expect(JSON.stringify([lo, w])).toBe(snapshot);
  });
});

describe("plan para equipar un loadout", () => {
  const kinds = (actions: PlannedAction[]) =>
    actions.map((a) => (a.kind === "transfer" ? `${a.from}->${a.to}:${a.name}` : `${a.kind}:${a.name}`));

  it("pieza ya en el inventario: solo equipar; del alijo: traer y equipar; de otro personaje: pasa por el alijo", () => {
    const inv = piece("kinetic", "inv", { name: "A" });
    const vault = piece("energy", "vault", { name: "B" });
    const other = piece("helmet", "other", { name: "C" });
    const plan = planEquipLoadout({ loadout: loadoutOf({ kinetic: inv, energy: vault, helmet: other }), character: character(), items: [inv, vault, other] });

    expect(plan.rounds).toHaveLength(1);
    expect(kinds(plan.rounds[0].actions)).toEqual([
      "equip:A",
      `${VAULT}->${ME}:B`, "equip:B",
      `${OTHER}->${VAULT}:C`, `${VAULT}->${ME}:C`, "equip:C",
    ]);
  });

  it("cada paso depende del anterior de la misma pieza (si no se puede traer, no se intenta equipar)", () => {
    const other = piece("helmet", "other");
    const actions = planEquipLoadout({ loadout: loadoutOf({ helmet: other }), character: character(), items: [other] }).rounds[0].actions;
    expect(actions[0].requires).toBeUndefined();
    expect(actions[1].requires).toEqual([actions[0].id]);
    expect(actions[2].requires).toEqual([actions[1].id]);
  });

  it("las exóticas se equipan al FINAL, para que la exótica reemplazada ya se haya quitado", () => {
    const oldExotic = piece("kinetic", "equipped", { tier: "exotic", name: "Vieja" });
    const legendary = piece("kinetic", "vault", { name: "Legendaria" });
    const newExotic = piece("energy", "vault", { tier: "exotic", name: "Nueva" });
    const plan = planEquipLoadout({
      // la exótica va en una ranura que se procesaría ANTES (energía < cinética en nada: se fuerza con el orden de EQUIP_SLOTS)
      loadout: loadoutOf({ kinetic: legendary, energy: newExotic }),
      character: character(),
      items: [oldExotic, legendary, newExotic],
    });
    const equips = plan.rounds[0].actions.filter((a) => a.kind === "equip").map((a) => a.name);
    expect(equips).toEqual(["Legendaria", "Nueva"]);
  });

  it("el orden de las exóticas importa de verdad: la exótica nueva va en una ranura ANTERIOR a la que libera la vieja", async () => {
    // La exótica vieja está en ENERGÍA y la nueva va en CINÉTICA (que en el orden natural se procesa antes).
    const oldExotic = piece("energy", "equipped", { tier: "exotic", name: "Vieja" });
    const legendary = piece("energy", "vault", { name: "Legendaria" });
    const newExotic = piece("kinetic", "vault", { tier: "exotic", name: "Nueva" });
    const items = [oldExotic, legendary, newExotic];
    const plan = planEquipLoadout({ loadout: loadoutOf({ kinetic: newExotic, energy: legendary }), character: character(), items });

    // En el plan, la legendaria (que libera a la vieja) se equipa antes que la exótica nueva.
    expect(plan.rounds[0].actions.filter((a) => a.kind === "equip").map((a) => a.name)).toEqual(["Legendaria", "Nueva"]);

    // Y contra el «juego» (el mock con la regla real) todo sale bien.
    const dir = await mkdtemp(path.join(tmpdir(), "loadout-order-"));
    try {
      const mock = new MockInventoryActions({
        items: Object.fromEntries(
          items.map<[string, MockItem]>((i) => [i.id, { location: i.location === "vault" ? VAULT : i.characterId!, locked: false, equipped: i.equipped, slot: i.slot, exotic: i.tier === "exotic" }]),
        ),
      });
      const out = await executeRounds(plan, plan.rounds, { actions: mock, auditFile: path.join(dir, "a.jsonl"), ...fast });
      expect(out.results.every((r) => r.ok)).toBe(true);
      expect(mock.items[newExotic.id].equipped).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("lo mismo con armaduras: la exótica nueva (casco) antes que la que se libera (botas)", () => {
    const oldExotic = piece("legs", "equipped", { tier: "exotic", name: "Botas viejas" });
    const plain = piece("legs", "vault", { name: "Botas normales" });
    const newExotic = piece("helmet", "vault", { tier: "exotic", name: "Casco exótico" });
    const plan = planEquipLoadout({ loadout: loadoutOf({ helmet: newExotic, legs: plain }), character: character(), items: [oldExotic, plain, newExotic] });
    expect(plan.rounds[0].actions.filter((a) => a.kind === "equip").map((a) => a.name)).toEqual(["Botas normales", "Casco exótico"]);
  });

  it("recuerda lo que reemplaza en cada ranura (para deshacer)", () => {
    const current = piece("chest", "equipped", { name: "Peto actual" });
    const next = piece("chest", "vault");
    const equip = planEquipLoadout({ loadout: loadoutOf({ chest: next }), character: character(), items: [current, next] }).rounds[0].actions.at(-1)!;
    expect(equip).toMatchObject({ kind: "equip", previous: { name: "Peto actual" } });
  });

  it("los ids de las acciones son únicos", () => {
    const items = EQUIP_SLOTS.map((s) => piece(s, "vault"));
    const plan = planEquipLoadout({
      loadout: loadoutOf(Object.fromEntries(EQUIP_SLOTS.map((s, i) => [s, items[i]]))),
      character: character(),
      items,
    });
    const ids = plan.rounds[0].actions.map((a) => a.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toHaveLength(16); // 8 piezas × (traer + equipar)
  });

  it("si hay un bloqueo, el plan sale sin rondas y con los motivos", () => {
    const w = piece("kinetic", "vault");
    const plan = planEquipLoadout({ loadout: loadoutOf({ kinetic: w }, "titan"), character: character(), items: [w] });
    expect(plan.rounds).toEqual([]);
    expect(plan.warnings.join(" ")).toMatch(/Titán/);
  });

  it("las piezas omitidas se listan en `skipped` y el resto se equipa", () => {
    const ok = piece("kinetic", "vault");
    const gone = piece("energy", "vault");
    const plan = planEquipLoadout({ loadout: loadoutOf({ kinetic: ok, energy: gone }), character: character(), items: [ok] });
    expect(plan.rounds[0].actions.some((a) => a.name === ok.name)).toBe(true);
    expect(plan.skipped.map((s) => s.name)).toEqual([gone.name]);
  });

  it("es serializable", () => {
    const w = piece("kinetic", "vault");
    const plan = planEquipLoadout({ loadout: loadoutOf({ kinetic: w }), character: character(), items: [w] });
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
  });
});

describe("buildLoadoutPlan (con datos recién leídos)", () => {
  const w = piece("kinetic", "vault");
  const gear = { items: [w], characters: [{ ...character(), activeArtifactPerks: [] }] };

  it("loadout o personaje inexistentes: error claro, nunca un plan", () => {
    expect(() => buildLoadoutPlan(gear, undefined, ME, false)).toThrow(LoadoutError);
    expect(() => buildLoadoutPlan(gear, undefined, ME, false)).toThrow(/ya no existe/);
    expect(() => buildLoadoutPlan(gear, loadoutOf({ kinetic: w }), "nadie", false)).toThrow(/personaje/);
  });

  it("con datos válidos, un plan con la simulación indicada", () => {
    const plan = buildLoadoutPlan(gear, loadoutOf({ kinetic: w }), ME, true);
    expect(plan).toMatchObject({ kind: "equip", dryRun: true });
    expect(plan.rounds).toHaveLength(1);
  });

  it("una pieza que desapareció desde que se guardó el loadout se omite en vez de fallar", () => {
    const gone = piece("energy", "vault");
    const plan = buildLoadoutPlan(gear, loadoutOf({ kinetic: w, energy: gone }), ME, false);
    expect(plan.rounds[0].actions.every((a) => a.name === w.name)).toBe(true);
    expect(plan.skipped).toHaveLength(1);
  });
});

describe("ejecutar un loadout contra el mock", () => {
  let dir: string;
  let auditFile: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "loadout-exec-"));
    auditFile = path.join(dir, "audit.jsonl");
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  const mockFor = (items: NormalizedItem[], failures: ConstructorParameters<typeof MockInventoryActions>[0]["failures"] = {}) =>
    new MockInventoryActions({
      items: Object.fromEntries(
        items.map<[string, MockItem]>((i) => [
          i.id,
          { location: i.location === "vault" ? VAULT : i.characterId!, locked: i.locked, equipped: i.equipped, slot: i.slot, exotic: i.tier === "exotic" },
        ]),
      ),
      failures,
    });

  it("equipa un loadout de 8 piezas desde el alijo, otros personajes y el inventario", async () => {
    const items = EQUIP_SLOTS.map((s, i) => piece(s, (["vault", "other", "inv"] as const)[i % 3]));
    const lo = loadoutOf(Object.fromEntries(EQUIP_SLOTS.map((s, i) => [s, items[i]])));
    const mock = mockFor(items);
    const plan = planEquipLoadout({ loadout: lo, character: character(), items });

    const out = await executeRounds(plan, plan.rounds, { actions: mock, auditFile, ...fast });

    expect(out.results.every((r) => r.ok)).toBe(true);
    for (const i of items) expect(mock.items[i.id]).toMatchObject({ location: ME, equipped: true });
  });

  it("cambiar una exótica por otra funciona gracias al orden (la vieja se quita antes)", async () => {
    const oldExotic = piece("kinetic", "equipped", { tier: "exotic", name: "Vieja" });
    const legendary = piece("kinetic", "vault", { name: "Legendaria" });
    const newExotic = piece("energy", "vault", { tier: "exotic", name: "Nueva" });
    const items = [oldExotic, legendary, newExotic];
    const mock = mockFor(items);
    const plan = planEquipLoadout({ loadout: loadoutOf({ kinetic: legendary, energy: newExotic }), character: character(), items });

    const out = await executeRounds(plan, plan.rounds, { actions: mock, auditFile, ...fast });

    expect(out.results.every((r) => r.ok)).toBe(true);
    expect(mock.items[newExotic.id]).toMatchObject({ equipped: true });
    expect(mock.items[oldExotic.id]).toMatchObject({ equipped: false });
  });

  it("EN EL ORDEN INGENUO (exótica primero) el juego lo rechazaría: por eso el orden importa", async () => {
    const oldExotic = piece("kinetic", "equipped", { tier: "exotic" });
    const legendary = piece("kinetic", "vault");
    const newExotic = piece("energy", "inv", { tier: "exotic" });
    const items = [oldExotic, legendary, newExotic];
    const mock = mockFor(items);
    const plan = planEquipLoadout({ loadout: loadoutOf({ kinetic: legendary, energy: newExotic }), character: character(), items });

    // Se invierte a propósito el orden de los pasos de equipar.
    const reversed = [...plan.rounds[0].actions].reverse().filter((a) => a.kind === "equip");
    const bad = await executeRounds(plan, [{ index: 0, note: "", actions: reversed.map((a) => ({ ...a, requires: undefined }) as PlannedAction) }], { actions: mock, auditFile, ...fast });
    expect(bad.results[0].error).toMatchObject({ kind: "cannot_equip", code: 1641 });
  });

  it("si una pieza falla al traerla, su equipar se salta y el resto del loadout se equipa", async () => {
    const a = piece("kinetic", "vault", { name: "A" });
    const b = piece("energy", "vault", { name: "B" });
    const items = [a, b];
    const mock = mockFor(items, { [`transfer:${a.id}`]: { code: 1642 } });
    const plan = planEquipLoadout({ loadout: loadoutOf({ kinetic: a, energy: b }), character: character(), items });

    const out = await executeRounds(plan, plan.rounds, { actions: mock, auditFile, ...fast });

    expect(mock.items[b.id]).toMatchObject({ location: ME, equipped: true });
    expect(mock.items[a.id].equipped).toBeFalsy();
    const skipped = out.results.find((r) => r.skipped);
    expect(skipped?.error?.message).toMatch(/falló el paso anterior/);
  });

  it("en una actividad se detiene con un mensaje claro", async () => {
    const a = piece("kinetic", "inv");
    const mock = mockFor([a], { [`equip:${a.id}`]: { code: 1671 } });
    const plan = planEquipLoadout({ loadout: loadoutOf({ kinetic: a }), character: character(), items: [a] });
    const out = await executeRounds(plan, plan.rounds, { actions: mock, auditFile, ...fast });
    expect(out.stopped).toMatchObject({ reason: "fatal", error: { kind: "in_activity" } });
  });

  it("deshacer devuelve lo que llevabas y las piezas nuevas al alijo", async () => {
    const before = piece("helmet", "equipped", { name: "Casco anterior" });
    const next = piece("helmet", "vault", { name: "Casco nuevo" });
    const mock = mockFor([before, next]);
    const plan = planEquipLoadout({ loadout: loadoutOf({ helmet: next }), character: character(), items: [before, next] });
    await executeRounds(plan, plan.rounds, { actions: mock, auditFile, ...fast });
    expect(mock.items[next.id]).toMatchObject({ location: ME, equipped: true });

    const undo = planUndo((await lastRun(auditFile))!.entries);
    await executeRounds(undo, undo.rounds, { actions: mock, auditFile, ...fast });

    expect(mock.items[before.id]).toMatchObject({ location: ME, equipped: true });
    expect(mock.items[next.id]).toMatchObject({ location: VAULT, equipped: false });
  });

  it("simulación: no cambia nada", async () => {
    const w = piece("kinetic", "vault");
    const mock = mockFor([w]);
    const plan = planEquipLoadout({ loadout: loadoutOf({ kinetic: w }), character: character(), items: [w], dryRun: true });
    await executeRounds(plan, plan.rounds, { actions: mock, dryRun: true, auditFile, ...fast });
    expect(mock.calls).toEqual([]);
    expect(mock.items[w.id]).toMatchObject({ location: VAULT });
  });
});
