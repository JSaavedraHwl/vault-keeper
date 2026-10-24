import { hasValidSession } from "@/lib/bungie/session";
import { isSimulation } from "@/lib/classify/analyze-vault";

/**
 * Decide si esta petición usa datos de ejemplo. `?sim=1` solo se admite fuera de producción;
 * la variable CLASSIFY_SIMULATION=1 vale siempre.
 */
export function wantsSimulation(flag: unknown): boolean {
  if (isSimulation()) return true;
  return process.env.NODE_ENV !== "production" && (flag === true || flag === "1");
}

/** Con datos reales hace falta sesión; en simulación no. */
export async function canAccess(simulated: boolean): Promise<boolean> {
  return simulated || (await hasValidSession());
}
