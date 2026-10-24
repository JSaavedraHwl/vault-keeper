import type { DestinyItemComponent, DestinyProfileResponse } from "bungie-api-ts/destiny2";
import type { Manifest } from "../manifest";
import {
  ARMOR_STAT_HASHES,
  HIDDEN_STAT_HASHES,
  ITEM_STATE_LOCKED,
  ITEM_TYPE_ARMOR,
  ITEM_TYPE_WEAPON,
  PERK_SOCKET_CATEGORIES,
  SLOT_BY_BUCKET,
} from "./constants";
import type { ItemTier, NormalizedItem } from "./types";

const BUNGIE_ORIGIN = "https://www.bungie.net";

const TIERS: Record<number, ItemTier> = {
  2: "common",
  3: "uncommon",
  4: "rare",
  5: "legendary",
  6: "exotic",
};

const CLASSES = ["titan", "hunter", "warlock"] as const;

export interface ItemPlace {
  location?: "vault" | "character";
  characterId?: string;
  equipped?: boolean;
}

export function normalizeItem(
  item: DestinyItemComponent,
  profile: DestinyProfileResponse,
  manifest: Manifest,
  place: ItemPlace = {},
): NormalizedItem | null {
  const def = manifest.items[item.itemHash];
  if (!def) return null; // ítem redactado o sin nombre

  const instanceId = item.itemInstanceId;
  const components = profile.itemComponents;
  const instance = instanceId ? components?.instances?.data?.[instanceId] : undefined;
  const rawStats = instanceId ? components?.stats?.data?.[instanceId]?.stats : undefined;
  const sockets = instanceId ? components?.sockets?.data?.[instanceId]?.sockets : undefined;

  const kind =
    def.itemType === ITEM_TYPE_WEAPON ? "weapon" : def.itemType === ITEM_TYPE_ARMOR ? "armor" : "other";

  // Perks activos: el plug insertado, habilitado y visible, en sockets de categoría de perks.
  const perks: NormalizedItem["perks"] = [];
  if (kind !== "other" && sockets) {
    const perkSocketIndexes = new Set(
      def.socketCategories
        .filter((c) => PERK_SOCKET_CATEGORIES.has(c.categoryHash))
        .flatMap((c) => c.socketIndexes),
    );
    sockets.forEach((socket, index) => {
      if (!perkSocketIndexes.has(index) || !socket.plugHash) return;
      if (socket.isEnabled === false || socket.isVisible === false) return;
      const plug = manifest.items[socket.plugHash];
      if (plug?.name) perks.push({ name: plug.name, description: plug.description });
    });
  }

  // Stats
  let stats: NormalizedItem["stats"] = [];
  let armorTotal: number | undefined;
  if (rawStats) {
    if (kind === "armor") {
      stats = ARMOR_STAT_HASHES.map((hash) => ({
        name: manifest.stats[hash]?.name ?? String(hash),
        value: rawStats[hash]?.value ?? 0,
      }));
      armorTotal = stats.reduce((sum, s) => sum + s.value, 0);
    } else if (kind === "weapon") {
      stats = Object.values(rawStats)
        .filter((s) => s.value > 0 && !HIDDEN_STAT_HASHES.has(s.statHash) && manifest.stats[s.statHash]?.name)
        .map((s) => ({ name: manifest.stats[s.statHash].name, value: s.value }));
    }
  }

  return {
    id: instanceId ?? String(item.itemHash),
    hash: item.itemHash,
    name: def.name,
    icon: def.icon ? BUNGIE_ORIGIN + def.icon : null,
    kind,
    type: def.itemTypeDisplayName ?? "Otro",
    slot: (def.bucketHash !== undefined && SLOT_BY_BUCKET[def.bucketHash]) || "other",
    tier: TIERS[def.tierType] ?? "common",
    power: instance?.primaryStat?.value ?? null,
    ...(instance?.gearTier !== undefined && { gearTier: instance.gearTier }),
    classType: kind === "armor" ? (CLASSES[def.classType] ?? null) : null,
    perks,
    stats,
    ...(armorTotal !== undefined && { armorTotal }),
    quantity: item.quantity,
    locked: (item.state & ITEM_STATE_LOCKED) !== 0,
    equipped: place.equipped ?? false,
    location: place.location ?? "vault",
    ...(place.characterId && { characterId: place.characterId }),
  };
}
