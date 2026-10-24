import { promises as fs } from "node:fs";
import path from "node:path";
import { downloadManifest, fetchRemoteVersion } from "./download";
import { MANIFEST_LANGUAGE, MANIFEST_SCHEMA, type Manifest } from "./types";

export type { Manifest, SlimItemDef, SlimStatDef } from "./types";

const CACHE_DIR = path.join(process.cwd(), ".cache", "manifest", MANIFEST_LANGUAGE);
const MANIFEST_FILE = path.join(CACHE_DIR, "manifest.json");
/** Cada cuánto se pregunta a Bungie si cambió la versión. */
const VERSION_CHECK_INTERVAL_MS = 60 * 60 * 1000;

interface State {
  manifest?: Manifest;
  checkedAt: number;
  loading?: Promise<Manifest>;
}
// Sobrevive a las recargas de módulos en desarrollo.
const g = globalThis as unknown as { __d2Manifest?: State };
const state: State = (g.__d2Manifest ??= { checkedAt: 0 });

async function readDisk(): Promise<Manifest | undefined> {
  try {
    return JSON.parse(await fs.readFile(MANIFEST_FILE, "utf8")) as Manifest;
  } catch {
    return undefined; // no existe o está corrupto → se vuelve a descargar
  }
}

async function writeDisk(manifest: Manifest) {
  await fs.mkdir(CACHE_DIR, { recursive: true });
  const tmp = `${MANIFEST_FILE}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(manifest));
  await fs.rename(tmp, MANIFEST_FILE); // escritura atómica
}

async function load(): Promise<Manifest> {
  const found = state.manifest ?? (await readDisk());
  // Una caché con otro esquema (de una versión anterior de la app) no sirve: se descarga de nuevo.
  const cached = found && found.schema === MANIFEST_SCHEMA ? found : undefined;

  if (cached && Date.now() - state.checkedAt < VERSION_CHECK_INTERVAL_MS) {
    state.manifest = cached;
    return cached;
  }

  try {
    const remote = await fetchRemoteVersion();
    state.checkedAt = Date.now();
    if (cached && cached.version === remote) {
      state.manifest = cached;
      return cached;
    }
    const fresh = await downloadManifest();
    await writeDisk(fresh);
    state.manifest = fresh;
    return fresh;
  } catch (err) {
    // Si Bungie falla pero hay caché, se sigue con ella.
    if (cached) {
      state.manifest = cached;
      return cached;
    }
    throw err;
  }
}

/** Devuelve el manifest en español; descarga solo si no hay caché o cambió la versión. */
export function getManifest(): Promise<Manifest> {
  return (state.loading ??= load().finally(() => {
    state.loading = undefined;
  }));
}
