import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type { NormalizedItem } from "../inventory/types";
import type { ClassificationResult, Verdict } from "./types";

export type ManualVerdict = Exclude<Verdict, "needs_review">;

const overridesSchema = z.object({
  verdicts: z.record(
    z.string(),
    z.object({ verdict: z.enum(["keep", "archive", "junk"]), at: z.string() }),
  ),
  alwaysKeep: z.array(z.string()),
});
export type Overrides = z.infer<typeof overridesSchema>;

export const EMPTY_OVERRIDES: Overrides = { verdicts: {}, alwaysKeep: [] };

export const OVERRIDES_FILE = path.join(process.cwd(), "data", "overrides.json");
/** En modo simulación las correcciones se guardan aparte para no mezclarlas con las reales. */
export const SIMULATION_OVERRIDES_FILE = path.join(process.cwd(), "data", "overrides.simulation.json");

export async function loadOverrides(file = OVERRIDES_FILE): Promise<Overrides> {
  try {
    // La ruta es un parámetro (para los tests); el archivo no forma parte del build.
    const text = await fs.readFile(/*turbopackIgnore: true*/ file, "utf8");
    const parsed = overridesSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : EMPTY_OVERRIDES;
  } catch {
    return EMPTY_OVERRIDES;
  }
}

// Las modificaciones leen-modifican-escriben: se serializan para no pisarse entre sí.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function update(file: string, change: (o: Overrides) => Overrides): Promise<Overrides> {
  return serialized(async () => {
    const next = change(await loadOverrides(file));
    await fs.mkdir(path.dirname(file), { recursive: true });
    const tmp = `${file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(next, null, 2) + "\n");
    await fs.rename(tmp, file);
    return next;
  });
}

/** Fija (o quita, con null) el veredicto manual de un ítem. */
export function setManualVerdict(itemId: string, verdict: ManualVerdict | null, file = OVERRIDES_FILE) {
  return update(file, (o) => {
    const { [itemId]: _removed, ...rest } = o.verdicts;
    void _removed;
    return {
      ...o,
      verdicts: verdict ? { ...rest, [itemId]: { verdict, at: new Date().toISOString() } } : rest,
    };
  });
}

/** Marca o desmarca «siempre conservar». */
export function setAlwaysKeep(itemId: string, on: boolean, file = OVERRIDES_FILE) {
  return update(file, (o) => {
    const others = o.alwaysKeep.filter((id) => id !== itemId);
    return { ...o, alwaysKeep: on ? [...others, itemId] : others };
  });
}

/**
 * Aplica los veredictos manuales sobre el resultado de las reglas.
 * Un veredicto manual «junk» se ignora si el ítem está bloqueado, equipado o en «siempre conservar».
 */
export function applyManualVerdicts(
  results: readonly ClassificationResult[],
  items: readonly NormalizedItem[],
  overrides: Overrides,
): ClassificationResult[] {
  const byId = new Map(items.map((i) => [i.id, i]));
  const keep = new Set(overrides.alwaysKeep);

  return results.map((result) => {
    const manual = overrides.verdicts[result.itemId];
    if (!manual) return result;
    const item = byId.get(result.itemId);
    const protectedItem = keep.has(result.itemId) || item?.locked || item?.equipped;
    if (manual.verdict === "junk" && protectedItem) return result;
    return {
      itemId: result.itemId,
      verdict: manual.verdict,
      reason: "Decidido manualmente.",
      confidence: 1,
      source: "manual",
    };
  });
}
