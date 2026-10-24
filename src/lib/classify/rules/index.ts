import type { Rule, RuleId } from "../types";
import { armorRule } from "./armor";
import { obsoleteRule } from "./obsolete";
import { otherItemsRule } from "./other";
import { exceptionsRule, protectedRule } from "./protection";
import { lowRarityRule } from "./rarity";
import { bestCopyRule, duplicateSurplusRule, weaponPreferenceRule } from "./weapons";

export const RULES: Record<RuleId, Rule> = {
  protected: protectedRule,
  exceptions: exceptionsRule,
  obsolete: obsoleteRule,
  lowRarity: lowRarityRule,
  armor: armorRule,
  duplicateSurplus: duplicateSurplusRule,
  weaponPreference: weaponPreferenceRule,
  bestCopy: bestCopyRule,
  otherItems: otherItemsRule,
};
