import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { MockInventoryActions, type MockOptions } from "../bungie/actions/mock";
import { readAudit } from "./audit";
import { loadCapabilities, saveCapabilities, type Capabilities } from "./capabilities";
import { lockSingleItem } from "./lock-single";

const CHAR = "char-1";
const item = { id: "i1", hash: 100, name: "Rifle de prueba" };

let dir: string;
let auditFile: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "lock-single-"));
  auditFile = path.join(dir, "audit.jsonl");
});
afterEach(() => rm(dir, { recursive: true, force: true }));

function setup(options: Partial<MockOptions> = {}, capabilities: Capabilities = {}, locked = false) {
  const mock = new MockInventoryActions({ items: { i1: { location: "vault", locked } }, ...options });
  const saved: Capabilities[] = [];
  const run = (wantLocked: boolean) =>
    lockSingleItem({
      actions: mock,
      item,
      locked: wantLocked,
      characterId: CHAR,
      capabilities,
      saveCapabilities: async (p) => void saved.push(p),
      auditFile,
      sleep: async () => {},
    });
  return { mock, saved, run };
}

describe("bloquear un solo ítem del alijo", () => {
  it("camino directo: funciona, el ítem sigue en el alijo y se aprende que el alijo admite candado", async () => {
    const { mock, saved, run } = setup();
    expect(await run(true)).toEqual({ ok: true, locked: true, via: "direct" });
    expect(mock.items.i1).toMatchObject({ location: "vault", locked: true });
    expect(mock.calls).toEqual(["lock:i1:true"]);
    expect(saved).toEqual([{ vaultLock: true }]);
  });

  it("no vuelve a guardar lo que ya se sabe", async () => {
    const { saved, run } = setup({}, { vaultLock: true });
    await run(true);
    expect(saved).toEqual([]);
  });

  it("si el alijo no admite candado: rodeo (mover, bloquear, devolver) y se aprende", async () => {
    const { mock, saved, run } = setup({ vaultLockSupported: false });
    expect(await run(true)).toEqual({ ok: true, locked: true, via: "detour" });
    expect(mock.items.i1).toMatchObject({ location: "vault", locked: true });
    expect(mock.calls).toEqual(["lock:i1:true", "transfer:i1:->char-1", "lock:i1:true", "transfer:i1:->vault"]);
    expect(saved).toEqual([{ vaultLock: false }]);
  });

  it("si ya se sabe que el alijo no admite candado, va directo al rodeo sin probar", async () => {
    const { mock, saved, run } = setup({ vaultLockSupported: false }, { vaultLock: false });
    expect((await run(true)).ok).toBe(true);
    expect(mock.calls).toEqual(["transfer:i1:->char-1", "lock:i1:true", "transfer:i1:->vault"]);
    expect(saved).toEqual([]);
  });

  it("también desbloquea, directo y con rodeo", async () => {
    const direct = setup({}, {}, true);
    expect(await direct.run(false)).toMatchObject({ ok: true, locked: false });
    expect(direct.mock.items.i1.locked).toBe(false);

    const detour = setup({ vaultLockSupported: false }, {}, true);
    expect(await detour.run(false)).toMatchObject({ ok: true, via: "detour" });
    expect(detour.mock.items.i1).toMatchObject({ location: "vault", locked: false });
  });

  describe("errores", () => {
    it("actividad en curso: no se intenta el rodeo (moverlo no ayudaría)", async () => {
      const { mock, saved, run } = setup({ failures: { i1: { code: 1671 } } });
      const result = await run(true);
      expect(result).toMatchObject({ ok: false, error: { kind: "in_activity" } });
      expect(mock.calls).toEqual(["lock:i1:true"]);
      expect(saved).toEqual([]);
    });

    it.each([
      ["mantenimiento", "maintenance"],
      ["sesión", "session"],
    ] as const)("%s: tampoco hay rodeo", async (_n, code) => {
      const { mock, run } = setup({ failures: { i1: { code } } });
      expect((await run(true)).ok).toBe(false);
      expect(mock.calls).toHaveLength(1);
    });

    it("un throttle pasajero se reintenta y acaba bien por el camino directo", async () => {
      const { mock, run } = setup({ failures: { "lock:i1": { code: 1672, times: 2 } } });
      expect(await run(true)).toMatchObject({ ok: true, via: "direct" });
      expect(mock.calls).toHaveLength(3);
    });

    it("rodeo sin espacio en el personaje: no se bloquea, el ítem sigue en el alijo y no se aprende nada", async () => {
      const { mock, saved, run } = setup({ vaultLockSupported: false, characterCapacity: { [CHAR]: 0 } });
      const result = await run(true);
      expect(result).toMatchObject({ ok: false, error: { kind: "no_room" } });
      expect(mock.items.i1).toMatchObject({ location: "vault", locked: false });
      expect(saved).toEqual([]);
    });

    it("si falla el candado dentro del rodeo (error del ítem), igualmente vuelve al alijo y no se aprende nada", async () => {
      const saved: Capabilities[] = [];
      const failing = new MockInventoryActions({
        items: { i1: { location: "vault", locked: false } },
        failures: { "lock:i1": { code: 1663 } }, // un error ajeno al ítem concreto
      });
      const result = await lockSingleItem({
        actions: failing, item, locked: true, characterId: CHAR, capabilities: { vaultLock: false },
        saveCapabilities: async (p) => void saved.push(p), auditFile, sleep: async () => {},
      });
      expect(result.ok).toBe(false);
      expect(failing.items.i1).toMatchObject({ location: "vault", locked: false });
      expect(saved).toEqual([]);
    });

    it("si algo corta el rodeo con el ítem ya movido (actividad en curso), el mensaje lo dice", async () => {
      const failing = new MockInventoryActions({
        items: { i1: { location: "vault", locked: false } },
        failures: { "lock:i1": { code: 1671 } }, // se corta justo en el candado del rodeo
      });
      const result = await lockSingleItem({
        actions: failing, item, locked: true, characterId: CHAR, capabilities: { vaultLock: false },
        auditFile, sleep: async () => {},
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.error.kind).toBe("in_activity");
        expect(result.error.message).toMatch(/quedó en el personaje/);
      }
      expect(failing.items.i1.location).toBe(CHAR);
    });
  });

  it("deja registro de auditoría de cada intento, incluido el directo que falló", async () => {
    const { run } = setup({ vaultLockSupported: false });
    await run(true);
    const log = await readAudit(auditFile);
    expect(log.map((e) => [e.action.kind, e.ok])).toEqual([
      ["lock", false], // el directo falló
      ["transfer", true],
      ["lock", true],
      ["transfer", true],
    ]);
    expect(log[0].error?.kind).toBe("not_found");
  });
});

describe("capacidades aprendidas", () => {
  it("se guardan, se combinan y toleran archivos ausentes o dañados", async () => {
    const file = path.join(dir, "caps.json");
    expect(await loadCapabilities(file)).toEqual({});
    await saveCapabilities({ vaultLock: false }, file);
    expect(await loadCapabilities(file)).toEqual({ vaultLock: false });
    await saveCapabilities({ vaultLock: true }, file);
    expect(await loadCapabilities(file)).toEqual({ vaultLock: true });

    const { writeFile } = await import("node:fs/promises");
    await writeFile(file, "{roto");
    expect(await loadCapabilities(file)).toEqual({});
    await writeFile(file, JSON.stringify({ vaultLock: "si" }));
    expect(await loadCapabilities(file)).toEqual({});
  });
});
