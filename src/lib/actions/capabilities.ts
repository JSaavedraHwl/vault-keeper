import { promises as fs } from "node:fs";
import path from "node:path";

/** Lo que la app ha aprendido probando contra la API real. */
export interface Capabilities {
  /** ¿Se puede poner/quitar el candado a un ítem que está en el alijo? undefined = aún no se sabe. */
  vaultLock?: boolean;
}

export const CAPABILITIES_FILE = path.join(process.cwd(), "data", "capabilities.json");

export async function loadCapabilities(file = CAPABILITIES_FILE): Promise<Capabilities> {
  try {
    // La ruta es un parámetro (para los tests); el archivo no forma parte del build.
    const data = JSON.parse(await fs.readFile(/*turbopackIgnore: true*/ file, "utf8")) as Capabilities;
    return typeof data.vaultLock === "boolean" ? { vaultLock: data.vaultLock } : {};
  } catch {
    return {};
  }
}

export async function saveCapabilities(patch: Capabilities, file = CAPABILITIES_FILE): Promise<void> {
  const next = { ...(await loadCapabilities(file)), ...patch };
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(next, null, 2) + "\n");
  await fs.rename(tmp, file);
}
