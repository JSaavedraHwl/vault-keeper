import type { NormalizedItem } from "../inventory/types";
import type { ClassifyConfig } from "./classify.config";
import type { UsageProfile } from "./profile";

export type Verdict = "keep" | "archive" | "junk" | "needs_review";

export type RuleId =
  | "protected"
  | "exceptions"
  | "obsolete"
  | "lowRarity"
  | "armor"
  | "duplicateSurplus"
  | "weaponPreference"
  | "bestCopy"
  | "otherItems";

/** Lo que devuelve una regla cuando aplica. */
export interface RuleOutcome {
  verdict: Verdict;
  /** Una línea, en español, que explica el veredicto. */
  reason: string;
  /** 0..1 */
  confidence: number;
}

export interface ClassificationResult extends RuleOutcome {
  itemId: string;
  source: "rule" | "manual";
  /** Regla que decidió (solo si source es "rule"; ausente si ninguna aplicó). */
  ruleId?: RuleId;
  /** Otras reglas que también aplicaron pero perdieron por prioridad. */
  alsoMatched?: RuleId[];
}

export interface RuleContext {
  config: ClassifyConfig;
  profile: UsageProfile;
  /** itemInstanceId de ítems marcados "siempre conservar". */
  protectedIds: ReadonlySet<string>;
  /** Copias de cada arma (por hash), ordenadas de mejor a peor. */
  weaponGroups: ReadonlyMap<number, readonly NormalizedItem[]>;
}

/** Regla pura: sin efectos secundarios; null si no aplica. */
export type Rule = (item: NormalizedItem, ctx: RuleContext) => RuleOutcome | null;

/** Interfaz de un clasificador, por si más adelante se añade otro tipo además de las reglas. */
export interface Classifier {
  classify(items: readonly NormalizedItem[]): ClassificationResult[];
}
