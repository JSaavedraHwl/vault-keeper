import type { DestinyProfileResponse } from "bungie-api-ts/destiny2";
import type { Manifest } from "../manifest";
import { SLOT_BY_BUCKET } from "./constants";
import type { CharacterInfo, ItemSlot } from "./types";

const CLASSES = ["titan", "hunter", "warlock"] as const;

/** Bucket de cada ranura de equipo (inverso de SLOT_BY_BUCKET). */
const BUCKET_BY_SLOT = Object.fromEntries(
  Object.entries(SLOT_BY_BUCKET).map(([bucket, slot]) => [slot, Number(bucket)]),
) as Partial<Record<ItemSlot, number>>;

/**
 * Personajes con su espacio libre por ranura: capacidad del bucket (del manifest) menos
 * lo que hay en el inventario y lo equipado. Si falta algún dato, esa ranura se omite
 * (el planificador la trata como sin espacio, nunca como infinita).
 */
export function getCharacters(profile: DestinyProfileResponse, manifest: Manifest): CharacterInfo[] {
  const characters = Object.values(profile.characters?.data ?? {}).sort(
    (a, b) => Date.parse(b.dateLastPlayed) - Date.parse(a.dateLastPlayed),
  );

  return characters.map((c) => {
    const inventory = profile.characterInventories?.data?.[c.characterId]?.items ?? [];
    const equipment = profile.characterEquipment?.data?.[c.characterId]?.items ?? [];
    const free: CharacterInfo["free"] = {};

    for (const [slot, bucket] of Object.entries(BUCKET_BY_SLOT) as [ItemSlot, number][]) {
      const capacity = manifest.buckets[bucket]?.itemCount;
      if (capacity === undefined) continue;
      const used =
        inventory.filter((i) => i.bucketHash === bucket).length +
        equipment.filter((i) => i.bucketHash === bucket).length;
      free[slot] = Math.max(capacity - used, 0);
    }

    return { id: c.characterId, classType: CLASSES[c.classType as 0 | 1 | 2] ?? "titan", light: c.light, free };
  });
}
