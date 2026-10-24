import { getDestinyProfileWithMembership } from "../bungie/profile";
import { getAccessToken } from "../bungie/session";
import { getManifest } from "../manifest";
import { getCharacters } from "./characters";
import { VAULT_BUCKET_HASH } from "./constants";
import { normalizeItem } from "./normalize";
import type { CharacterInfo, NormalizedItem } from "./types";

export interface VaultData {
  items: NormalizedItem[];
  characters: CharacterInfo[];
  accessToken: string;
  membershipType: number;
}

/** Una sola lectura de la cuenta: ítems del alijo, personajes con espacio libre y datos para actuar. */
export async function loadVaultData(): Promise<VaultData> {
  const { accessToken } = await getAccessToken();
  const [{ profile, membershipType }, manifest] = await Promise.all([
    getDestinyProfileWithMembership(accessToken),
    getManifest(),
  ]);

  if (!profile.profileInventory?.data) {
    throw new Error("Bungie no devolvió el inventario (¿perfil privado o sin permisos de lectura?).");
  }

  const items = profile.profileInventory.data.items
    .filter((item) => item.bucketHash === VAULT_BUCKET_HASH)
    .map((item) => normalizeItem(item, profile, manifest))
    .filter((item): item is NormalizedItem => item !== null);

  return { items, characters: getCharacters(profile, manifest), accessToken, membershipType };
}

/** Ítems del alijo del usuario con sesión iniciada, ya normalizados. */
export async function getVaultItems(): Promise<NormalizedItem[]> {
  return (await loadVaultData()).items;
}
