import type { Rule } from "../types";

/** Ítems que no son armas ni armaduras (mods, consumibles, cosméticos...). */
export const otherItemsRule: Rule = (item, ctx) => {
  if (item.kind !== "other") return null;
  return {
    verdict: ctx.config.otherItems.verdict,
    reason: "No es arma ni armadura; fuera del alcance de la limpieza.",
    confidence: 0.6,
  };
};
