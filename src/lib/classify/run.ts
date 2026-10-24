import type { NormalizedItem } from "../inventory/types";
import type { ClassifyConfig } from "./classify.config";
import { classifyItems } from "./engine";
import { applyManualVerdicts, EMPTY_OVERRIDES, type Overrides } from "./overrides-pure";
import type { UsageProfile } from "./profile";
import type { ClassificationResult, Verdict } from "./types";

// Este módulo no toca el disco: puede ejecutarse en el servidor y en el navegador.

export interface AnalysisSummary {
  total: number;
  counts: Record<Verdict, number>;
  /** Ranuras del alijo que se liberarían si se desmantela todo lo marcado como junk. */
  slotsFreed: number;
  bySource: { rule: number; manual: number };
}

export interface AnalysisReport {
  generatedAt: string;
  profileVersion: number;
  results: ClassificationResult[];
  summary: AnalysisSummary;
}

export function summarize(results: readonly ClassificationResult[]): AnalysisSummary {
  const counts: Record<Verdict, number> = { keep: 0, archive: 0, junk: 0, needs_review: 0 };
  const bySource = { rule: 0, manual: 0 };
  for (const r of results) {
    counts[r.verdict] += 1;
    bySource[r.source] += 1;
  }
  return { total: results.length, counts, slotsFreed: counts.junk, bySource };
}

/** Solo reglas (sin correcciones manuales). */
export function classifyWithRules(
  items: readonly NormalizedItem[],
  options: { profile: UsageProfile; config?: ClassifyConfig },
): ClassificationResult[] {
  return classifyItems(items, { profile: options.profile, config: options.config });
}

/** Reglas + correcciones manuales («siempre conservar» incluido). */
export function analyze(
  items: readonly NormalizedItem[],
  options: { profile: UsageProfile; overrides?: Overrides; config?: ClassifyConfig },
): AnalysisReport {
  const ruled = classifyWithRules(items, options);
  const results = applyManualVerdicts(ruled, items, options.overrides ?? EMPTY_OVERRIDES);
  return {
    generatedAt: new Date().toISOString(),
    profileVersion: options.profile.version,
    results,
    summary: summarize(results),
  };
}
