import { vaultFixtures } from "../../../fixtures/vault-items";
import type { NormalizedItem } from "../inventory/types";
import { getVaultItems } from "../inventory/vault";
import { loadOverrides, OVERRIDES_FILE, SIMULATION_OVERRIDES_FILE } from "./overrides";
import type { Overrides } from "./overrides-pure";
import { loadProfile } from "./profile-store";
import { analyze, classifyWithRules, type AnalysisReport } from "./run";
import type { ClassificationResult } from "./types";

/** Lo que recibe la UI: con esto puede recalcular al instante cuando cambian las correcciones. */
export interface AnalysisData {
  generatedAt: string;
  simulated: boolean;
  profileVersion: number;
  items: NormalizedItem[];
  /** Resultado de las reglas, sin correcciones manuales. */
  ruleResults: ClassificationResult[];
  overrides: Overrides;
}

export type AnalysisStage = "vault" | "profile" | "rules";

/** ¿Está activo el modo simulación? (datos de `fixtures/`, sin llamar a Bungie.) */
export const isSimulation = () => process.env.CLASSIFY_SIMULATION === "1";

export const overridesFile = (simulated: boolean) =>
  simulated ? SIMULATION_OVERRIDES_FILE : OVERRIDES_FILE;

/** Lee el alijo (real o de ejemplo), carga perfil y correcciones, y aplica las reglas. */
export async function loadAnalysisData(
  options: { simulate?: boolean; onStage?: (stage: AnalysisStage) => void } = {},
): Promise<AnalysisData> {
  const simulated = options.simulate ?? isSimulation();
  const stage = options.onStage ?? (() => {});

  stage("vault");
  const items = simulated ? vaultFixtures : await getVaultItems();

  stage("profile");
  const [{ profile }, overrides] = await Promise.all([
    loadProfile(),
    loadOverrides(overridesFile(simulated)),
  ]);

  stage("rules");
  const ruleResults = classifyWithRules(items, { profile });

  return {
    generatedAt: new Date().toISOString(),
    simulated,
    profileVersion: profile.version,
    items,
    ruleResults,
    overrides,
  };
}

/** Análisis completo (reglas + correcciones), para rutas de diagnóstico. */
export async function analyzeVault(
  options: { simulate?: boolean } = {},
): Promise<{ items: NormalizedItem[]; report: AnalysisReport; simulated: boolean }> {
  const data = await loadAnalysisData(options);
  const { profile } = await loadProfile();
  return {
    items: data.items,
    report: analyze(data.items, { profile, overrides: data.overrides }),
    simulated: data.simulated,
  };
}
