import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockInventoryActions, type MockItem } from "../bungie/actions/mock";
import { makeItem } from "../classify/testing";
import type { ItemSlot, NormalizedItem } from "../inventory/types";
import { lastRun, readAudit } from "./audit";
import { buildEquipPlan, EquipError } from "./equip-service";
import { executeRounds } from "./execute";
import { planEquipWeapon } from "./plan-equip";
import { planUndo } from "./undo";
import { VAULT } from "./types";

const C1 = "c1";
const C2 = "c2";
const fast = { sleep: async () => {} };

const weapon = (slot: ItemSlot, over: Partial<NormalizedItem> = {}) => makeItem({ slot, type: "Fusil de pulsos", ...over });
const inVault = (slot: ItemSlot, over: Partial<NormalizedItem> = {}) => weapon(slot, { location: "vault", ...over });
const onChar = (slot: ItemSlot, characterId: string, over: Partial<NormalizedItem> = {}) =>
  weapon(slot, { location: "character", characterId, ...over });
const equippedOn = (slot: ItemSlot, characterId: string, over: Partial<NormalizedItem> = {}) =>
  onChar(slot, characterId, { equipped: true, ...over });

const room = { kinetic: 5, energy: 5, power: 5 };
const char = (id = C1, free: Partial<Record<ItemSlot, number>> = room) => ({ id, free });

function mockFor(items: NormalizedItem[], capacity?: Record<string, number>, failures: ConstructorParameters<typeof MockInventoryActions>[0]["failures"] = {}) {
  return new MockInventoryActions({
    items: Object.fromEntries(
      items.map<[string, MockItem]>((i) => [
        i.id,
        { location: i.location === "vault" ? VAULT : i.characterId!, locked: i.locked, equipped: i.equipped, slot: i.slot, exotic: i.tier === "exotic" },
      ]),
    ),
    characterCapacity: capacity,
    failures,
  });
}

let dir: string;
let auditFile: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "equip-test-"));
  auditFile = path.join(dir, "audit.jsonl");
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("planEquipWeapon: los pasos según de dónde sale el arma", () => {
  const kinds = (p: ReturnType<typeof planEquipWeapon>) =>
    p.rounds[0].actions.map((a) => (a.kind === "transfer" ? `${a.from}->${a.to}` : a.kind));

  it("ya en el personaje: solo equipar", () => {
    const w = onChar("energy", C1);
    expect(kinds(planEquipWeapon({ item: w, character: char(), items: [w] }))).toEqual(["equip"]);
  });

  it("en el alijo: traerla y equipar", () => {
    const w = inVault("energy");
    expect(kinds(planEquipWeapon({ item: w, character: char(), items: [w] }))).toEqual([`${VAULT}->${C1}`, "equip"]);
  });

  it("en otro personaje: pasa por el alijo", () => {
    const w = onChar("energy", C2);
    expect(kinds(planEquipWeapon({ item: w, character: char(), items: [w] }))).toEqual([`${C2}->${VAULT}`, `${VAULT}->${C1}`, "equip"]);
  });

  it("recuerda lo que reemplaza, para poder deshacer", () => {
    const current = equippedOn("energy", C1, { name: "Actual" });
    const next = inVault("energy", { name: "Nueva" });
    const equip = planEquipWeapon({ item: next, character: char(), items: [current, next] }).rounds[0].actions.at(-1)!;
    expect(equip).toMatchObject({ kind: "equip", itemId: next.id, previous: { itemId: current.id, name: "Actual" } });
  });

  it("ranura vacía: sin `previous`", () => {
    const w = inVault("power");
    const equip = planEquipWeapon({ item: w, character: char(), items: [w] }).rounds[0].actions.at(-1)!;
    expect(equip.kind === "equip" && equip.previous).toBeFalsy();
  });

  it("dice a qué ranura irá (1.ª, 2.ª o pesada)", () => {
    const names = (slot: ItemSlot) => planEquipWeapon({ item: inVault(slot), character: char(), items: [] }).rounds[0].note;
    expect(names("kinetic")).toMatch(/ranura 1.*cinética/);
    expect(names("energy")).toMatch(/ranura 2.*energía/);
    expect(names("power")).toMatch(/ranura 3.*pesada/);
  });

  describe("lo que lo impide (el plan sale vacío y con motivos)", () => {
    it("ya equipada", () => {
      const w = equippedOn("kinetic", C1);
      const p = planEquipWeapon({ item: w, character: char(), items: [w] });
      expect(p.rounds).toEqual([]);
      expect(p.warnings.join(" ")).toMatch(/ya está equipada/);
    });

    it("otra exótica equipada en otra ranura", () => {
      const a = equippedOn("kinetic", C1, { tier: "exotic", name: "Exótica A" });
      const b = inVault("energy", { tier: "exotic" });
      const p = planEquipWeapon({ item: b, character: char(), items: [a, b] });
      expect(p.rounds).toEqual([]);
      expect(p.warnings.join(" ")).toMatch(/Exótica A/);
    });

    it("sin hueco libre para traerla", () => {
      const w = inVault("power");
      const p = planEquipWeapon({ item: w, character: char(C1, { power: 0 }), items: [w] });
      expect(p.rounds).toEqual([]);
      expect(p.warnings.join(" ")).toMatch(/hueco libre/);
    });
  });
});

describe("buildEquipPlan (con datos recién leídos)", () => {
  const w = inVault("energy");
  const gear = { items: [w], characters: [{ id: C1, classType: "warlock" as const, light: 2000, free: room, activeArtifactPerks: [] }] };

  it("arma o personaje inexistentes: error claro, nunca un plan", () => {
    expect(() => buildEquipPlan(gear, "no-existe", C1, false)).toThrow(EquipError);
    expect(() => buildEquipPlan(gear, "no-existe", C1, false)).toThrow(/ya no está/);
    expect(() => buildEquipPlan(gear, w.id, "no-existe", false)).toThrow(/personaje/);
  });

  it("arma válida: plan con la simulación indicada", () => {
    expect(buildEquipPlan(gear, w.id, C1, true)).toMatchObject({ kind: "equip", dryRun: true });
  });
});

describe("ejecutar contra el mock", () => {
  it("alijo → personaje → equipada, y lo anterior queda desequipado en el personaje", async () => {
    const current = equippedOn("energy", C1, { name: "Actual" });
    const next = inVault("energy", { name: "Nueva" });
    const mock = mockFor([current, next]);
    const plan = planEquipWeapon({ item: next, character: char(), items: [current, next] });

    const out = await executeRounds(plan, plan.rounds, { actions: mock, auditFile, ...fast });

    expect(out.results.every((r) => r.ok)).toBe(true);
    expect(mock.items[next.id]).toMatchObject({ location: C1, equipped: true });
    expect(mock.items[current.id]).toMatchObject({ location: C1, equipped: false });
    expect(mock.calls).toEqual([`transfer:${next.id}:->${C1}`, `equip:${next.id}:${C1}`]);
  });

  it("desde otro personaje", async () => {
    const w = onChar("kinetic", C2);
    const mock = mockFor([w]);
    const plan = planEquipWeapon({ item: w, character: char(), items: [w] });
    await executeRounds(plan, plan.rounds, { actions: mock, auditFile, ...fast });
    expect(mock.items[w.id]).toMatchObject({ location: C1, equipped: true });
  });

  it("simulación: no llama a nada", async () => {
    const w = inVault("kinetic");
    const mock = mockFor([w]);
    const plan = planEquipWeapon({ item: w, character: char(), items: [w], dryRun: true });
    await executeRounds(plan, plan.rounds, { actions: mock, dryRun: true, auditFile, ...fast });
    expect(mock.calls).toEqual([]);
    expect(mock.items[w.id]).toMatchObject({ location: VAULT, equipped: false });
  });

  it("si el juego rechaza equiparla (otra exótica), lo dice y el arma queda en el personaje, no perdida", async () => {
    // El plan se hizo creyendo que se podía; el mock (la 'realidad') discrepa.
    const exoticA = equippedOn("kinetic", C1, { tier: "exotic" });
    const exoticB = inVault("energy", { tier: "exotic" });
    const stale = [onChar("kinetic", C1), exoticB]; // vista desactualizada: sin la exótica equipada
    const mock = mockFor([exoticA, exoticB]);
    const plan = planEquipWeapon({ item: exoticB, character: char(), items: stale });
    expect(plan.rounds).toHaveLength(1);

    const out = await executeRounds(plan, plan.rounds, { actions: mock, auditFile, ...fast });
    const equip = out.results.at(-1)!;
    expect(equip.ok).toBe(false);
    expect(equip.error).toMatchObject({ kind: "cannot_equip", code: 1641 });
    expect(mock.items[exoticB.id]).toMatchObject({ location: C1, equipped: false });
  });

  it("en una actividad: se detiene con un mensaje claro", async () => {
    const w = inVault("kinetic");
    const mock = mockFor([w], undefined, { [`equip:${w.id}`]: { code: 1671 } });
    const plan = planEquipWeapon({ item: w, character: char(), items: [w] });
    const out = await executeRounds(plan, plan.rounds, { actions: mock, auditFile, ...fast });
    expect(out.stopped).toMatchObject({ reason: "fatal", error: { kind: "in_activity" } });
    expect(out.results.at(-1)?.error?.message).toMatch(/actividad/);
  });

  it("un límite de peticiones pasajero se reintenta y termina bien", async () => {
    const w = onChar("kinetic", C1);
    const mock = mockFor([w], undefined, { [`equip:${w.id}`]: { code: 1672, times: 2 } });
    const plan = planEquipWeapon({ item: w, character: char(), items: [w] });
    const out = await executeRounds(plan, plan.rounds, { actions: mock, auditFile, ...fast });
    expect(out.results[0].ok).toBe(true);
    expect(mock.calls.filter((c) => c.startsWith("equip"))).toHaveLength(3);
  });

  it("sin espacio en el personaje al traerla: no se intenta equipar", async () => {
    const w = inVault("kinetic");
    const mock = mockFor([w, onChar("kinetic", C1)], { [C1]: 1 });
    const plan = planEquipWeapon({ item: w, character: char(), items: [w] });
    const out = await executeRounds(plan, plan.rounds, { actions: mock, auditFile, ...fast });
    expect(out.results[0].error?.kind).toBe("no_room");
    // El paso de equipar ni se intenta, y su error explica la causa real (no «ítem no encontrado»).
    expect(mock.calls.some((c) => c.startsWith("equip"))).toBe(false);
    expect(out.results[1]).toMatchObject({ ok: false, skipped: true, error: { kind: "no_room" } });
    expect(out.results[1].error?.message).toMatch(/falló el paso anterior.*espacio/);
    expect(mock.items[w.id].equipped).toBeFalsy();
    // Lo no intentado no cuenta como hecho en el registro.
    expect((await readAudit(auditFile)).map((e) => e.ok)).toEqual([false, false]);
  });
});

describe("deshacer un equipado", () => {
  it("vuelve a equipar lo anterior y devuelve el arma nueva al alijo", async () => {
    const current = equippedOn("energy", C1, { name: "Actual" });
    const next = inVault("energy", { name: "Nueva" });
    const mock = mockFor([current, next]);
    const plan = planEquipWeapon({ item: next, character: char(), items: [current, next] });
    await executeRounds(plan, plan.rounds, { actions: mock, auditFile, ...fast });

    const run = (await lastRun(auditFile))!;
    const undo = planUndo(run.entries);
    expect(undo.rounds[0].actions.map((a) => a.kind)).toEqual(["equip", "transfer"]);

    await executeRounds(undo, undo.rounds, { actions: mock, auditFile, ...fast });
    expect(mock.items[current.id]).toMatchObject({ location: C1, equipped: true });
    expect(mock.items[next.id]).toMatchObject({ location: VAULT, equipped: false });
  });

  it("si la ranura estaba vacía, solo devuelve el arma al alijo", async () => {
    const next = inVault("power");
    const mock = mockFor([next]);
    const plan = planEquipWeapon({ item: next, character: char(), items: [next] });
    await executeRounds(plan, plan.rounds, { actions: mock, auditFile, ...fast });

    const undo = planUndo((await lastRun(auditFile))!.entries);
    expect(undo.rounds[0].actions.map((a) => a.kind)).toEqual(["transfer"]);
  });

  it("la auditoría guarda cada paso con el arma y su motivo", async () => {
    const w = inVault("kinetic", { name: "Mi arma" });
    const mock = mockFor([w]);
    const plan = planEquipWeapon({ item: w, character: char(), items: [w] });
    await executeRounds(plan, plan.rounds, { actions: mock, auditFile, ...fast });
    const log = await readAudit(auditFile);
    expect(log.map((e) => [e.action.kind, e.action.name, e.ok])).toEqual([["transfer", "Mi arma", true], ["equip", "Mi arma", true]]);
    expect(log[1].action.reason).toMatch(/ranura 1/);
  });
});
