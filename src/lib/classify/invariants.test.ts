import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./classify.config";
import { classifyItems } from "./engine";
import { applyManualVerdicts, type Overrides } from "./overrides-pure";
import { DEFAULT_PROFILE, type UsageProfile } from "./profile";
import { analyze } from "./run";
import { makeArmor, makeItem } from "./testing";
import type { NormalizedItem } from "../inventory/types";

// Generador pseudoaleatorio con semilla: los fallos son reproducibles.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const TIERS = ["common", "uncommon", "rare", "legendary", "exotic"] as const;
const CLASSES = ["titan", "hunter", "warlock", null] as const;
const TYPES = ["Rifle de pulsos", "Espada", "Escopeta", "Arco de combate"];

function randomItems(seed: number, n: number): NormalizedItem[] {
  const r = rng(seed);
  const pick = <T,>(list: readonly T[]) => list[Math.floor(r() * list.length)];
  return Array.from({ length: n }, (_, i) => {
    const common = {
      id: `r${seed}-${i}`,
      tier: pick(TIERS),
      locked: r() < 0.1,
      equipped: r() < 0.05,
      power: r() < 0.1 ? null : Math.floor(r() * 400),
    };
    const roll = r();
    if (roll < 0.45) {
      // Pocas armas distintas (hash) para forzar muchos duplicados.
      return makeItem({
        ...common,
        hash: Math.floor(r() * 25),
        type: pick(TYPES),
        perks: r() < 0.3 ? [{ name: "Torrente" }] : [],
        stats: r() < 0.8 ? [{ name: "Estabilidad", value: Math.floor(r() * 100) }] : [],
      });
    }
    if (roll < 0.9) {
      const s = () => Math.floor(r() * 30);
      const armor = makeArmor([s(), s(), s(), s(), s(), s()], { ...common, classType: pick(CLASSES) });
      // Algunas armaduras llegan sin stats (la API no las devolvió).
      return r() < 0.1 ? { ...armor, stats: [], armorTotal: undefined } : armor;
    }
    return makeItem({ ...common, kind: "other", type: "Material" });
  });
}

function randomProfile(seed: number): UsageProfile {
  const r = rng(seed);
  const cls = () => ({
    enabled: r() < 0.7,
    activities: (["pve", "pvp"] as const).filter(() => r() < 0.5),
    playstyle: "",
    armorStatPriority: (["health", "class", "melee"] as const).filter(() => r() < 0.5),
    ...(r() < 0.3 && { minArmorTotal: Math.floor(r() * 80) }),
  });
  return {
    version: 1,
    classes: { titan: cls(), hunter: cls(), warlock: cls() },
    weaponPreferences: r() < 0.5 ? { pve: ["Rifle de pulsos"], pvp: ["Escopeta"] } : {},
    favoredPerks: r() < 0.5 ? ["Torrente"] : [],
  };
}

const SEEDS = Array.from({ length: 40 }, (_, i) => i + 1);

describe("invariantes del motor (datos aleatorios)", () => {
  it.each(SEEDS)("semilla %i: forma, protección y exóticos", (seed) => {
    const items = randomItems(seed, 250);
    const ids = new Set(Array.from({ length: 250 }, (_, i) => (i % 7 === 0 ? items[i].id : "")));
    ids.delete("");
    const profile = randomProfile(seed);
    const frozen = structuredClone(items);

    const results = classifyItems(items, { profile, protectedIds: ids });

    expect(items).toEqual(frozen); // no muta la entrada
    expect(results.map((r) => r.itemId)).toEqual(items.map((i) => i.id)); // mismo orden y cantidad

    for (const [i, r] of results.entries()) {
      const item = items[i];
      expect(["keep", "archive", "junk", "needs_review"]).toContain(r.verdict);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
      expect(r.reason.length).toBeGreaterThan(0);
      expect(r.source).toBe("rule");
      if (item.locked || item.equipped || ids.has(item.id)) expect(r.verdict).not.toBe("junk");
      if (item.tier === "exotic") expect(r.verdict).not.toBe("junk");
      if (!r.ruleId) expect(r.verdict).toBe("needs_review");
    }
  });

  it.each(SEEDS)("semilla %i: determinista y sin depender del orden de entrada", (seed) => {
    const items = randomItems(seed, 200);
    const profile = randomProfile(seed);
    const a = classifyItems(items, { profile });
    expect(classifyItems(items, { profile })).toEqual(a);

    const shuffled = [...items].sort(() => rng(seed)() - 0.5).reverse();
    const b = new Map(classifyItems(shuffled, { profile }).map((r) => [r.itemId, r]));
    for (const r of a) expect(b.get(r.itemId)).toEqual(r);
  });

  it.each(SEEDS)("semilla %i: como mucho una «mejor copia» por arma", (seed) => {
    const items = randomItems(seed, 250);
    const results = classifyItems(items, { profile: randomProfile(seed) });
    const best = new Map<number, number>();
    items.forEach((item, i) => {
      if (item.kind === "weapon" && results[i].ruleId === "bestCopy") {
        best.set(item.hash, (best.get(item.hash) ?? 0) + 1);
      }
    });
    for (const count of best.values()) expect(count).toBe(1);
  });

  it.each(SEEDS)("semilla %i: las correcciones nunca crean basura protegida", (seed) => {
    const items = randomItems(seed, 200);
    const r = rng(seed + 1000);
    const overrides: Overrides = {
      verdicts: Object.fromEntries(
        items.filter(() => r() < 0.5).map((i) => [i.id, { verdict: "junk" as const, at: "x" }]),
      ),
      alwaysKeep: items.filter(() => r() < 0.1).map((i) => i.id),
    };
    const report = analyze(items, { profile: randomProfile(seed), overrides });
    const byId = new Map(items.map((i) => [i.id, i]));
    for (const res of report.results) {
      const item = byId.get(res.itemId)!;
      if (item.locked || item.equipped || overrides.alwaysKeep.includes(item.id)) {
        expect(res.verdict).not.toBe("junk");
      }
    }
    const total = Object.values(report.summary.counts).reduce((a, b) => a + b, 0);
    expect(total).toBe(items.length);
  });

  it("los resultados sobreviven a JSON (serializables)", () => {
    const results = classifyItems(randomItems(7, 100), { profile: DEFAULT_PROFILE });
    expect(JSON.parse(JSON.stringify(results))).toEqual(results);
  });
});

describe("casos límite", () => {
  it("lista vacía", () => {
    expect(classifyItems([])).toEqual([]);
    expect(analyze([], { profile: DEFAULT_PROFILE }).summary.total).toBe(0);
  });

  it("armadura sin stats no se juzga por stats: va a revisión", () => {
    const item = makeArmor([0, 0, 0, 0, 0, 0], { stats: [], armorTotal: undefined });
    expect(classifyItems([item])[0].verdict).toBe("needs_review");
  });

  it("una expresión regular inválida en la config no tumba el análisis", () => {
    const config = {
      ...DEFAULT_CONFIG,
      obsolete: { hashes: [], namePatterns: ["(sin cerrar"], belowPower: null, verdict: "junk" as const },
    };
    expect(() => classifyItems([makeItem()], { config })).not.toThrow();
  });

  it("5.000 ítems se clasifican en tiempo razonable", () => {
    const items = randomItems(99, 5000);
    const t0 = performance.now();
    classifyItems(items, { profile: randomProfile(99) });
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it("poder nulo o enorme no rompe el puntaje de duplicados", () => {
    const a = makeItem({ hash: 1, power: null });
    const b = makeItem({ hash: 1, power: Number.MAX_SAFE_INTEGER });
    const [ra, rb] = classifyItems([a, b]);
    expect(rb.verdict).toBe("keep");
    expect(ra.verdict).not.toBe("keep");
  });

  it("applyManualVerdicts ignora correcciones de ítems que ya no existen", () => {
    const item = makeItem();
    const results = classifyItems([item]);
    const overrides: Overrides = { verdicts: { fantasma: { verdict: "junk", at: "x" } }, alwaysKeep: ["otro"] };
    expect(applyManualVerdicts(results, [item], overrides)).toEqual(results);
  });
});
