"use server";

import { overridesFile } from "@/lib/classify/analyze-vault";
import { setAlwaysKeep, setManualVerdict } from "@/lib/classify/overrides";
import type { ManualVerdict, Overrides } from "@/lib/classify/overrides-pure";
import { canAccess, wantsSimulation } from "./access";

export type OverrideResult = { ok: true; overrides: Overrides } | { ok: false; error: string };

const VERDICTS = new Set(["keep", "archive", "junk"]);

async function guard(simulated: boolean, itemId: unknown): Promise<string | null> {
  if (typeof itemId !== "string" || itemId.length === 0 || itemId.length > 64) return "Ítem no válido.";
  if (!(await canAccess(simulated))) return "Tu sesión expiró. Inicia sesión de nuevo.";
  return null;
}

/** Fija (o quita, con null) el veredicto manual de un ítem. */
export async function setVerdictAction(
  itemId: string,
  verdict: ManualVerdict | null,
  simulate: boolean,
): Promise<OverrideResult> {
  const simulated = wantsSimulation(simulate);
  const error = await guard(simulated, itemId);
  if (error) return { ok: false, error };
  if (verdict !== null && !VERDICTS.has(verdict)) return { ok: false, error: "Veredicto no válido." };
  return { ok: true, overrides: await setManualVerdict(itemId, verdict, overridesFile(simulated)) };
}

/** Marca o desmarca «siempre conservar». */
export async function setAlwaysKeepAction(
  itemId: string,
  on: boolean,
  simulate: boolean,
): Promise<OverrideResult> {
  const simulated = wantsSimulation(simulate);
  const error = await guard(simulated, itemId);
  if (error) return { ok: false, error };
  return { ok: true, overrides: await setAlwaysKeep(itemId, Boolean(on), overridesFile(simulated)) };
}
