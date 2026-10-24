import { vaultFixtures } from "../../../fixtures/vault-items";
import type { NormalizedItem } from "../inventory/types";
import { getVaultItems } from "../inventory/vault";
import {
  loadOverrides,
  OVERRIDES_FILE,
  SIMULATION_OVERRIDES_FILE,
} from "./overrides";
import { loadProfile } from "./profile-store";
import { analyze, type AnalysisReport } from "./run";

export interface VaultAnalysis {
  items: NormalizedItem[];
  report: AnalysisReport;
  simulated: boolean;
}

/** ¿Está activo el modo simulación? (datos de `fixtures/`, sin llamar a Bungie.) */
export const isSimulation = () => process.env.CLASSIFY_SIMULATION === "1";

/** Lee el alijo (real o de ejemplo), carga perfil y correcciones, y aplica las reglas. */
export async function analyzeVault(options: { simulate?: boolean } = {}): Promise<VaultAnalysis> {
  const simulated = options.simulate ?? isSimulation();
  const items = simulated ? vaultFixtures : await getVaultItems();
  const [{ profile }, overrides] = await Promise.all([
    loadProfile(),
    loadOverrides(simulated ? SIMULATION_OVERRIDES_FILE : OVERRIDES_FILE),
  ]);
  return { items, report: analyze(items, { profile, overrides }), simulated };
}
