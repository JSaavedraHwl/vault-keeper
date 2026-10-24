import type { DestinyItemComponent, DestinyProfileResponse } from "bungie-api-ts/destiny2";
import { getDestinyProfileWithMembership } from "../bungie/profile";
import { getAccessToken } from "../bungie/session";
import { getManifest, type Manifest } from "../manifest";
import { artifactChampionPerks, type ArtifactChampionPerk } from "./champions";
import { getCharacters } from "./characters";
import { ITEM_TYPE_WEAPON, SLOT_BY_BUCKET, VAULT_BUCKET_HASH } from "./constants";
import { normalizeItem } from "./normalize";
import type { CharacterInfo, ItemSlot, NormalizedItem } from "./types";

export const WEAPON_SLOTS: readonly ItemSlot[] = ["kinetic", "energy", "power"];

export interface GearCharacter extends CharacterInfo {
  /** Hashes de las ventajas del artefacto que este personaje tiene activas. */
  activeArtifactPerks: number[];
}

export interface GearData {
  /** Armas del alijo y de los personajes (con `location`, `characterId` y `equipped`). */
  items: NormalizedItem[];
  characters: GearCharacter[];
  artifact: {
    name?: string;
    perks: ArtifactChampionPerk[];
    /** Ventajas que parecen de campeón pero no se pudieron interpretar. */
    unparsed: string[];
  };
}

/** Tipos de arma reales (legendarias y exóticas de las tres ranuras), tal como los nombra el juego. */
export function weaponTypesOf(manifest: Manifest): string[] {
  const types = new Set<string>();
  for (const d of Object.values(manifest.items)) {
    if (d.itemType !== ITEM_TYPE_WEAPON || d.tierType < 5 || !d.itemTypeDisplayName) continue;
    const slot = d.bucketHash !== undefined ? SLOT_BY_BUCKET[d.bucketHash] : undefined;
    if (slot && WEAPON_SLOTS.includes(slot)) types.add(d.itemTypeDisplayName);
  }
  return [...types].sort((a, b) => a.localeCompare(b, "es"));
}

const isWeaponBucket = (bucketHash: number) => WEAPON_SLOTS.includes(SLOT_BY_BUCKET[bucketHash]);

/** Armas del alijo y de los personajes, ya normalizadas. Función pura sobre el perfil. */
export function buildGearData(profile: DestinyProfileResponse, manifest: Manifest): GearData {
  const items: NormalizedItem[] = [];
  const add = (component: DestinyItemComponent, place: Parameters<typeof normalizeItem>[3]) => {
    const item = normalizeItem(component, profile, manifest, place);
    if (item && item.kind === "weapon" && WEAPON_SLOTS.includes(item.slot)) items.push(item);
  };

  for (const c of profile.profileInventory?.data?.items ?? []) {
    if (c.bucketHash === VAULT_BUCKET_HASH) add(c, { location: "vault" });
  }
  for (const [characterId, inv] of Object.entries(profile.characterInventories?.data ?? {})) {
    // Solo los buckets de armas: el correo (objetos perdidos) también está en el inventario del personaje.
    for (const c of inv.items.filter((i) => isWeaponBucket(i.bucketHash))) {
      add(c, { location: "character", characterId });
    }
  }
  for (const [characterId, eq] of Object.entries(profile.characterEquipment?.data ?? {})) {
    for (const c of eq.items.filter((i) => isWeaponBucket(i.bucketHash))) {
      add(c, { location: "character", characterId, equipped: true });
    }
  }

  const characters: GearCharacter[] = getCharacters(profile, manifest).map((c) => ({
    ...c,
    activeArtifactPerks: (profile.characterProgressions?.data?.[c.id]?.seasonalArtifact?.tiers ?? [])
      .flatMap((t) => t.items)
      .filter((i) => i.isActive)
      .map((i) => i.itemHash),
  }));

  const { perks, unparsed } = artifactChampionPerks(
    manifest.artifact?.perkHashes ?? [],
    manifest.items,
    weaponTypesOf(manifest),
  );

  return { items, characters, artifact: { name: manifest.artifact?.name, perks, unparsed } };
}

/** Lee la cuenta y devuelve las armas con todo lo necesario para filtrar y equipar. */
export async function loadGearData(): Promise<GearData & { accessToken: string; membershipType: number }> {
  const { accessToken } = await getAccessToken();
  const [{ profile, membershipType }, manifest] = await Promise.all([
    getDestinyProfileWithMembership(accessToken),
    getManifest(),
  ]);
  if (!profile.profileInventory?.data) {
    throw new Error("Bungie no devolvió el inventario (¿perfil privado o sin permisos de lectura?).");
  }
  return { ...buildGearData(profile, manifest), accessToken, membershipType };
}
