import { AUDIT_FILE, lastRun, MOCK_AUDIT_FILE } from "../actions/audit";
import { loadCapabilities } from "../actions/capabilities";
import { isMockMode } from "../actions/service-io";
import { simCharacters, simVaultItems } from "../actions/sim-world";
import type { CharacterInfo, NormalizedItem } from "../inventory/types";
import { loadVaultData } from "../inventory/vault";
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
  /** Personajes con su espacio libre, para elegir destino. */
  characters: CharacterInfo[];
  /** ¿Se sabe que el alijo admite candado? undefined = aún no se ha probado. */
  vaultLock?: boolean;
  /** Última ejecución real registrada (habilita «Deshacer»). */
  lastRunId?: string;
}

export type AnalysisStage = "vault" | "profile" | "rules";

/** ¿Está activo el modo simulación? (datos de ejemplo, sin llamar a Bungie.) */
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
  let items: NormalizedItem[];
  let characters: CharacterInfo[];
  if (simulated) {
    items = simVaultItems();
    characters = simCharacters();
  } else {
    const data = await loadVaultData();
    items = data.items;
    characters = data.characters;
  }

  stage("profile");
  const auditFile = simulated || isMockMode() ? MOCK_AUDIT_FILE : AUDIT_FILE;
  const [{ profile }, overrides, capabilities, last] = await Promise.all([
    loadProfile(),
    loadOverrides(overridesFile(simulated)),
    simulated ? Promise.resolve({ vaultLock: true }) : loadCapabilities(),
    lastRun(auditFile),
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
    characters,
    vaultLock: capabilities.vaultLock,
    lastRunId: last?.runId,
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
