import { describe, expect, it } from "vitest";
import { makeItem } from "../classify/testing";
import type { ClassificationResult, Verdict } from "../classify/types";
import type { CharacterInfo, NormalizedItem } from "../inventory/types";
import { buildPlan, limitItems, PlanError, prepareExecution, type PlanContext } from "./service";
import type { AuditEntry } from "./types";

const result = (id: string, verdict: Verdict): ClassificationResult => ({
  itemId: id,
  verdict,
  reason: "t",
  confidence: 1,
  source: "rule",
});

const chars: CharacterInfo[] = [
  { id: "recent", classType: "titan", light: 2000, free: { kinetic: 9, energy: 9, helmet: 9 } },
  { id: "other", classType: "hunter", light: 1900, free: { kinetic: 1 } },
];

function ctx(items: NormalizedItem[], verdicts: Record<string, Verdict>, over: Partial<PlanContext> = {}): PlanContext {
  return {
    items,
    characters: chars,
    results: items.map((i) => result(i.id, verdicts[i.id] ?? "keep")),
    protectedIds: new Set(),
    capabilities: { vaultLock: true },
    lastRun: null,
    ...over,
  };
}

const gun = (over: Partial<NormalizedItem> = {}) => makeItem({ slot: "kinetic", ...over });
const req = (kind: "lock-keepers" | "move-junk" | "undo", over = {}) => ({ kind, dryRun: false, ...over });

describe("buildPlan", () => {
  it("usa el personaje más reciente por defecto y el elegido si se indica", () => {
    const j = gun();
    const c = ctx([j], { [j.id]: "junk" });
    expect(buildPlan(c, req("move-junk")).targetCharacterId).toBe("recent");
    expect(buildPlan(c, req("move-junk", { characterId: "other" })).targetCharacterId).toBe("other");
  });

  it("el espacio libre del personaje elegido limita las rondas", () => {
    const items = [gun(), gun(), gun()];
    const c = ctx(items, Object.fromEntries(items.map((i) => [i.id, "junk" as const])));
    expect(buildPlan(c, req("move-junk", { characterId: "recent" })).rounds).toHaveLength(1);
    expect(buildPlan(c, req("move-junk", { characterId: "other" })).rounds).toHaveLength(3); // 1 hueco
  });

  it("personaje inexistente: error claro", () => {
    expect(() => buildPlan(ctx([], {}), req("move-junk", { characterId: "zzz" }))).toThrow(PlanError);
    expect(() => buildPlan({ ...ctx([], {}), characters: [] }, req("lock-keepers"))).toThrow(/personaje/);
  });

  it("si el alijo no admite candado (ya probado), planifica el rodeo", () => {
    const k = gun();
    const direct = buildPlan(ctx([k], { [k.id]: "keep" }, { capabilities: { vaultLock: true } }), req("lock-keepers"));
    const unknown = buildPlan(ctx([k], { [k.id]: "keep" }, { capabilities: {} }), req("lock-keepers"));
    const detour = buildPlan(ctx([k], { [k.id]: "keep" }, { capabilities: { vaultLock: false } }), req("lock-keepers"));
    expect(direct.rounds[0].actions).toHaveLength(1);
    expect(unknown.rounds[0].actions).toHaveLength(1); // se prueba el directo
    expect(detour.rounds[0].actions).toHaveLength(3);
  });

  it("deshacer sin ejecución previa: error claro; con ella, plan inverso", () => {
    expect(() => buildPlan(ctx([], {}), req("undo"))).toThrow(/ninguna ejecución/);
    const entry: AuditEntry = {
      runId: "r1", planId: "p", at: "x", dryRun: false, ok: true,
      action: { id: "1", kind: "transfer", itemId: "i", hash: 1, name: "n", reason: "", from: "vault", to: "recent", stackSize: 1 },
    };
    const plan = buildPlan(ctx([], {}, { lastRun: { runId: "r1", entries: [entry] } }), req("undo"));
    expect(plan.kind).toBe("undo");
    expect(plan.rounds[0].actions[0]).toMatchObject({ from: "recent", to: "vault" });
  });

  it("el modo simulación se propaga al plan", () => {
    const j = gun();
    expect(buildPlan(ctx([j], { [j.id]: "junk" }), req("move-junk", { dryRun: true })).dryRun).toBe(true);
  });
});

describe("limitItems / límite de prueba", () => {
  it("limita por ítems, no por acciones", () => {
    const k = [gun(), gun(), gun()];
    const c = ctx(k, Object.fromEntries(k.map((i) => [i.id, "keep" as const])), { capabilities: { vaultLock: false } });
    const plan = buildPlan(c, req("lock-keepers", { limit: 2 }));
    expect(plan.rounds[0].actions).toHaveLength(6); // 2 ítems × 3 acciones
    expect(new Set(plan.rounds[0].actions.map((a) => a.itemId)).size).toBe(2);
    expect(plan.rounds[0].note).toMatch(/limitada a 2/);
  });

  it("un límite de 1 deja exactamente un ítem; menos de 1 se trata como 1", () => {
    const items = [gun(), gun(), gun()];
    const c = ctx(items, Object.fromEntries(items.map((i) => [i.id, "junk" as const])));
    expect(buildPlan(c, req("move-junk", { limit: 1 })).rounds[0].actions).toHaveLength(1);
    expect(buildPlan(c, req("move-junk", { limit: 0 })).rounds[0].actions).toHaveLength(1);
  });

  it("limitItems no cambia las demás rondas", () => {
    const items = Array.from({ length: 12 }, () => gun());
    const c = ctx(items, Object.fromEntries(items.map((i) => [i.id, "junk" as const])));
    const plan = buildPlan({ ...c, characters: [{ ...chars[0], free: { kinetic: 5 } }] }, req("move-junk", { limit: 2 }));
    expect(plan.rounds.map((r) => r.actions.length)).toEqual([2, 5, 2]);
    expect(limitItems({ index: 0, note: "", actions: [] }, 3).actions).toEqual([]);
  });
});

describe("prepareExecution: lo que de verdad se ejecuta", () => {
  it("ejecuta solo lo confirmado que sigue siendo válido (primera ronda)", () => {
    const items = [gun(), gun(), gun()];
    const c = ctx(items, Object.fromEntries(items.map((i) => [i.id, "junk" as const])));
    const ex = prepareExecution(c, req("move-junk"), [items[0].id, items[1].id]);
    expect(ex.round?.actions.map((a) => a.itemId)).toEqual([items[0].id, items[1].id]);
    expect(ex.omitted).toEqual([]);
  });

  it("un ítem que cambió desde la vista previa (candado, equipado, veredicto) NO se ejecuta y se reporta", () => {
    const [locked, equipped, kept, fine] = [gun({ locked: true }), gun({ equipped: true }), gun(), gun()];
    const verdicts = { [locked.id]: "junk", [equipped.id]: "junk", [kept.id]: "keep", [fine.id]: "junk" } as const;
    const c = ctx([locked, equipped, kept, fine], verdicts);
    const ex = prepareExecution(c, req("move-junk"), [locked.id, equipped.id, kept.id, fine.id]);
    expect(ex.round?.actions.map((a) => a.itemId)).toEqual([fine.id]);
    expect(ex.omitted.map((o) => o.itemId).sort()).toEqual([equipped.id, kept.id, locked.id].sort());
    expect(ex.omitted[0].reason).toMatch(/cambió desde la vista previa/);
  });

  it("un ítem que el navegador inventa (no está en el plan fresco) se descarta", () => {
    const real = gun();
    const c = ctx([real], { [real.id]: "junk" });
    const ex = prepareExecution(c, req("move-junk"), [real.id, "id-inventado"]);
    expect(ex.round?.actions.map((a) => a.itemId)).toEqual([real.id]);
    expect(ex.omitted.map((o) => o.itemId)).toEqual(["id-inventado"]);
  });

  it("lo que ahora es válido pero no se confirmó, no se ejecuta", () => {
    const [a, b] = [gun(), gun()];
    const c = ctx([a, b], { [a.id]: "junk", [b.id]: "junk" });
    const ex = prepareExecution(c, req("move-junk"), [a.id]);
    expect(ex.round?.actions.map((x) => x.itemId)).toEqual([a.id]);
  });

  it("nunca ejecuta más que la primera ronda ni excede la capacidad, aunque se confirmen ítems de otras", () => {
    const items = Array.from({ length: 12 }, () => gun());
    const c = ctx(items, Object.fromEntries(items.map((i) => [i.id, "junk" as const])), {
      characters: [{ ...chars[0], free: { kinetic: 5 } }],
    });
    const ex = prepareExecution(c, req("move-junk"), items.map((i) => i.id));
    expect(ex.round?.actions).toHaveLength(5);
    expect(ex.remainingRounds).toBe(2);
    expect(ex.omitted).toHaveLength(7);
  });

  it("sin nada válido: no hay ronda y todo lo confirmado queda como omitido", () => {
    const k = gun();
    const ex = prepareExecution(ctx([k], { [k.id]: "keep" }), req("move-junk"), [k.id]);
    expect(ex.round).toBeNull();
    expect(ex.omitted).toHaveLength(1);
  });

  it("ignora el límite de la vista previa (se recalcula el plan completo)", () => {
    const items = [gun(), gun(), gun()];
    const c = ctx(items, Object.fromEntries(items.map((i) => [i.id, "junk" as const])));
    const ex = prepareExecution(c, req("move-junk", { limit: 1 }), items.map((i) => i.id));
    expect(ex.round?.actions).toHaveLength(3);
  });
});
