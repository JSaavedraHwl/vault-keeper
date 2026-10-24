import type { NormalizedItem } from "../inventory/types";
import type { ClassifyConfig } from "./classify.config";
import { classifyItems } from "./engine";
import { applyManualVerdicts, EMPTY_OVERRIDES, type Overrides } from "./overrides";
import type { UsageProfile } from "./profile";
import type { ClassificationResult, Verdict } from "./types";

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

/** Reglas + correcciones manuales («siempre conservar» protege además dentro de las reglas). */
export function analyze(
  items: readonly NormalizedItem[],
  options: { profile: UsageProfile; overrides?: Overrides; config?: ClassifyConfig },
): AnalysisReport {
  const overrides = options.overrides ?? EMPTY_OVERRIDES;
  const ruled = classifyItems(items, {
    profile: options.profile,
    config: options.config,
    protectedIds: new Set(overrides.alwaysKeep),
  });
  const results = applyManualVerdicts(ruled, items, overrides);
  return {
    generatedAt: new Date().toISOString(),
    profileVersion: options.profile.version,
    results,
    summary: summarize(results),
  };
}
