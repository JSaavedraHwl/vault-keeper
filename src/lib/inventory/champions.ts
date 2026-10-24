// Capacidad de las armas contra campeones. Módulo puro (sin dependencias del servidor).
//
// Una arma puede traer la capacidad por tres vías, y una cuarta depende de la cuenta:
//   - "item":     la definición del arma (o sus categorías) la otorga de serie (exóticas).
//   - "plug":     un rasgo que lleva puesto lo dice en su texto: «Efectivo contra [Aturdimiento] campeones imparables».
//   - "instance": la API la informa en la instancia del ítem (`breakerType`).
//   - "artifact": una ventaja del artefacto que tienes ACTIVA para ese tipo de arma (depende del personaje).

export type Champion = "barrier" | "unstoppable" | "overload";
export type ChampionVia = "item" | "plug" | "instance" | "artifact";

export interface ChampionCap {
  type: Champion;
  via: ChampionVia[];
}

export const CHAMPIONS: readonly Champion[] = ["barrier", "unstoppable", "overload"];

export const CHAMPION_LABELS: Record<Champion, string> = {
  barrier: "Barrera",
  unstoppable: "Imparable",
  overload: "Sobrecarga",
};

/** Valor del enum DestinyBreakerType de la API → campeón. */
export const CHAMPION_BY_BREAKER: Record<number, Champion> = {
  1: "barrier", // ShieldPiercing · «Perforación de escudos»
  2: "overload", // Disruption · «Perturbación»
  3: "unstoppable", // Stagger · «Aturdimiento»
};

/** Categorías de ítem «Triturador: ...» que otorgan la capacidad. */
export const CHAMPION_BY_CATEGORY: Record<number, Champion> = {
  1793728308: "barrier",
  964228942: "overload",
  2906646562: "unstoppable",
};

export function addCap(caps: ChampionCap[], type: Champion, via: ChampionVia): void {
  const existing = caps.find((c) => c.type === type);
  if (!existing) caps.push({ type, via: [via] });
  else if (!existing.via.includes(via)) existing.via.push(via);
}

/** Campeones que un texto declara con la etiqueta exacta de la API, p. ej. «[Aturdimiento]». */
export function championsInText(text: string | undefined, breakerNames: Record<number, { name: string }>): Champion[] {
  if (!text) return [];
  const found: Champion[] = [];
  for (const [breaker, champion] of Object.entries(CHAMPION_BY_BREAKER)) {
    const name = breakerNames[Number(breaker)]?.name;
    if (name && text.includes(`[${name}]`) && !found.includes(champion)) found.push(champion);
  }
  return found;
}

export interface ChampionSources {
  /** breakerType de la definición del arma. */
  itemBreaker?: number;
  categoryHashes?: readonly number[];
  /** breakerType de la instancia (lo que la API dice que tiene ahora). */
  instanceBreaker?: number;
  /** Textos de los rasgos que lleva puestos. */
  plugDescriptions?: readonly (string | undefined)[];
  breakerNames: Record<number, { name: string }>;
}

/** Capacidad propia del arma (todo menos el artefacto, que depende del personaje). */
export function detectChampions(src: ChampionSources): ChampionCap[] {
  const caps: ChampionCap[] = [];
  const fromBreaker = (value: number | undefined) => (value ? CHAMPION_BY_BREAKER[value] : undefined);

  const item = fromBreaker(src.itemBreaker);
  if (item) addCap(caps, item, "item");
  for (const hash of src.categoryHashes ?? []) {
    const c = CHAMPION_BY_CATEGORY[hash];
    if (c) addCap(caps, c, "item");
  }
  const instance = fromBreaker(src.instanceBreaker);
  if (instance) addCap(caps, instance, "instance");
  for (const text of src.plugDescriptions ?? []) {
    for (const c of championsInText(text, src.breakerNames)) addCap(caps, c, "plug");
  }
  return caps;
}

// ---------------------------------------------------------------------------------------------
// Ventajas de artefacto
// ---------------------------------------------------------------------------------------------

export interface ArtifactChampionPerk {
  hash: number;
  name: string;
  champion: Champion;
  /** Nombre del tipo de arma como lo muestra el juego («Fusil de pulsos»). */
  weaponType: string;
}

const strip = (s: string) =>
  s
    .toLocaleLowerCase("es")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\s+/g, " ")
    .trim();

// El nombre de la ventaja termina con la capacidad: «... antibarrera», «... imparable», «... de sobrecarga».
const SUFFIXES: [RegExp, Champion][] = [
  [/\s+(?:de\s+)?antibarrera$/, "barrier"],
  [/\s+(?:de\s+)?imparable$/, "unstoppable"],
  [/\s+(?:de\s+)?sobrecarga$/, "overload"],
];

/** ¿Parece una ventaja de campeón (aunque no logremos interpretarla)? */
export const looksLikeChampionPerk = (name: string) => /antibarrera|imparable|sobrecarga|campe[oó]n/i.test(name);

/**
 * Interpreta «Fusiles de rastreo de sobrecarga» → { overload, "Fusil de rastreo" }.
 * Devuelve null si no es de campeón o si no se puede relacionar con un único tipo de arma
 * (mejor no adivinar: esas ventajas se reportan aparte).
 */
export function parseArtifactPerk(
  name: string,
  weaponTypes: readonly string[],
): { champion: Champion; weaponType: string } | null {
  const normalized = strip(name);
  const match = SUFFIXES.map(([rx, champion]) => ({ rx, champion })).find(({ rx }) => rx.test(normalized));
  if (!match) return null;
  const phrase = normalized.replace(match.rx, "");

  // El nombre puede venir en plural («Fusiles de rastreo»): se prueban las formas del primer sustantivo.
  const [first, ...rest] = phrase.split(" ");
  const candidates = new Set([phrase]);
  if (first.endsWith("es")) candidates.add([first.slice(0, -2), ...rest].join(" "));
  if (first.endsWith("s")) candidates.add([first.slice(0, -1), ...rest].join(" "));

  const types = weaponTypes.map((t) => ({ t, n: strip(t) }));
  for (const c of candidates) {
    const exact = types.filter((x) => x.n === c);
    if (exact.length === 1) return { champion: match.champion, weaponType: exact[0].t };
  }
  // «Arco imparable» se refiere al «Arco de combate»: prefijo, pero solo si es único.
  for (const c of candidates) {
    const prefixed = types.filter((x) => x.n.startsWith(`${c} `));
    if (prefixed.length === 1) return { champion: match.champion, weaponType: prefixed[0].t };
  }
  return null;
}

export interface ArtifactChampions {
  perks: ArtifactChampionPerk[];
  /** Ventajas que parecen de campeón pero no se pudieron interpretar. */
  unparsed: string[];
}

/** Ventajas de campeón del artefacto vigente. */
export function artifactChampionPerks(
  perkHashes: readonly number[],
  items: Record<number, { name: string } | undefined>,
  weaponTypes: readonly string[],
): ArtifactChampions {
  const perks: ArtifactChampionPerk[] = [];
  const unparsed: string[] = [];
  for (const hash of perkHashes) {
    const name = items[hash]?.name;
    if (!name || !looksLikeChampionPerk(name)) continue;
    const parsed = parseArtifactPerk(name, weaponTypes);
    if (parsed) perks.push({ hash, name, ...parsed });
    else unparsed.push(name);
  }
  return { perks, unparsed };
}

export interface PotentialChampion {
  type: Champion;
  /** Ventaja de artefacto que habría que activar. */
  perk: string;
}

export interface ChampionStatus {
  /** Lo que puede hacer ahora (propio del arma + ventajas de artefacto activas). */
  now: ChampionCap[];
  /** Lo que podría hacer si se activara una ventaja de artefacto que ahora no está activa. */
  potential: PotentialChampion[];
}

/** Capacidad de un arma para un personaje concreto (las ventajas de artefacto son por personaje). */
export function championStatus(
  weapon: { type: string; champions?: readonly ChampionCap[] },
  perks: readonly ArtifactChampionPerk[],
  activePerkHashes: ReadonlySet<number>,
): ChampionStatus {
  const now: ChampionCap[] = (weapon.champions ?? []).map((c) => ({ type: c.type, via: [...c.via] }));
  const potential: PotentialChampion[] = [];

  for (const perk of perks) {
    if (perk.weaponType !== weapon.type) continue;
    if (activePerkHashes.has(perk.hash)) addCap(now, perk.champion, "artifact");
    else potential.push({ type: perk.champion, perk: perk.name });
  }
  // Si ya la tiene ahora, no es «potencial».
  return { now, potential: potential.filter((p) => !now.some((c) => c.type === p.type)) };
}
