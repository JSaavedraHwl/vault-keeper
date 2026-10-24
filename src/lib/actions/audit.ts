import { promises as fs } from "node:fs";
import path from "node:path";
import type { AuditEntry } from "./types";

export const AUDIT_FILE = path.join(process.cwd(), "data", "audit-log.jsonl");
/** Las pruebas (modo mock) escriben aparte para no mezclarse con acciones reales. */
export const MOCK_AUDIT_FILE = path.join(process.cwd(), "data", "audit-log.mock.jsonl");

// Las escrituras se serializan: el log es de solo añadir (una línea JSON por acción).
let queue: Promise<unknown> = Promise.resolve();

export function appendAudit(entries: readonly AuditEntry[], file = AUDIT_FILE): Promise<void> {
  const task = async () => {
    if (entries.length === 0) return;
    await fs.mkdir(path.dirname(file), { recursive: true });
    await fs.appendFile(file, entries.map((e) => JSON.stringify(e)).join("\n") + "\n");
  };
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

export async function readAudit(file = AUDIT_FILE): Promise<AuditEntry[]> {
  let text: string;
  try {
    // La ruta es un parámetro (para los tests); el archivo no forma parte del build.
    text = await fs.readFile(/*turbopackIgnore: true*/ file, "utf8");
  } catch {
    return [];
  }
  const entries: AuditEntry[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      entries.push(JSON.parse(line) as AuditEntry);
    } catch {
      // una línea dañada no debe invalidar el resto del registro
    }
  }
  return entries;
}

/** Entradas de la última ejecución real (no simulada), en el orden en que se hicieron. */
export async function lastRun(file = AUDIT_FILE): Promise<{ runId: string; entries: AuditEntry[] } | null> {
  const real = (await readAudit(file)).filter((e) => !e.dryRun);
  const last = real.at(-1);
  if (!last) return null;
  return { runId: last.runId, entries: real.filter((e) => e.runId === last.runId) };
}
