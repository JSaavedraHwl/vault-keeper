import { ARMOR_STAT_KEYS, type ArmorStatKey } from "../../inventory/constants";
import type { NormalizedItem } from "../../inventory/types";
import type { Rule } from "../types";

function statValue(item: NormalizedItem, key: ArmorStatKey): number {
  return item.stats[ARMOR_STAT_KEYS.indexOf(key)]?.value ?? 0;
}

/**
 * Armaduras. Si la pieza informa su nivel (`gearTier`), el nivel manda: el total de stats
 * depende de él (nivel 3 ≈ 64–69, nivel 4 ≈ 70–75...). Sin nivel (armaduras antiguas),
 * se juzga por el total.
 */
export const armorRule: Rule = (item, ctx) => {
  if (item.kind !== "armor" || item.armorTotal === undefined) return null;
  const { armor } = ctx.config;
  const total = item.armorTotal;
  const classProfile = item.classType ? ctx.profile.classes[item.classType] : undefined;

  if (classProfile && !classProfile.enabled) {
    return {
      verdict: armor.disabledClassVerdict,
      reason: `Armadura de ${item.classType}, una clase que no juegas.`,
      confidence: 0.7,
    };
  }

  // Sin ninguna stat no hay nada que juzgar (la API no las informó): lo decide el usuario.
  if (item.stats.every((s) => s.value === 0)) {
    return { verdict: "needs_review", reason: "La armadura no tiene stats informadas.", confidence: 0.2 };
  }

  const minTotal = classProfile?.minArmorTotal;
  const priority = classProfile?.armorStatPriority ?? [];
  const prioritySum = priority.reduce((sum, key) => sum + statValue(item, key), 0);
  const priorityOk = priority.length === 0 || prioritySum >= armor.priorityMinSum;
  const tier = item.gearTier;

  if (tier !== undefined && tier > 0) {
    const t = armor.byTier;
    if (minTotal !== undefined && total < minTotal) {
      return { verdict: "junk", reason: `Total ${total}, bajo tu mínimo para esta clase (${minTotal}).`, confidence: 0.85 };
    }
    if (total >= t.exceptionalTotal) {
      return { verdict: "keep", reason: `Total excepcional (${total}).`, confidence: 0.85 };
    }
    if (tier >= t.keepFromTier) {
      return priorityOk
        ? { verdict: "keep", reason: `Pieza de nivel ${tier} (total ${total}).`, confidence: 0.9 }
        : {
            verdict: "archive",
            reason: `Nivel ${tier} (total ${total}) pero stats prioritarias bajas (${prioritySum}).`,
            confidence: 0.6,
          };
    }
    if (tier < t.junkBelowTier) {
      return {
        verdict: "junk",
        reason: `Pieza de nivel ${tier}, inferior al mínimo (${t.junkBelowTier}).`,
        confidence: 0.8,
      };
    }
    // Nivel intermedio: decide la distribución de stats.
    return priorityOk
      ? { verdict: "archive", reason: `Nivel ${tier} (total ${total}) con buenas stats prioritarias.`, confidence: 0.6 }
      : { verdict: "needs_review", reason: `Nivel ${tier} (total ${total}) y stats prioritarias bajas.`, confidence: 0.4 };
  }

  // Sin nivel: por total.
  const junkBelow = minTotal ?? armor.junkBelowTotal;
  if (total < junkBelow) {
    return { verdict: "junk", reason: `Total de stats ${total}, bajo el mínimo (${junkBelow}).`, confidence: 0.85 };
  }
  if (total >= armor.keepFromTotal) {
    return priorityOk
      ? { verdict: "keep", reason: `Total de stats alto (${total}).`, confidence: 0.9 }
      : {
          verdict: "archive",
          reason: `Total alto (${total}) pero stats prioritarias bajas (${prioritySum}).`,
          confidence: 0.6,
        };
  }
  return priorityOk
    ? { verdict: "archive", reason: `Total medio (${total}) con buenas stats prioritarias.`, confidence: 0.6 }
    : { verdict: "needs_review", reason: `Total medio (${total}) y stats prioritarias bajas.`, confidence: 0.4 };
};
