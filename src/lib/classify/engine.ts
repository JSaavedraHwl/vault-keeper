import type { NormalizedItem } from "../inventory/types";
import { classifyConfig, type ClassifyConfig } from "./classify.config";
import { DEFAULT_PROFILE, type UsageProfile } from "./profile";
import { RULES } from "./rules";
import { groupWeapons } from "./rules/weapons";
import type {
  ClassificationResult,
  Classifier,
  RuleContext,
  RuleId,
  RuleOutcome,
} from "./types";

export interface ClassifyOptions {
  config?: ClassifyConfig;
  profile?: UsageProfile;
  /** itemInstanceId de ítems «siempre conservar». */
  protectedIds?: ReadonlySet<string>;
}

function isProtected(item: NormalizedItem, ctx: RuleContext): boolean {
  return item.locked || item.equipped || ctx.protectedIds.has(item.id);
}

function resolve(item: NormalizedItem, ctx: RuleContext): ClassificationResult {
  const matches: { ruleId: RuleId; outcome: RuleOutcome }[] = [];
  for (const ruleId of ctx.config.rulePriority) {
    const outcome = RULES[ruleId](item, ctx);
    if (outcome) matches.push({ ruleId, outcome });
  }

  if (matches.length === 0) {
    return {
      itemId: item.id,
      verdict: "needs_review",
      reason: "Ninguna regla aplica a este ítem.",
      confidence: 0,
      source: "rule",
    };
  }

  const [winner, ...rest] = matches;
  let { verdict, reason } = winner.outcome;
  const { confidence } = winner.outcome;

  // Exóticos: nunca basura, sea cual sea la regla.
  if (verdict === "junk" && ctx.config.neverJunkExotics && item.tier === "exotic") {
    verdict = "archive";
    reason += " (Exótico: se archiva en lugar de marcarlo como basura.)";
  }
  // Confianza baja → lo decide el usuario.
  if (verdict !== "needs_review" && confidence < ctx.config.minConfidence) {
    verdict = "needs_review";
    reason += " (Confianza baja.)";
  }
  // Red de seguridad final: un ítem protegido jamás sale como basura.
  if (verdict === "junk" && isProtected(item, ctx)) {
    verdict = "keep";
    reason = "Protegido (candado, equipado o «siempre conservar»).";
  }

  return {
    itemId: item.id,
    verdict,
    reason,
    confidence,
    source: "rule",
    ruleId: winner.ruleId,
    ...(rest.length > 0 && { alsoMatched: rest.map((m) => m.ruleId) }),
  };
}

/** Clasifica todos los ítems con el motor de reglas. */
export function classifyItems(
  items: readonly NormalizedItem[],
  options: ClassifyOptions = {},
): ClassificationResult[] {
  const config = options.config ?? classifyConfig;
  const profile = options.profile ?? DEFAULT_PROFILE;
  const ctx: RuleContext = {
    config,
    profile,
    protectedIds: options.protectedIds ?? new Set(),
    weaponGroups: groupWeapons(items, config, profile),
  };
  return items.map((item) => resolve(item, ctx));
}

export class RulesClassifier implements Classifier {
  constructor(private readonly options: ClassifyOptions = {}) {}
  classify(items: readonly NormalizedItem[]) {
    return classifyItems(items, this.options);
  }
}
