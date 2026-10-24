// Datos de ejemplo REALISTAS (nombres e íconos del manifest) para ver cómo se ve la interfaz sin sesión.
// Solo se usa desde la ruta de vista previa, que no existe en producción.

import type { AnalysisData } from "../classify/analyze-vault";
import { classifyWithRules } from "../classify/run";
import { DEFAULT_PROFILE } from "../classify/profile";
import { artifactChampionPerks, detectChampions } from "../inventory/champions";
import { weaponTypesOf, type GearData } from "../inventory/gear";
import { SLOT_BY_BUCKET } from "../inventory/constants";
import type { Ammo, CharacterInfo, ItemTier, NormalizedItem } from "../inventory/types";
import { getManifest, type Manifest } from "../manifest";
import type { SlimItemDef } from "../manifest/types";

const ORIGIN = "https://www.bungie.net";
const TIERS: Record<number, ItemTier> = { 2: "common", 3: "uncommon", 4: "rare", 5: "legendary", 6: "exotic" };
const AMMO: Record<number, Ammo> = { 1: "primary", 2: "special", 3: "heavy" };
const ELEMENTS = ["Solar", "Arco", "Vacío", "Estasis", "Disformidad", "Cinético"];
const CLASSES = ["titan", "hunter", "warlock"] as const;
const PERKS = ["Cargador de tubo", "Tiro rápido", "Cámara de eco", "Ráfaga nerviosa", "Mano firme", "Estabilizador", "Furia", "Subrutina de pruebas", "Cazador de cabezas", "Torrente"];
const WEAPON_STATS = ["Impacto", "Alcance", "Estabilidad", "Manejo", "Recarga", "Cadencia"];
const ARMOR_NAMES = ["Armas", "Salud", "Clase", "Granada", "Superhabilidad", "Cuerpo a cuerpo"];

// Generador determinista: la vista previa es siempre igual.
function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const WEAPON_BUCKETS = new Set([1498876634, 2465295065, 953998645]);
const ARMOR_BUCKETS = new Set([3448274439, 3551918588, 14239492, 20886954, 1585787867]);

function pick(manifest: Manifest, isWeapon: boolean, count: number, seed: number): SlimItemDef[] {
  const r = rng(seed);
  const pool = Object.values(manifest.items).filter(
    (d) =>
      d.icon &&
      d.tierType >= 5 &&
      d.bucketHash !== undefined &&
      (isWeapon ? d.itemType === 3 && WEAPON_BUCKETS.has(d.bucketHash) : d.itemType === 2 && ARMOR_BUCKETS.has(d.bucketHash)),
  );
  // Repartir por tipo para que haya variedad; los exóticos aparecen algo más.
  const byType = new Map<string, SlimItemDef[]>();
  for (const d of pool) byType.set(d.itemTypeDisplayName ?? "?", [...(byType.get(d.itemTypeDisplayName ?? "?") ?? []), d]);
  const out: SlimItemDef[] = [];
  const types = [...byType.keys()].sort();
  for (let i = 0; out.length < count && i < count * 6; i++) {
    const list = byType.get(types[i % types.length])!;
    const d = list[Math.floor(r() * list.length)];
    if (!out.includes(d)) out.push(d);
  }
  return out;
}

function toItem(d: SlimItemDef, i: number, r: () => number, manifest: Manifest, over: Partial<NormalizedItem> = {}): NormalizedItem {
  const weapon = d.itemType === 3;
  const tier = TIERS[d.tierType] ?? "legendary";
  const stats = weapon
    ? WEAPON_STATS.map((name) => ({ name, value: 20 + Math.floor(r() * 75) }))
    : ARMOR_NAMES.map((name) => ({ name, value: 2 + Math.floor(r() * 28) }));
  const gearTier = 1 + Math.floor(r() * 5);
  const base: NormalizedItem = {
    id: `p${d.hash}-${i}`,
    hash: d.hash,
    name: d.name,
    icon: ORIGIN + d.icon,
    kind: weapon ? "weapon" : "armor",
    type: d.itemTypeDisplayName ?? (weapon ? "Arma" : "Armadura"),
    slot: SLOT_BY_BUCKET[d.bucketHash!] ?? "other",
    tier,
    power: 1960 + Math.floor(r() * 50),
    gearTier,
    classType: weapon ? null : CLASSES[d.classType as 0 | 1 | 2] ?? null,
    perks: Array.from({ length: weapon ? 4 : 2 }, () => ({ name: PERKS[Math.floor(r() * PERKS.length)] })),
    stats,
    ...(weapon
      ? { element: ELEMENTS[Math.floor(r() * ELEMENTS.length)], ...(AMMO[d.ammoType ?? 0] && { ammo: AMMO[d.ammoType!] }) }
      : { armorTotal: stats.reduce((s, x) => s + x.value, 0) }),
    quantity: 1,
    locked: r() < 0.25,
    equipped: false,
    location: "vault",
    ...over,
  };
  if (weapon) {
    const caps = detectChampions({
      itemBreaker: d.breakerType,
      categoryHashes: d.categoryHashes,
      plugDescriptions: [],
      breakerNames: manifest.breakers ?? {},
    });
    if (caps.length === 0 && r() < 0.18) caps.push({ type: (["barrier", "unstoppable", "overload"] as const)[Math.floor(r() * 3)], via: ["plug"] });
    if (caps.length) base.champions = caps;
  }
  return base;
}

export async function previewGear(): Promise<GearData> {
  const manifest = await getManifest();
  const r = rng(7);
  const weapons = pick(manifest, true, 42, 11).map((d, i) => toItem(d, i, r, manifest));

  const characters = [
    { id: "pv-warlock", classType: "warlock", light: 2012 },
    { id: "pv-titan", classType: "titan", light: 1996 },
    { id: "pv-hunter", classType: "hunter", light: 2003 },
  ] as const;

  // Equipado en el primer personaje: una por ranura.
  for (const slot of ["kinetic", "energy", "power"] as const) {
    const w = weapons.find((x) => x.slot === slot && x.location === "vault");
    if (w) Object.assign(w, { location: "character", characterId: characters[0].id, equipped: true });
  }
  weapons.filter((w) => w.slot === "energy").slice(1, 3).forEach((w) => Object.assign(w, { location: "character", characterId: characters[0].id }));
  weapons.filter((w) => w.slot === "kinetic").slice(1, 3).forEach((w) => Object.assign(w, { location: "character", characterId: characters[1].id }));

  const types = weaponTypesOf(manifest);
  const { perks, unparsed } = artifactChampionPerks(manifest.artifact?.perkHashes ?? [], manifest.items, types);
  const active = perks.slice(0, 3).map((p) => p.hash);

  return {
    generatedAt: new Date().toISOString(),
    items: weapons,
    characters: characters.map((c, i) => ({
      ...c,
      free: { kinetic: 6 - i, energy: 5, power: 7 },
      activeArtifactPerks: i === 0 ? active : [],
    })),
    artifact: { name: manifest.artifact?.name, perks, unparsed },
  };
}

export async function previewVaultItems(): Promise<NormalizedItem[]> {
  const manifest = await getManifest();
  const r = rng(21);
  const weapons = pick(manifest, true, 24, 31).map((d, i) => toItem(d, i, r, manifest));
  const armor = pick(manifest, false, 24, 41).map((d, i) => toItem(d, 100 + i, r, manifest));
  return [...weapons, ...armor];
}

export async function previewCleanup(): Promise<AnalysisData> {
  const items = await previewVaultItems();
  // Algo de variedad para que haya basura, archivo y revisión.
  const r = rng(5);
  items.forEach((it, i) => {
    if (i % 5 === 0) Object.assign(it, { tier: "rare" as ItemTier });
    if (it.kind === "armor") {
      const total = 52 + Math.floor(r() * 30);
      it.stats = ARMOR_NAMES.map((name, j) => ({ name, value: Math.round(total / 6) + (j === 0 ? total % 6 : 0) }));
      it.armorTotal = total;
      it.gearTier = total > 74 ? 5 : total > 69 ? 4 : total > 63 ? 3 : total > 57 ? 2 : 1;
    }
  });
  const characters: CharacterInfo[] = [
    { id: "pv-warlock", classType: "warlock", light: 2012, free: { kinetic: 6, energy: 5, power: 7 } },
    { id: "pv-titan", classType: "titan", light: 1996, free: { kinetic: 4, energy: 5, power: 7 } },
  ];
  return {
    generatedAt: new Date().toISOString(),
    simulated: true,
    profileVersion: 2,
    items,
    ruleResults: classifyWithRules(items, { profile: DEFAULT_PROFILE }),
    overrides: { verdicts: {}, alwaysKeep: [] },
    characters,
    vaultLock: true,
    lastRunId: undefined,
  };
}

export async function previewWeaponTypes(): Promise<string[]> {
  return weaponTypesOf(await getManifest());
}
