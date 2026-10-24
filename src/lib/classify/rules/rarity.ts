import type { Rule } from "../types";

const TIER_NAMES = { common: "común", uncommon: "poco común", rare: "rara", legendary: "legendaria", exotic: "exótica" };

/** Armas y armaduras de rareza baja. */
export const lowRarityRule: Rule = (item, ctx) => {
  if (item.kind === "other" || !ctx.config.lowRarity.tiers.includes(item.tier)) return null;
  return {
    verdict: "junk",
    reason: `Rareza baja (${TIER_NAMES[item.tier]}).`,
    confidence: 0.9,
  };
};
