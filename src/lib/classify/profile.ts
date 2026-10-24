import type { ArmorStatKey } from "../inventory/constants";

export type Activity = "pve" | "grandmaster" | "pvp";
export type ClassKey = "titan" | "hunter" | "warlock";

export interface ClassProfile {
  /** ¿Juegas con esta clase? Si no, sus armaduras no se juzgan por stats. */
  enabled: boolean;
  activities: Activity[];
  /** Texto libre, solo informativo (las reglas no lo interpretan). */
  playstyle: string;
  /** Las 2–3 stats que más te importan en esta clase. */
  armorStatPriority: ArmorStatKey[];
  /** Sustituye al umbral global de basura para armaduras de esta clase. */
  minArmorTotal?: number;
}

export interface UsageProfile {
  /** Sube con cada cambio; sirve para saber con qué perfil se hizo un análisis. */
  version: number;
  classes: Record<ClassKey, ClassProfile>;
  /** Tipos de arma que usas en cada actividad (nombres como los muestra el juego). */
  weaponPreferences: Partial<Record<Activity, string[]>>;
  /** Perks que valoras; suman puntos al elegir la mejor copia de un arma duplicada. */
  favoredPerks: string[];
}

const defaultClass = (): ClassProfile => ({
  enabled: true,
  activities: ["pve"],
  playstyle: "",
  armorStatPriority: [],
});

export const DEFAULT_PROFILE: UsageProfile = {
  version: 1,
  classes: { titan: defaultClass(), hunter: defaultClass(), warlock: defaultClass() },
  weaponPreferences: {},
  favoredPerks: [],
};
