import { ARMOR_STAT_KEYS, type ArmorStatKey } from "../../inventory/constants";
import type { NormalizedItem } from "../../inventory/types";
import type { Rule } from "../types";

function statValue(item: NormalizedItem, key: ArmorStatKey): number {
  return item.stats[ARMOR_STAT_KEYS.indexOf(key)]?.value ?? 0;
}

/** Armaduras: total de stats y stats prioritarias de la clase del ítem. */
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

  const junkBelow = classProfile?.minArmorTotal ?? armor.junkBelowTotal;
  const priority = classProfile?.armorStatPriority ?? [];
  const prioritySum = priority.reduce((sum, key) => sum + statValue(item, key), 0);
  const priorityOk = priority.length === 0 || prioritySum >= armor.priorityMinSum;

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
  // Zona intermedia
  return priorityOk
    ? { verdict: "archive", reason: `Total medio (${total}) con buenas stats prioritarias.`, confidence: 0.6 }
    : { verdict: "needs_review", reason: `Total medio (${total}) y stats prioritarias bajas.`, confidence: 0.4 };
};
