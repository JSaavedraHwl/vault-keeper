// Lógica de correcciones sin acceso a disco: segura para ejecutarse también en el navegador.
import type { NormalizedItem } from "../inventory/types";
import type { ClassificationResult, Verdict } from "./types";

export type ManualVerdict = Exclude<Verdict, "needs_review">;

export interface Overrides {
  verdicts: Record<string, { verdict: ManualVerdict; at: string }>;
  alwaysKeep: string[];
}

export const EMPTY_OVERRIDES: Overrides = { verdicts: {}, alwaysKeep: [] };

/**
 * Aplica las correcciones sobre el resultado de las reglas.
 * - «Siempre conservar» gana a todo: el ítem queda en keep.
 * - Un veredicto manual «junk» se ignora si el ítem está bloqueado o equipado.
 */
export function applyManualVerdicts(
  results: readonly ClassificationResult[],
  items: readonly NormalizedItem[],
  overrides: Overrides,
): ClassificationResult[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const alwaysKeep = new Set(overrides.alwaysKeep);

  return results.map((result) => {
    if (alwaysKeep.has(result.itemId)) {
      if (result.verdict === "keep") return result;
      return {
        itemId: result.itemId,
        verdict: "keep",
        reason: "Marcado como «siempre conservar».",
        confidence: 1,
        source: "manual",
      };
    }

    const manual = overrides.verdicts[result.itemId];
    if (!manual) return result;
    const item = byId.get(result.itemId);
    if (manual.verdict === "junk" && (item?.locked || item?.equipped)) return result;
    return {
      itemId: result.itemId,
      verdict: manual.verdict,
      reason: "Decidido manualmente.",
      confidence: 1,
      source: "manual",
    };
  });
}
