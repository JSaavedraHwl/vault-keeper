"use server";

import { hasValidSession } from "@/lib/bungie/session";
import { saveProfile } from "@/lib/classify/profile-store";

export type SaveProfileResult = { ok: true; version: number } | { ok: false; error: string };

export async function saveProfileAction(input: unknown): Promise<SaveProfileResult> {
  // Escribe en disco: solo con sesión iniciada.
  if (!(await hasValidSession())) {
    return { ok: false, error: "Tu sesión expiró. Inicia sesión de nuevo." };
  }
  const result = await saveProfile(input);
  return result.ok ? { ok: true, version: result.profile.version } : result;
}
