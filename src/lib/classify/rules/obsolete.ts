import type { Rule } from "../types";

/** Ítems obsoletos según la configuración (hashes, patrones de nombre o poder mínimo). */
export const obsoleteRule: Rule = (item, ctx) => {
  const cfg = ctx.config.obsolete;
  const make = (reason: string) => ({ verdict: cfg.verdict, reason, confidence: 0.8 });

  if (cfg.hashes.includes(item.hash)) return make("Marcado como obsoleto (lista de hashes).");

  const pattern = cfg.namePatterns.find((p) => new RegExp(p, "i").test(item.name));
  if (pattern) return make(`Marcado como obsoleto (nombre coincide con «${pattern}»).`);

  if (
    cfg.belowPower !== null &&
    item.kind !== "other" &&
    item.power !== null &&
    item.power < cfg.belowPower
  ) {
    return make(`Poder ${item.power} por debajo del mínimo (${cfg.belowPower}).`);
  }
  return null;
};
