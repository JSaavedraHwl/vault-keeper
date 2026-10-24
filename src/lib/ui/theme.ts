// Colores del juego para la interfaz. Módulo puro.

import type { Champion } from "../inventory/champions";
import type { Ammo, ItemTier } from "../inventory/types";

/** Color de cada elemento (a partir del nombre en español que da el manifest). */
export function elementColor(name?: string): string {
  const n = (name ?? "").toLocaleLowerCase("es").normalize("NFD").replace(/[̀-ͯ]/g, "");
  if (/solar/.test(n)) return "#f0631e";
  if (/arco|arc\b/.test(n)) return "#79bde9";
  if (/vacio|void/.test(n)) return "#b184c5";
  if (/estasis|stasis/.test(n)) return "#4d87ff";
  if (/disformidad|hebra|tejido|strand/.test(n)) return "#35e366";
  if (/cinetic|kinetic/.test(n)) return "#d9dee8";
  return "#8895b4";
}

/** Color de cada capacidad contra campeones, como en el juego. */
export const CHAMPION_COLORS: Record<Champion, string> = {
  barrier: "#f59e0b", // naranja
  unstoppable: "#ef4444", // rojo
  overload: "#38bdf8", // azul
};

export const AMMO_COLORS: Record<Ammo, string> = {
  primary: "#e8edf8",
  special: "#59d68a",
  heavy: "#b98cf0",
};

export const TIER_LABELS: Record<ItemTier, string> = {
  common: "Común",
  uncommon: "Poco común",
  rare: "Raro",
  legendary: "Legendario",
  exotic: "Exótico",
};
