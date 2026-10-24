import { describe, expect, it } from "vitest";
import type { ClassificationResult, Verdict } from "../classify/types";
import type { ItemSlot, NormalizedItem } from "../inventory/types";
import { makeItem } from "../classify/testing";
import { DEFAULT_ACTIONS_CONFIG } from "./actions.config";
import { planLockKeepers, planMoveJunk, totalActions } from "./plan";
import { VAULT } from "./types";

const verdicts = (pairs: [NormalizedItem, Verdict][]): ClassificationResult[] =>
  pairs.map(([item, verdict]) => ({
    itemId: item.id,
    verdict,
    reason: "test",
    confidence: 1,
    source: "rule",
  }));

const gun = (slot: ItemSlot, over: Partial<NormalizedItem> = {}) => makeItem({ slot, ...over });
const CHAR = "char-1";

describe("plan: bloquear lo que se conserva", () => {
  const base = { characterId: CHAR, vaultLockSupported: true };

  it("bloquea keep y archive, y solo eso", () => {
    const [k, a, j, r] = [gun("kinetic"), gun("energy"), gun("power"), gun("kinetic")];
    const plan = planLockKeepers({
      ...base,
      items: [k, a, j, r],
      results: verdicts([[k, "keep"], [a, "archive"], [j, "junk"], [r, "needs_review"]]),
    });
    const ids = plan.rounds.flatMap((x) => x.actions.map((y) => y.itemId));
    expect(ids.sort()).toEqual([k.id, a.id].sort());
    expect(plan.rounds[0].actions.every((x) => x.kind === "lock" && x.state && !x.previous)).toBe(true);
  });

  it("omite lo que ya tiene candado, los apilables y lo que no es arma ni armadura", () => {
    const locked = gun("kinetic", { locked: true });
    const stack = gun("other", { kind: "other", hash: 7, id: "7" });
    const mod = gun("other", { kind: "other" });
    const normal = gun("kinetic");
    const plan = planLockKeepers({
      ...base,
      items: [locked, stack, mod, normal],
      results: verdicts([[locked, "keep"], [stack, "keep"], [mod, "keep"], [normal, "keep"]]),
    });
    expect(totalActions(plan)).toBe(1);
    expect(plan.warnings.join(" ")).toMatch(/1 ítems ya tienen candado/);
  });

  it("parte en rondas del tamaño del tope por ejecución", () => {
    const items = Array.from({ length: 120 }, () => gun("kinetic"));
    const plan = planLockKeepers({ ...base, items, results: verdicts(items.map((i) => [i, "keep"])) });
    expect(plan.rounds.map((r) => r.actions.length)).toEqual([50, 50, 20]);
    expect(DEFAULT_ACTIONS_CONFIG.maxItemsPerRun).toBe(50);
  });

  it("ítems en un personaje se bloquean con ese personaje", () => {
    const onChar = gun("kinetic", { location: "character", characterId: "otro" });
    const plan = planLockKeepers({ ...base, items: [onChar], results: verdicts([[onChar, "keep"]]) });
    expect(plan.rounds[0].actions[0]).toMatchObject({ kind: "lock", characterId: "otro" });
  });

  describe("si el alijo no admite candado", () => {
    const fallback = { characterId: CHAR, vaultLockSupported: false };

    it("mueve al personaje, bloquea y devuelve, por cada ítem", () => {
      const item = gun("kinetic");
      const plan = planLockKeepers({ ...fallback, free: { kinetic: 1 }, items: [item], results: verdicts([[item, "keep"]]) });
      const kinds = plan.rounds[0].actions.map((a) => a.kind === "transfer" ? `${a.from}->${a.to}` : "lock");
      expect(kinds).toEqual([`${VAULT}->${CHAR}`, "lock", `${CHAR}->${VAULT}`]);
      expect(plan.warnings.join(" ")).toMatch(/no admite candado/);
    });

    it("con un solo hueco libre alcanza para todos (se hacen de uno en uno)", () => {
      const items = [gun("kinetic"), gun("kinetic"), gun("kinetic")];
      const plan = planLockKeepers({ ...fallback, free: { kinetic: 1 }, items, results: verdicts(items.map((i) => [i, "keep"])) });
      expect(totalActions(plan)).toBe(9);
      expect(plan.skipped).toEqual([]);
    });

    it("sin hueco libre en la ranura, el ítem se omite con motivo", () => {
      const item = gun("energy");
      const plan = planLockKeepers({ ...fallback, free: { kinetic: 5 }, items: [item], results: verdicts([[item, "keep"]]) });
      expect(totalActions(plan)).toBe(0);
      expect(plan.skipped[0].reason).toMatch(/hueco libre/);
    });
  });

  it("sin candidatos: plan vacío con aviso", () => {
    const plan = planLockKeepers({ ...base, items: [], results: [] });
    expect(plan.rounds).toEqual([]);
    expect(plan.warnings).toContain("No hay nada que bloquear.");
  });
});

describe("plan: mover la basura", () => {
  const base = { characterId: CHAR };
  const junk = (slot: ItemSlot, n: number, over: Partial<NormalizedItem> = {}) =>
    Array.from({ length: n }, () => gun(slot, over));

  it("mueve solo basura, del alijo al personaje elegido", () => {
    const [j, k] = [gun("kinetic"), gun("kinetic")];
    const plan = planMoveJunk({ ...base, free: { kinetic: 9 }, items: [j, k], results: verdicts([[j, "junk"], [k, "keep"]]) });
    expect(plan.rounds).toHaveLength(1);
    expect(plan.rounds[0].actions).toHaveLength(1);
    expect(plan.rounds[0].actions[0]).toMatchObject({ kind: "transfer", itemId: j.id, from: VAULT, to: CHAR });
    expect(plan.targetCharacterId).toBe(CHAR);
  });

  it("divide en rondas según el hueco libre por ranura", () => {
    const items = [...junk("kinetic", 20), ...junk("helmet", 5)];
    const plan = planMoveJunk({ ...base, free: { kinetic: 9, helmet: 9 }, items, results: verdicts(items.map((i) => [i, "junk"])) });
    expect(plan.rounds.map((r) => r.actions.length)).toEqual([14, 9, 2]); // 9+5, 9, 2
    expect(plan.warnings.join(" ")).toMatch(/3 rondas/);
    for (const r of plan.rounds) expect(r.note).toMatch(/Ronda \d+/);
  });

  it("respeta el tope de ítems por ejecución aunque quepan más", () => {
    const items = [...junk("kinetic", 40), ...junk("energy", 40), ...junk("power", 40)];
    const plan = planMoveJunk({
      ...base,
      free: { kinetic: 40, energy: 40, power: 40 },
      items,
      results: verdicts(items.map((i) => [i, "junk"])),
    });
    for (const r of plan.rounds) expect(r.actions.length).toBeLessThanOrEqual(50);
    expect(totalActions(plan)).toBe(120);
  });

  it("nunca incluye equipados, con candado, protegidos, apilables ni ítems fuera del alijo", () => {
    const equipped = gun("kinetic", { equipped: true });
    const locked = gun("kinetic", { locked: true });
    const prot = gun("kinetic");
    const stack = gun("other", { kind: "other", id: "9", hash: 9 });
    const onChar = gun("kinetic", { location: "character", characterId: "x" });
    const ok = gun("kinetic");
    const all = [equipped, locked, prot, stack, onChar, ok];
    const plan = planMoveJunk({
      ...base,
      free: { kinetic: 9, other: 9 },
      items: all,
      results: verdicts(all.map((i) => [i, "junk"])),
      protectedIds: new Set([prot.id]),
    });
    expect(plan.rounds.flatMap((r) => r.actions.map((a) => a.itemId))).toEqual([ok.id]);
    expect(plan.skipped).toHaveLength(5);
    const reasons = plan.skipped.map((s) => s.reason).join(" ");
    for (const motivo of ["equipado", "candado", "siempre conservar", "no es un arma", "no está en el alijo"]) {
      expect(reasons).toContain(motivo);
    }
  });

  it("sin hueco libre en una ranura, esos ítems se omiten con motivo", () => {
    const items = [...junk("kinetic", 2), ...junk("energy", 2)];
    const plan = planMoveJunk({ ...base, free: { kinetic: 9, energy: 0 }, items, results: verdicts(items.map((i) => [i, "junk"])) });
    expect(totalActions(plan)).toBe(2);
    expect(plan.skipped).toHaveLength(2);
    expect(plan.skipped[0].reason).toMatch(/Sin espacio/);
  });

  it("una ranura de la que no hay dato de capacidad cuenta como sin espacio (nunca como infinita)", () => {
    const items = [...junk("kinetic", 2), ...junk("helmet", 2)];
    const plan = planMoveJunk({ ...base, free: { kinetic: 9 }, items, results: verdicts(items.map((i) => [i, "junk"])) });
    expect(totalActions(plan)).toBe(2);
    expect(plan.skipped.map((s) => s.reason).join(" ")).toMatch(/cascos/);
  });

  it("sin basura: plan vacío con aviso", () => {
    const k = gun("kinetic");
    const plan = planMoveJunk({ ...base, free: { kinetic: 9 }, items: [k], results: verdicts([[k, "keep"]]) });
    expect(plan.rounds).toEqual([]);
    expect(plan.warnings).toContain("No hay basura que mover.");
  });

  it("es un plan serializable y con ids únicos", () => {
    const items = junk("kinetic", 30);
    const plan = planMoveJunk({ ...base, free: { kinetic: 30 }, items, results: verdicts(items.map((i) => [i, "junk"])) });
    expect(JSON.parse(JSON.stringify(plan))).toEqual(plan);
    const ids = plan.rounds.flatMap((r) => r.actions.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe("seguridad (datos aleatorios)", () => {
  it("ningún plan toca equipados, con candado o protegidos, ni excede capacidad o tope", () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const slots: ItemSlot[] = ["kinetic", "energy", "power", "helmet", "arms", "chest", "legs", "classItem"];

    for (let run = 0; run < 60; run++) {
      const items = Array.from({ length: 150 }, () =>
        gun(slots[Math.floor(rnd() * slots.length)], {
          locked: rnd() < 0.2,
          equipped: rnd() < 0.1,
          location: rnd() < 0.15 ? "character" : "vault",
          characterId: "x",
        }),
      );
      const all: Verdict[] = ["keep", "archive", "junk", "needs_review"];
      const results = verdicts(items.map((i) => [i, all[Math.floor(rnd() * 4)]]));
      const protectedIds = new Set(items.filter(() => rnd() < 0.1).map((i) => i.id));
      const free = Object.fromEntries(slots.map((s) => [s, Math.floor(rnd() * 12)]));
      const byId = new Map(items.map((i) => [i.id, i]));
      const verdictOf = new Map(results.map((r) => [r.itemId, r.verdict]));

      const move = planMoveJunk({ items, results, characterId: CHAR, free, protectedIds });
      for (const round of move.rounds) {
        expect(round.actions.length).toBeLessThanOrEqual(50);
        const perSlot: Record<string, number> = {};
        for (const a of round.actions) {
          const item = byId.get(a.itemId)!;
          expect(verdictOf.get(item.id)).toBe("junk");
          expect(item.equipped || item.locked || protectedIds.has(item.id)).toBe(false);
          expect(item.location).toBe("vault");
          perSlot[item.slot] = (perSlot[item.slot] ?? 0) + 1;
        }
        for (const [slot, n] of Object.entries(perSlot)) expect(n).toBeLessThanOrEqual(free[slot]);
      }
      const moved = move.rounds.flatMap((r) => r.actions.map((a) => a.itemId));
      expect(new Set(moved).size).toBe(moved.length); // ningún ítem se mueve dos veces

      const lock = planLockKeepers({ items, results, characterId: CHAR, vaultLockSupported: run % 2 === 0, free });
      for (const a of lock.rounds.flatMap((r) => r.actions)) {
        const item = byId.get(a.itemId)!;
        expect(["keep", "archive"]).toContain(verdictOf.get(item.id));
        expect(item.locked).toBe(false);
      }
    }
  });
});
