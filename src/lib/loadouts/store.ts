import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { loadoutInputSchema, storedLoadoutSchema } from "./schema";
import { MAX_LOADOUTS, type Loadout } from "./types";

export const LOADOUTS_FILE = path.join(process.cwd(), "data", "loadouts.json");

const fileSchema = z.object({ version: z.literal(1), loadouts: z.array(z.unknown()) });

export type SaveResult = { ok: true; loadout: Loadout } | { ok: false; error: string };

/** Lee los loadouts. Un archivo ausente o dañado es una lista vacía; las entradas inválidas se ignoran. */
export async function listLoadouts(file = LOADOUTS_FILE): Promise<Loadout[]> {
  let text: string;
  try {
    // La ruta es un parámetro (para los tests); el archivo no forma parte del build.
    text = await fs.readFile(/*turbopackIgnore: true*/ file, "utf8");
  } catch {
    return [];
  }
  try {
    const parsed = fileSchema.safeParse(JSON.parse(text));
    if (!parsed.success) return [];
    return parsed.data.loadouts.flatMap((raw) => {
      const ok = storedLoadoutSchema.safeParse(raw);
      return ok.success ? [ok.data as Loadout] : [];
    });
  } catch {
    return [];
  }
}

// Las modificaciones leen-modifican-escriben: se serializan para no pisarse entre sí.
let queue: Promise<unknown> = Promise.resolve();
function serialized<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

async function write(file: string, loadouts: Loadout[]) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify({ version: 1, loadouts }, null, 2) + "\n");
  await fs.rename(tmp, file); // escritura atómica
}

/** Crea un loadout, o actualiza el que tenga el mismo `id`. Valida antes de guardar nada. */
export function saveLoadout(input: unknown, file = LOADOUTS_FILE): Promise<SaveResult> {
  return serialized(async (): Promise<SaveResult> => {
    const parsed = loadoutInputSchema.safeParse(input);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0]?.message ?? "Loadout no válido." };
    }
    const data = parsed.data;
    const all = await listLoadouts(file);
    const now = new Date().toISOString();

    if (data.id) {
      const existing = all.find((l) => l.id === data.id);
      if (!existing) return { ok: false, error: "Ese loadout ya no existe." };
      const updated: Loadout = { ...existing, ...stripUndefined(data), id: existing.id, createdAt: existing.createdAt, updatedAt: now };
      await write(file, all.map((l) => (l.id === existing.id ? updated : l)));
      return { ok: true, loadout: updated };
    }

    if (all.length >= MAX_LOADOUTS) return { ok: false, error: `Has llegado al máximo de ${MAX_LOADOUTS} loadouts.` };
    const created: Loadout = { ...stripUndefined(data), id: randomUUID(), createdAt: now, updatedAt: now } as Loadout;
    await write(file, [...all, created]);
    return { ok: true, loadout: created };
  });
}

export function deleteLoadout(id: string, file = LOADOUTS_FILE): Promise<{ ok: boolean }> {
  return serialized(async () => {
    const all = await listLoadouts(file);
    if (!all.some((l) => l.id === id)) return { ok: false };
    await write(file, all.filter((l) => l.id !== id));
    return { ok: true };
  });
}

// zod deja claves `undefined` en los campos opcionales; no se guardan en el archivo.
function stripUndefined<T extends object>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T;
}
