import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG } from "./classify.config";
import { classifyItems, RulesClassifier } from "./engine";
import { makeArmor, makeItem } from "./testing";

describe("motor de reglas", () => {
  it("la prioridad configurada decide entre reglas que chocan", () => {
    const item = makeItem({ tier: "rare", hash: 1 }); // lowRarity (junk) y bestCopy (keep)
    expect(classifyItems([item])[0].ruleId).toBe("lowRarity");

    const config = {
      ...DEFAULT_CONFIG,
      rulePriority: ["bestCopy" as const, "lowRarity" as const],
    };
    const r = classifyItems([item], { config })[0];
    expect(r.ruleId).toBe("bestCopy");
    expect(r.alsoMatched).toEqual(["lowRarity"]);
  });

  it("ninguna regla aplica → needs_review", () => {
    const config = { ...DEFAULT_CONFIG, rulePriority: [] };
    const r = classifyItems([makeItem()], { config })[0];
    expect(r.verdict).toBe("needs_review");
    expect(r.ruleId).toBeUndefined();
  });

  it("los exóticos nunca salen como basura", () => {
    const item = makeArmor([5, 5, 5, 5, 5, 5], { tier: "exotic" }); // total 30 → junk por la regla
    const r = classifyItems([item])[0];
    expect(r.verdict).toBe("archive");
    expect(r.reason).toContain("Exótico");
  });

  it("confianza por debajo del mínimo → needs_review", () => {
    const config = { ...DEFAULT_CONFIG, minConfidence: 0.95 };
    expect(classifyItems([makeItem()], { config })[0].verdict).toBe("needs_review");
  });

  it("ningún ítem protegido sale como junk, con cualquier configuración", () => {
    const protectedItems = [
      makeItem({ tier: "common", locked: true }),
      makeItem({ tier: "common", equipped: true }),
      makeArmor([1, 1, 1, 1, 1, 1], { locked: true }),
    ];
    // Prioridad que ni siquiera incluye la regla de protección.
    const config = { ...DEFAULT_CONFIG, rulePriority: ["lowRarity" as const, "armor" as const] };
    for (const r of classifyItems(protectedItems, { config })) {
      expect(r.verdict).not.toBe("junk");
    }
  });

  it("RulesClassifier implementa Classifier", () => {
    const results = new RulesClassifier().classify([makeItem()]);
    expect(results).toHaveLength(1);
    expect(results[0].source).toBe("rule");
  });
});
