import { describe, expect, it } from "vitest";
import { DEFAULT_ACTIONS_CONFIG, getActionsConfig } from "./actions.config";

describe("getActionsConfig", () => {
  it("sin variable, usa los valores por defecto (50 por tanda)", () => {
    expect(getActionsConfig({})).toBe(DEFAULT_ACTIONS_CONFIG);
    expect(DEFAULT_ACTIONS_CONFIG.maxItemsPerRun).toBe(50);
  });

  it("ACTIONS_MAX_ITEMS_PER_RUN cambia solo el tamaño de tanda", () => {
    const cfg = getActionsConfig({ ACTIONS_MAX_ITEMS_PER_RUN: "120" });
    expect(cfg.maxItemsPerRun).toBe(120);
    expect({ ...cfg, maxItemsPerRun: 50 }).toEqual(DEFAULT_ACTIONS_CONFIG);
  });

  it.each(["0", "-3", "501", "2.5", "abc", "", "1e9"])("valor no válido «%s»: se ignora", (v) => {
    expect(getActionsConfig({ ACTIONS_MAX_ITEMS_PER_RUN: v })).toBe(DEFAULT_ACTIONS_CONFIG);
  });
});
