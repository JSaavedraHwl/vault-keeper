import type { NormalizedItem } from "../../inventory/types";
import type { ClassifyConfig } from "../classify.config";
import type { UsageProfile } from "../profile";
import type { Rule } from "../types";

/** Puntaje de una copia de arma: perks que valoras + stats + poder. */
export function scoreWeapon(item: NormalizedItem, config: ClassifyConfig, profile: UsageProfile): number {
  const favored = new Set(profile.favoredPerks.map((p) => p.toLocaleLowerCase("es")));
  const perkMatches = item.perks.filter((p) => favored.has(p.name.toLocaleLowerCase("es"))).length;
  const statsTotal = item.stats.reduce((sum, s) => sum + s.value, 0);
  const d = config.duplicates;
  return perkMatches * d.perkWeight + statsTotal * d.statWeight + (item.power ?? 0) * d.powerWeight;
}

/** Agrupa las armas por hash y ordena cada grupo de mejor a peor copia. */
export function groupWeapons(
  items: readonly NormalizedItem[],
  config: ClassifyConfig,
  profile: UsageProfile,
): Map<number, NormalizedItem[]> {
  const groups = new Map<number, NormalizedItem[]>();
  for (const item of items) {
    if (item.kind !== "weapon") continue;
    const group = groups.get(item.hash) ?? [];
    group.push(item);
    groups.set(item.hash, group);
  }
  const scores = new Map(
    [...groups.values()].flat().map((i) => [i.id, scoreWeapon(i, config, profile)] as const),
  );
  for (const group of groups.values()) {
    group.sort(
      (a, b) =>
        scores.get(b.id)! - scores.get(a.id)! ||
        (b.power ?? 0) - (a.power ?? 0) ||
        a.id.localeCompare(b.id),
    );
  }
  return groups;
}

/** Copias sobrantes de un arma: basura si el puntaje es claramente menor que el de la mejor. */
export const duplicateSurplusRule: Rule = (item, ctx) => {
  if (item.kind !== "weapon") return null;
  const group = ctx.weaponGroups.get(item.hash);
  if (!group || group.length < 2 || group[0].id === item.id) return null;

  const best = group[0];
  const gap = scoreWeapon(best, ctx.config, ctx.profile) - scoreWeapon(item, ctx.config, ctx.profile);
  if (gap >= ctx.config.duplicates.surplusGap) {
    return {
      verdict: "junk",
      reason: `Copia ${group.indexOf(item) + 1} de ${group.length}; la mejor puntúa ${gap.toFixed(1)} más.`,
      confidence: 0.75,
    };
  }
  return {
    verdict: "archive",
    reason: `Copia casi equivalente a la mejor (diferencia de ${gap.toFixed(1)} puntos).`,
    confidence: 0.55,
  };
};

/** Tipos de arma que usas en alguna actividad de alguna clase activa; null si no hay preferencias. */
function preferredWeaponTypes(profile: UsageProfile): Set<string> | null {
  const activities = new Set(
    Object.values(profile.classes).filter((c) => c.enabled).flatMap((c) => c.activities),
  );
  const types = [...activities].flatMap((a) => profile.weaponPreferences[a] ?? []);
  return types.length > 0 ? new Set(types) : null;
}

/** Armas de un tipo que no usas en tus actividades. */
export const weaponPreferenceRule: Rule = (item, ctx) => {
  if (item.kind !== "weapon") return null;
  const preferred = preferredWeaponTypes(ctx.profile);
  if (!preferred || preferred.has(item.type)) return null;
  return {
    verdict: "archive",
    reason: `Tipo de arma («${item.type}») que no usas en tus actividades.`,
    confidence: 0.6,
  };
};

/** Mejor copia (o única) de un arma: se conserva. */
export const bestCopyRule: Rule = (item, ctx) => {
  if (item.kind !== "weapon") return null;
  const group = ctx.weaponGroups.get(item.hash);
  if (!group) return null;
  return group.length === 1
    ? { verdict: "keep", reason: "Única copia de esta arma.", confidence: 0.7 }
    : { verdict: "keep", reason: `Mejor copia de ${group.length}.`, confidence: 0.75 };
};
