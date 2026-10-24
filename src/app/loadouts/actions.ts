"use server";

import { hasValidSession } from "@/lib/bungie/session";
import { deleteLoadout, saveLoadout } from "@/lib/loadouts/store";
import type { Loadout } from "@/lib/loadouts/types";

export type SaveLoadoutResult = { ok: true; loadout: Loadout } | { ok: false; error: string };

const NO_SESSION = "Tu sesión expiró. Inicia sesión de nuevo.";

/** Crea o actualiza un loadout. Escribe en disco, así que exige sesión; la validación la hace el almacén. */
export async function saveLoadoutAction(input: unknown): Promise<SaveLoadoutResult> {
  if (!(await hasValidSession())) return { ok: false, error: NO_SESSION };
  return saveLoadout(input);
}

export async function deleteLoadoutAction(id: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!(await hasValidSession())) return { ok: false, error: NO_SESSION };
  if (typeof id !== "string" || !id || id.length > 64) return { ok: false, error: "Loadout no válido." };
  const result = await deleteLoadout(id);
  return result.ok ? { ok: true } : { ok: false, error: "Ese loadout ya no existe." };
}
