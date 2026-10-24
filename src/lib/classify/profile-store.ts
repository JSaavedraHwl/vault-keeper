import { promises as fs } from "node:fs";
import path from "node:path";
import { DEFAULT_PROFILE, type UsageProfile } from "./profile";
import { usageProfileInputSchema, usageProfileSchema } from "./profile-schema";

export const PROFILE_FILE = path.join(process.cwd(), "profile", "usage-profile.json");

export interface LoadedProfile {
  profile: UsageProfile;
  /** Presente si el archivo existe pero no es válido (se usan los valores por defecto). */
  warning?: string;
}

export async function loadProfile(file = PROFILE_FILE): Promise<LoadedProfile> {
  let text: string;
  try {
    // La ruta es un parámetro (para los tests); el archivo no forma parte del build.
    text = await fs.readFile(/*turbopackIgnore: true*/ file, "utf8");
  } catch {
    return { profile: DEFAULT_PROFILE }; // aún no existe: valores por defecto
  }
  try {
    const parsed = usageProfileSchema.safeParse(JSON.parse(text));
    if (parsed.success) return { profile: parsed.data as UsageProfile };
    return {
      profile: DEFAULT_PROFILE,
      warning: `profile/usage-profile.json no es válido (${parsed.error.issues[0]?.message}). Se usan los valores por defecto.`,
    };
  } catch {
    return {
      profile: DEFAULT_PROFILE,
      warning: "profile/usage-profile.json no es JSON válido. Se usan los valores por defecto.",
    };
  }
}

export type SaveResult = { ok: true; profile: UsageProfile } | { ok: false; error: string };

/** Valida el perfil recibido, sube la versión y lo guarda de forma atómica. */
export async function saveProfile(input: unknown, file = PROFILE_FILE): Promise<SaveResult> {
  const parsed = usageProfileInputSchema.safeParse(input);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    return { ok: false, error: `${issue.path.join(".") || "perfil"}: ${issue.message}` };
  }
  const { profile: current } = await loadProfile(file);
  const profile = { ...parsed.data, version: current.version + 1 } as UsageProfile;

  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(profile, null, 2) + "\n");
  await fs.rename(tmp, file);
  return { ok: true, profile };
}
