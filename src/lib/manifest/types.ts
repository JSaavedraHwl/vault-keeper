export const MANIFEST_LANGUAGE = "es" as const;

/** Definición de ítem reducida a lo que usa la app (el original pesa decenas de MB). */
export interface SlimItemDef {
  hash: number;
  name: string;
  description?: string; // solo en plugs (perks, mods)
  icon?: string; // ruta relativa a bungie.net
  itemType: number; // DestinyItemType
  itemSubType: number; // DestinyItemSubType
  itemTypeDisplayName?: string; // "Rifle de pulsos", "Casco"...
  classType: number; // DestinyClass: 0 titán, 1 cazador, 2 hechicero, 3 desconocida
  tierType: number; // TierType: 5 legendario, 6 exótico...
  bucketHash?: number;
  categoryHashes: number[];
  plugCategory?: string; // plug.plugCategoryIdentifier
  socketCategories: { categoryHash: number; socketIndexes: number[] }[];
  /** DestinyBreakerType propio del ítem (1 barrera, 2 sobrecarga, 3 imparable); ausente si no tiene. */
  breakerType?: number;
  /** DestinyAmmunitionType del arma (1 principal, 2 especial, 3 pesada); ausente si no es un arma. */
  ammoType?: number;
}

export interface SlimStatDef {
  hash: number;
  name: string;
  description?: string;
  icon?: string;
}

export interface SlimNamedDef {
  hash: number;
  name: string;
}

export interface SlimSocketTypeDef {
  hash: number;
  /** Categorías de plug que admite el socket (plugWhitelist). */
  plugCategories: string[];
}

/** Sube cuando cambia la forma de `Manifest`: una caché con otro esquema se descarga de nuevo. */
export const MANIFEST_SCHEMA = 4;

export interface SlimBucketDef {
  hash: number;
  name: string;
  /** Cuántos ítems caben (incluido el equipado, en los buckets de equipo). */
  itemCount: number;
}

/** El artefacto de la temporada actual y todas sus ventajas (hash de ítem). */
export interface SlimArtifactDef {
  hash: number;
  name: string;
  perkHashes: number[];
}

export interface Manifest {
  schema: number;
  version: string;
  language: string;
  items: Record<number, SlimItemDef>;
  stats: Record<number, SlimStatDef>;
  itemCategories: Record<number, SlimNamedDef>;
  socketCategories: Record<number, SlimNamedDef>;
  socketTypes: Record<number, SlimSocketTypeDef>;
  buckets: Record<number, SlimBucketDef>;
  /** Tipos de campeón, por valor del enum DestinyBreakerType: sus nombres aparecen entre [corchetes] en los textos. */
  breakers: Record<number, SlimNamedDef>;
  /** Elementos, por valor del enum DamageType. */
  damageTypes: Record<number, SlimNamedDef>;
  artifact?: SlimArtifactDef;
}
