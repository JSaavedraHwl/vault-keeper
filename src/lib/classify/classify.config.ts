import type { ItemTier } from "../inventory/types";
import type { RuleId, Verdict } from "./types";

export interface ClassifyConfig {
  /** Orden de prioridad: la primera regla que aplica decide. */
  rulePriority: RuleId[];
  /** Por debajo de esta confianza el veredicto pasa a needs_review. */
  minConfidence: number;
  /** Los exóticos nunca se sugieren como basura (junk → archive). */
  neverJunkExotics: boolean;
  /** Siempre `keep`, por hash o por nombre exacto. */
  exceptions: { hashes: number[]; names: string[] };
  lowRarity: { tiers: ItemTier[] };
  armor: {
    /** Total de stats por debajo del cual la armadura es basura. */
    junkBelowTotal: number;
    /** Total desde el cual la armadura se conserva. */
    keepFromTotal: number;
    /** Suma mínima de las stats prioritarias de la clase para considerarla útil. */
    priorityMinSum: number;
    /** Qué hacer con armaduras de una clase que no juegas. */
    disabledClassVerdict: Verdict;
  };
  duplicates: {
    /** Puntos por cada perk activo que esté en `profile.favoredPerks`. */
    perkWeight: number;
    /** Puntos por cada punto de stat del arma. */
    statWeight: number;
    /** Puntos por cada punto de poder. */
    powerWeight: number;
    /** Diferencia mínima de puntaje para marcar una copia como basura (si no, archive). */
    surplusGap: number;
  };
  obsolete: {
    hashes: number[];
    /** Expresiones regulares (sin distinguir mayúsculas) sobre el nombre. */
    namePatterns: string[];
    /** Armas y armaduras con poder menor a este valor; null = desactivado. */
    belowPower: number | null;
    verdict: "archive" | "junk";
  };
  /** Qué hacer con ítems que no son armas ni armaduras (mods, consumibles...). */
  otherItems: { verdict: Verdict };
}

export const DEFAULT_CONFIG: ClassifyConfig = {
  rulePriority: [
    "protected",
    "exceptions",
    "obsolete",
    "lowRarity",
    "armor",
    "duplicateSurplus",
    "weaponPreference",
    "bestCopy",
    "otherItems",
  ],
  minConfidence: 0.5,
  neverJunkExotics: true,
  exceptions: { hashes: [], names: [] },
  lowRarity: { tiers: ["common", "uncommon", "rare"] },
  armor: {
    junkBelowTotal: 60,
    keepFromTotal: 68,
    priorityMinSum: 40,
    disabledClassVerdict: "archive",
  },
  duplicates: { perkWeight: 10, statWeight: 0.2, powerWeight: 0.05, surplusGap: 3 },
  obsolete: { hashes: [], namePatterns: [], belowPower: null, verdict: "archive" },
  otherItems: { verdict: "keep" },
};

/** Configuración activa: edita los valores de aquí o pásalos como override. */
export const classifyConfig: ClassifyConfig = DEFAULT_CONFIG;
