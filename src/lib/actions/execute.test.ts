import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockInventoryActions, type MockItem } from "../bungie/actions/mock";
import { makeItem } from "../classify/testing";
import type { ClassificationResult } from "../classify/types";
import { appendAudit, lastRun, readAudit } from "./audit";
import { executeRound, executeRounds } from "./execute";
import { planLockKeepers, planMoveJunk } from "./plan";
import { planUndo } from "./undo";
import { VAULT } from "./types";

const CHAR = "char-1";
const fast = { sleep: async () => {} };

const verdict = (itemId: string, v: ClassificationResult["verdict"]): ClassificationResult => ({
  itemId,
  verdict: v,
  reason: "t",
  confidence: 1,
  source: "rule",
});

let dir: string;
let auditFile: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "actions-test-"));
  auditFile = path.join(dir, "audit.jsonl");
});
afterEach(() => rm(dir, { recursive: true, force: true }));

describe("ejecución de rondas con el mock", () => {
  it("mover la basura cambia el estado y deja el registro de auditoría", async () => {
    const items = [makeItem({ slot: "kinetic" }), makeItem({ slot: "kinetic" })];
    const mock = new MockInventoryActions({ items: Object.fromEntries(items.map((i) => [i.id, { location: VAULT, locked: false }])) });
    const plan = planMoveJunk({ items, results: items.map((i) => verdict(i.id, "junk")), characterId: CHAR, free: { kinetic: 9 } });

    const out = await executeRound(plan, plan.rounds[0], { actions: mock, auditFile, ...fast });

    expect(out.results.every((r) => r.ok)).toBe(true);
    expect(items.every((i) => mock.items[i.id].location === CHAR)).toBe(true);
    const log = await readAudit(auditFile);
    expect(log).toHaveLength(2);
    expect(log.every((e) => e.ok && !e.dryRun && e.runId === out.runId && e.planId === plan.id)).toBe(true);
    expect(log[0].action).toMatchObject({ kind: "transfer", from: VAULT, to: CHAR });
  });

  it("la simulación (dry run) no llama a Bungie ni toca nada, pero se registra como simulada", async () => {
    const item = makeItem({ slot: "kinetic" });
    const mock = new MockInventoryActions({ items: { [item.id]: { location: VAULT, locked: false } } });
    const plan = planMoveJunk({ items: [item], results: [verdict(item.id, "junk")], characterId: CHAR, free: { kinetic: 9 }, dryRun: true });

    const out = await executeRound(plan, plan.rounds[0], { actions: mock, dryRun: true, auditFile, ...fast });

    expect(mock.calls).toEqual([]);
    expect(mock.items[item.id].location).toBe(VAULT);
    expect(out.results[0]).toMatchObject({ ok: true, skipped: true });
    expect((await readAudit(auditFile))[0]).toMatchObject({ dryRun: true });
    expect(await lastRun(auditFile)).toBeNull(); // una simulación nunca cuenta como «última ejecución»
  });

  it("un ítem que falla queda registrado con su error y no impide el resto", async () => {
    const [a, b] = [makeItem({ slot: "kinetic" }), makeItem({ slot: "kinetic" })];
    const mock = new MockInventoryActions({
      items: { [a.id]: { location: VAULT, locked: false }, [b.id]: { location: VAULT, locked: false } },
      failures: { [a.id]: { code: 1623 } },
    });
    const plan = planMoveJunk({ items: [a, b], results: [verdict(a.id, "junk"), verdict(b.id, "junk")], characterId: CHAR, free: { kinetic: 9 } });

    const out = await executeRound(plan, plan.rounds[0], { actions: mock, auditFile, ...fast });

    expect(out.results.map((r) => r.ok)).toEqual([false, true]);
    const log = await readAudit(auditFile);
    expect(log[0]).toMatchObject({ ok: false, error: { kind: "not_found", code: 1623 } });
    expect(log[1].ok).toBe(true);
  });

  it("si el personaje está en una actividad, se detiene y explica por qué", async () => {
    const items = [makeItem({ slot: "kinetic" }), makeItem({ slot: "kinetic" }), makeItem({ slot: "kinetic" })];
    const mock = new MockInventoryActions({
      items: Object.fromEntries(items.map((i) => [i.id, { location: VAULT, locked: false }])),
      failures: { [items[1].id]: { code: 1671 } },
    });
    const plan = planMoveJunk({ items, results: items.map((i) => verdict(i.id, "junk")), characterId: CHAR, free: { kinetic: 9 } });

    const out = await executeRound(plan, plan.rounds[0], { actions: mock, auditFile, ...fast });

    expect(out.stopped).toMatchObject({ reason: "fatal", error: { kind: "in_activity" } });
    expect(mock.items[items[0].id].location).toBe(CHAR);
    expect(mock.items[items[2].id].location).toBe(VAULT); // nunca se intentó
    const log = await readAudit(auditFile);
    expect(log.map((e) => e.ok)).toEqual([true, false, false]); // lo no ejecutado no cuenta como hecho
    expect(log[1].error?.message).toMatch(/actividad/);
  });

  it("sin espacio en el destino: el error es del ítem y la cola sigue", async () => {
    const items = [makeItem({ slot: "kinetic" }), makeItem({ slot: "kinetic" })];
    const mock = new MockInventoryActions({
      items: Object.fromEntries(items.map((i) => [i.id, { location: VAULT, locked: false }])),
      characterCapacity: { [CHAR]: 1 },
    });
    const plan = planMoveJunk({ items, results: items.map((i) => verdict(i.id, "junk")), characterId: CHAR, free: { kinetic: 9 } });
    const out = await executeRound(plan, plan.rounds[0], { actions: mock, auditFile, ...fast });
    expect(out.results.map((r) => r.error?.kind)).toEqual([undefined, "no_room"]);
  });

  it("un throttle pasajero se reintenta y la acción termina bien", async () => {
    const item = makeItem({ slot: "kinetic" });
    const mock = new MockInventoryActions({
      items: { [item.id]: { location: VAULT, locked: false } },
      failures: { [item.id]: { code: 1672, times: 2 } },
    });
    const plan = planMoveJunk({ items: [item], results: [verdict(item.id, "junk")], characterId: CHAR, free: { kinetic: 9 } });
    const out = await executeRound(plan, plan.rounds[0], { actions: mock, auditFile, ...fast });
    expect(out.results[0].ok).toBe(true);
    expect(mock.calls).toHaveLength(3);
  });

  it("el log tolera líneas dañadas", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(auditFile, '{"runId":"a","ok":true,"dryRun":false}\n{roto\n{"runId":"a","ok":true,"dryRun":false}\n');
    expect(await readAudit(auditFile)).toHaveLength(2);
  });
});

describe("bloquear en masa (varias tandas como una sola ejecución)", () => {
  const setupMany = (n: number, options: Partial<ConstructorParameters<typeof MockInventoryActions>[0]> = {}) => {
    const items = Array.from({ length: n }, () => makeItem({ slot: "kinetic" }));
    const mock = new MockInventoryActions({
      items: Object.fromEntries(items.map((i) => [i.id, { location: VAULT, locked: false }])),
      ...options,
    });
    const results = items.map((i) => verdict(i.id, "keep"));
    const plan = planLockKeepers({ items, results, characterId: CHAR, vaultLockSupported: true });
    return { items, mock, plan };
  };

  it("480 ítems: se bloquean los 480 (no solo los 50 de la primera tanda)", async () => {
    const { items, mock, plan } = setupMany(480);
    expect(plan.rounds).toHaveLength(10);

    const out = await executeRounds(plan, plan.rounds, { actions: mock, auditFile, ...fast });

    expect(out.results).toHaveLength(480);
    expect(out.results.every((r) => r.ok)).toBe(true);
    expect(out.stopped).toBeNull();
    expect(items.every((i) => mock.items[i.id].locked)).toBe(true);
  });

  it("todas las tandas comparten runId y «Deshacer» revierte el lote completo", async () => {
    const { items, mock, plan } = setupMany(120);
    const out = await executeRounds(plan, plan.rounds, { actions: mock, auditFile, ...fast });

    const run = (await lastRun(auditFile))!;
    expect(run.runId).toBe(out.runId);
    expect(run.entries).toHaveLength(120);
    expect(new Set((await readAudit(auditFile)).map((e) => e.runId)).size).toBe(1);

    const undo = planUndo(run.entries);
    expect(undo.rounds[0].actions).toHaveLength(120);
    await executeRound(undo, undo.rounds[0], { actions: mock, auditFile, ...fast });
    expect(items.every((i) => !mock.items[i.id].locked)).toBe(true);
  });

  it("el progreso es acumulado: 1..N sobre el total, no se reinicia en cada tanda", async () => {
    const { mock, plan } = setupMany(120);
    const seen: [number, number][] = [];
    await executeRounds(plan, plan.rounds, {
      actions: mock, auditFile, ...fast,
      onResult: (_r, done, total) => seen.push([done, total]),
    });
    expect(seen).toHaveLength(120);
    expect(seen[0]).toEqual([1, 120]);
    expect(seen[49]).toEqual([50, 120]);
    expect(seen[50]).toEqual([51, 120]);
    expect(seen.at(-1)).toEqual([120, 120]);
  });

  it("al cancelar a mitad de una tanda, lo restante (incluidas tandas enteras) no se ejecuta ni se registra como hecho", async () => {
    const { items, mock, plan } = setupMany(120);
    const controller = new AbortController();
    const out = await executeRounds(plan, plan.rounds, {
      actions: mock, auditFile, ...fast, signal: controller.signal,
      onResult: (_r, done) => { if (done === 60) controller.abort(); },
    });

    expect(out.stopped).toEqual({ reason: "cancelled" });
    const locked = items.filter((i) => mock.items[i.id].locked).length;
    expect(locked).toBe(60);
    expect(out.results).toHaveLength(120);
    expect(out.results.filter((r) => r.ok && !r.skipped)).toHaveLength(60);
    expect(out.results.filter((r) => r.skipped)).toHaveLength(60);

    const log = await readAudit(auditFile);
    expect(log.filter((e) => e.ok)).toHaveLength(60); // lo no ejecutado no cuenta como hecho
  });

  it("un error fatal (actividad en curso) en una tanda detiene las siguientes", async () => {
    const { items, mock, plan } = setupMany(120, { failures: {} });
    const target = plan.rounds[1].actions[3].itemId; // dentro de la 2ª tanda
    const failing = new MockInventoryActions({
      items: Object.fromEntries(items.map((i) => [i.id, { location: VAULT, locked: false }])),
      failures: { [target]: { code: 1671 } },
    });
    const out = await executeRounds(plan, plan.rounds, { actions: failing, auditFile, ...fast });

    expect(out.stopped).toMatchObject({ reason: "fatal", error: { kind: "in_activity" } });
    expect(items.filter((i) => failing.items[i.id].locked)).toHaveLength(53); // 50 + 3 antes del fallo
    expect(out.results.filter((r) => r.skipped).length).toBe(120 - 54);
    void mock;
  });

  it("los errores de un ítem no frenan el lote: se reportan y el resto se bloquea", async () => {
    const { items, plan } = setupMany(120);
    const bad = [plan.rounds[0].actions[5].itemId, plan.rounds[2]?.actions[0]?.itemId ?? plan.rounds[1].actions[0].itemId];
    const mock = new MockInventoryActions({
      items: Object.fromEntries(items.map((i) => [i.id, { location: VAULT, locked: false }])),
      failures: Object.fromEntries(bad.map((id) => [id, { code: 1623 }])),
    });
    const out = await executeRounds(plan, plan.rounds, { actions: mock, auditFile, ...fast });
    expect(out.stopped).toBeNull();
    expect(out.results.filter((r) => !r.ok).map((r) => r.itemInstanceId).sort()).toEqual([...bad].sort());
    expect(items.filter((i) => mock.items[i.id].locked)).toHaveLength(118);
  });

  it("la simulación recorre todas las tandas sin llamar a la API", async () => {
    const { mock, plan } = setupMany(120);
    const out = await executeRounds(plan, plan.rounds, { actions: mock, dryRun: true, auditFile, ...fast });
    expect(out.results).toHaveLength(120);
    expect(mock.calls).toEqual([]);
    expect(await lastRun(auditFile)).toBeNull();
  });

  it("sin tandas: nada que hacer", async () => {
    const { mock } = setupMany(1);
    expect(await executeRounds({ id: "p" }, [], { actions: mock, auditFile, ...fast })).toMatchObject({ results: [], stopped: null });
  });
});

describe("candado en el alijo: soportado o con rodeo por el personaje", () => {
  const setup = (vaultLockSupported: boolean) => {
    const items = [makeItem({ slot: "kinetic" }), makeItem({ slot: "energy" })];
    const mockItems: Record<string, MockItem> = Object.fromEntries(items.map((i) => [i.id, { location: VAULT, locked: false }]));
    const mock = new MockInventoryActions({ items: mockItems, vaultLockSupported });
    const results = items.map((i) => verdict(i.id, "keep"));
    return { items, mock, results };
  };

  it("soportado: bloquea directamente", async () => {
    const { items, mock, results } = setup(true);
    const plan = planLockKeepers({ items, results, characterId: CHAR, vaultLockSupported: true });
    await executeRound(plan, plan.rounds[0], { actions: mock, auditFile, ...fast });
    expect(items.every((i) => mock.items[i.id].locked && mock.items[i.id].location === VAULT)).toBe(true);
    expect(mock.calls.every((c) => c.startsWith("lock:"))).toBe(true);
  });

  it("no soportado: el plan normal falla en el mock, el plan con rodeo funciona y todo vuelve al alijo", async () => {
    const { items, mock, results } = setup(false);

    const direct = planLockKeepers({ items, results, characterId: CHAR, vaultLockSupported: true });
    const failed = await executeRound(direct, direct.rounds[0], { actions: mock, auditFile, ...fast });
    expect(failed.results.every((r) => !r.ok)).toBe(true);

    const detour = planLockKeepers({ items, results, characterId: CHAR, vaultLockSupported: false, free: { kinetic: 1, energy: 1 } });
    const out = await executeRound(detour, detour.rounds[0], { actions: mock, auditFile, ...fast });
    expect(out.results.every((r) => r.ok)).toBe(true);
    expect(items.every((i) => mock.items[i.id].locked && mock.items[i.id].location === VAULT)).toBe(true);
  });
});

describe("deshacer", () => {
  it("devuelve al alijo lo movido, en orden inverso", async () => {
    const items = [makeItem({ slot: "kinetic" }), makeItem({ slot: "energy" })];
    const mock = new MockInventoryActions({ items: Object.fromEntries(items.map((i) => [i.id, { location: VAULT, locked: false }])) });
    const plan = planMoveJunk({ items, results: items.map((i) => verdict(i.id, "junk")), characterId: CHAR, free: { kinetic: 9, energy: 9 } });
    await executeRound(plan, plan.rounds[0], { actions: mock, auditFile, ...fast });
    expect(items.every((i) => mock.items[i.id].location === CHAR)).toBe(true);

    const run = (await lastRun(auditFile))!;
    const undo = planUndo(run.entries);
    expect(undo.kind).toBe("undo");
    expect(undo.rounds[0].actions.map((a) => a.itemId)).toEqual(items.map((i) => i.id).reverse());

    await executeRound(undo, undo.rounds[0], { actions: mock, auditFile, ...fast });
    expect(items.every((i) => mock.items[i.id].location === VAULT)).toBe(true);
  });

  it("restaura el candado anterior", async () => {
    const item = makeItem({ slot: "kinetic" });
    const mock = new MockInventoryActions({ items: { [item.id]: { location: VAULT, locked: false } } });
    const plan = planLockKeepers({ items: [item], results: [verdict(item.id, "keep")], characterId: CHAR, vaultLockSupported: true });
    await executeRound(plan, plan.rounds[0], { actions: mock, auditFile, ...fast });
    expect(mock.items[item.id].locked).toBe(true);

    const undo = planUndo((await lastRun(auditFile))!.entries);
    await executeRound(undo, undo.rounds[0], { actions: mock, auditFile, ...fast });
    expect(mock.items[item.id].locked).toBe(false);
  });

  it("solo revierte lo que salió bien, y lo desmantelado falla sin romper el resto", async () => {
    const [a, b] = [makeItem({ slot: "kinetic" }), makeItem({ slot: "kinetic" })];
    const mock = new MockInventoryActions({
      items: { [a.id]: { location: VAULT, locked: false }, [b.id]: { location: VAULT, locked: false } },
      failures: { [a.id]: { code: 1623 } },
    });
    const plan = planMoveJunk({ items: [a, b], results: [verdict(a.id, "junk"), verdict(b.id, "junk")], characterId: CHAR, free: { kinetic: 9 } });
    await executeRound(plan, plan.rounds[0], { actions: mock, auditFile, ...fast });

    const undo = planUndo((await lastRun(auditFile))!.entries);
    expect(undo.rounds[0].actions.map((x) => x.itemId)).toEqual([b.id]); // a nunca se movió

    delete mock.items[b.id]; // lo desmantelaste en el juego
    const out = await executeRound(undo, undo.rounds[0], { actions: mock, auditFile, ...fast });
    expect(out.results[0]).toMatchObject({ ok: false, error: { kind: "not_found" } });
  });

  it("un candado que no cambió el estado no genera acción inversa", () => {
    const lockEntry = (state: boolean, previous: boolean) => ({
      runId: "r", planId: "p", at: "x", dryRun: false, ok: true,
      action: { id: "1", kind: "lock" as const, itemId: "i", hash: 1, name: "n", reason: "", state, previous, characterId: CHAR },
    });
    expect(planUndo([lockEntry(true, true)]).rounds).toEqual([]);
    expect(planUndo([lockEntry(true, false)]).rounds[0].actions[0]).toMatchObject({ kind: "lock", state: false });
  });

  it("sin historial: nada que deshacer", () => {
    const undo = planUndo([]);
    expect(undo.rounds).toEqual([]);
    expect(undo.warnings).toContain("No hay nada que deshacer.");
  });

  it("«última ejecución» es la más reciente y real", async () => {
    const entry = (runId: string, dryRun: boolean) => ({
      runId, planId: "p", at: "x", dryRun, ok: true,
      action: { id: "1", kind: "transfer" as const, itemId: "i", hash: 1, name: "n", reason: "", from: VAULT, to: CHAR, stackSize: 1 },
    });
    await appendAudit([entry("run-1", false)], auditFile);
    await appendAudit([entry("run-2", false), entry("run-2", false)], auditFile);
    await appendAudit([entry("run-3", true)], auditFile);
    const last = await lastRun(auditFile);
    expect(last?.runId).toBe("run-2");
    expect(last?.entries).toHaveLength(2);
    expect(await readFile(auditFile, "utf8")).toContain("run-3");
  });
});
