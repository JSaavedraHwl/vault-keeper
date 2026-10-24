import {
  getDestinyManifest,
  getDestinyManifestSlice,
  type DestinyInventoryItemDefinition,
} from "bungie-api-ts/destiny2";
import { createHttpClient } from "../bungie/client";
import {
  MANIFEST_LANGUAGE,
  MANIFEST_SCHEMA,
  type Manifest,
  type SlimItemDef,
  type SlimNamedDef,
  type SlimSocketTypeDef,
  type SlimArtifactDef,
  type SlimStatDef,
} from "./types";

const TABLES = [
  "DestinyInventoryItemDefinition",
  "DestinyStatDefinition",
  "DestinyItemCategoryDefinition",
  "DestinySocketCategoryDefinition",
  "DestinySocketTypeDefinition",
  "DestinyInventoryBucketDefinition",
  "DestinyBreakerTypeDefinition",
  "DestinyDamageTypeDefinition",
  "DestinyArtifactDefinition",
] as const;

export async function fetchRemoteVersion(): Promise<string> {
  const { Response } = await getDestinyManifest(createHttpClient());
  return Response.version;
}

function slimItem(d: DestinyInventoryItemDefinition): SlimItemDef | null {
  const name = d.displayProperties?.name;
  if (!name) return null;
  return {
    hash: d.hash,
    name,
    description: d.plug ? d.displayProperties.description || undefined : undefined,
    icon: d.displayProperties.icon || undefined,
    itemType: d.itemType,
    itemSubType: d.itemSubType,
    itemTypeDisplayName: d.itemTypeDisplayName || undefined,
    classType: d.classType,
    tierType: d.inventory?.tierType ?? 0,
    bucketHash: d.inventory?.bucketTypeHash,
    categoryHashes: d.itemCategoryHashes ?? [],
    plugCategory: d.plug?.plugCategoryIdentifier,
    socketCategories: (d.sockets?.socketCategories ?? []).map((c) => ({
      categoryHash: c.socketCategoryHash,
      socketIndexes: c.socketIndexes,
    })),
    ...(d.breakerType ? { breakerType: d.breakerType } : {}),
    ...(d.equippingBlock?.ammoType ? { ammoType: d.equippingBlock.ammoType } : {}),
  };
}

/** Descarga las tablas necesarias en español y las reduce al formato `Manifest`. */
export async function downloadManifest(): Promise<Manifest> {
  const http = createHttpClient();
  const { Response: destinyManifest } = await getDestinyManifest(http);
  const tables = await getDestinyManifestSlice(http, {
    destinyManifest,
    tableNames: [...TABLES],
    language: MANIFEST_LANGUAGE,
  });

  const items: Record<number, SlimItemDef> = {};
  for (const def of Object.values(tables.DestinyInventoryItemDefinition)) {
    const slim = slimItem(def);
    if (slim) items[slim.hash] = slim;
  }

  const stats: Record<number, SlimStatDef> = {};
  for (const def of Object.values(tables.DestinyStatDefinition)) {
    stats[def.hash] = {
      hash: def.hash,
      name: def.displayProperties.name,
      description: def.displayProperties.description || undefined,
      icon: def.displayProperties.icon || undefined,
    };
  }

  const named = (table: Record<number, { hash: number; displayProperties?: { name: string } }>) => {
    const out: Record<number, SlimNamedDef> = {};
    for (const def of Object.values(table)) {
      out[def.hash] = { hash: def.hash, name: def.displayProperties?.name ?? "" };
    }
    return out;
  };

  const socketTypes: Record<number, SlimSocketTypeDef> = {};
  for (const def of Object.values(tables.DestinySocketTypeDefinition)) {
    socketTypes[def.hash] = {
      hash: def.hash,
      plugCategories: (def.plugWhitelist ?? []).map((w) => w.categoryIdentifier),
    };
  }

  const buckets: Manifest["buckets"] = {};
  for (const def of Object.values(tables.DestinyInventoryBucketDefinition)) {
    buckets[def.hash] = {
      hash: def.hash,
      name: def.displayProperties?.name ?? "",
      itemCount: def.itemCount,
    };
  }

  // Tipos de campeón y elementos, indexados por el valor de su enum (es lo que trae la instancia del ítem).
  const breakers: Manifest["breakers"] = {};
  for (const def of Object.values(tables.DestinyBreakerTypeDefinition)) {
    breakers[def.enumValue] = { hash: def.hash, name: def.displayProperties?.name ?? "" };
  }
  const damageTypes: Manifest["damageTypes"] = {};
  for (const def of Object.values(tables.DestinyDamageTypeDefinition)) {
    damageTypes[def.enumValue] = { hash: def.hash, name: def.displayProperties?.name ?? "" };
  }

  // Solo hay un artefacto vigente por temporada.
  const artifactDef = Object.values(tables.DestinyArtifactDefinition)[0];
  const artifact: SlimArtifactDef | undefined = artifactDef && {
    hash: artifactDef.hash,
    name: artifactDef.displayProperties?.name ?? "",
    perkHashes: artifactDef.tiers.flatMap((t) => t.items.map((i) => i.itemHash)),
  };

  return {
    schema: MANIFEST_SCHEMA,
    version: destinyManifest.version,
    language: MANIFEST_LANGUAGE,
    items,
    stats,
    itemCategories: named(tables.DestinyItemCategoryDefinition),
    socketCategories: named(tables.DestinySocketCategoryDefinition),
    socketTypes,
    buckets,
    breakers,
    damageTypes,
    ...(artifact && { artifact }),
  };
}
