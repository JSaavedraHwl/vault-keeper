import { getDestinyProfile } from "../bungie/profile";
import { getAccessToken } from "../bungie/session";
import { getManifest } from "../manifest";
import { VAULT_BUCKET_HASH } from "./constants";
import { normalizeItem } from "./normalize";
import type { NormalizedItem } from "./types";

/** Ítems del alijo del usuario con sesión iniciada, ya normalizados. */
export async function getVaultItems(): Promise<NormalizedItem[]> {
  const { accessToken } = await getAccessToken();
  const [profile, manifest] = await Promise.all([getDestinyProfile(accessToken), getManifest()]);

  const raw = profile.profileInventory?.data?.items ?? [];
  if (!profile.profileInventory?.data) {
    throw new Error("Bungie no devolvió el inventario (¿perfil privado o sin permisos de lectura?).");
  }

  return raw
    .filter((item) => item.bucketHash === VAULT_BUCKET_HASH)
    .map((item) => normalizeItem(item, profile, manifest))
    .filter((item): item is NormalizedItem => item !== null);
}
