import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ItemTier } from "../inventory/types";
import { deleteLoadout, listLoadouts, saveLoadout } from "./store";
import { MAX_LOADOUTS, type EquipSlot, type LoadoutInput, type LoadoutItemRef } from "./types";

let dir: string;
let file: string;
beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "loadouts-test-"));
  file = path.join(dir, "loadouts.json");
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const ref = (id: string, tier: ItemTier = "legendary", over: Partial<LoadoutItemRef> = {}): LoadoutItemRef => ({
  id,
  hash: 1000,
  name: `Pieza ${id}`,
  icon: "https://www.bungie.net/common/destiny2_content/icons/x.jpg",
  tier,
  ...over,
});

const input = (over: Partial<LoadoutInput> = {}): LoadoutInput => ({
  name: "Grandmaster – Barrera",
  classType: "warlock",
  items: { kinetic: ref("k1"), energy: ref("e1"), helmet: ref("h1") },
  ...over,
});

const items = (map: Partial<Record<EquipSlot, LoadoutItemRef>>) => map;

describe("guardar loadouts", () => {
  it("crea un loadout con id y fechas, y lo devuelve al listar", async () => {
    const r = await saveLoadout(input(), file);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.loadout.id).toMatch(/[0-9a-f-]{36}/);
    expect(r.loadout.createdAt).toBe(r.loadout.updatedAt);
    expect(await listLoadouts(file)).toEqual([r.loadout]);
  });

  it("actualiza uno existente conservando su id y la fecha de creación", async () => {
    const first = await saveLoadout(input(), file);
    if (!first.ok) throw new Error("no creó");
    await new Promise((r) => setTimeout(r, 5));
    const second = await saveLoadout({ ...input({ name: "Otro nombre" }), id: first.loadout.id }, file);
    expect(second.ok).toBe(true);
    if (!second.ok) return;
    expect(second.loadout.id).toBe(first.loadout.id);
    expect(second.loadout.createdAt).toBe(first.loadout.createdAt);
    expect(second.loadout.updatedAt >= first.loadout.updatedAt).toBe(true);
    expect(await listLoadouts(file)).toHaveLength(1);
    expect((await listLoadouts(file))[0].name).toBe("Otro nombre");
  });

  it("no «resucita» un id que ya no existe", async () => {
    const r = await saveLoadout({ ...input(), id: "fantasma" }, file);
    expect(r).toEqual({ ok: false, error: "Ese loadout ya no existe." });
    expect(await listLoadouts(file)).toEqual([]);
  });

  it("recorta espacios del nombre y de las notas", async () => {
    const r = await saveLoadout(input({ name: "  Mi loadout  ", notes: "  nota  " }), file);
    expect(r.ok && r.loadout.name).toBe("Mi loadout");
    expect(r.ok && r.loadout.notes).toBe("nota");
  });

  it("sin notas, no guarda la clave", async () => {
    const r = await saveLoadout(input(), file);
    expect(r.ok && "notes" in r.loadout).toBe(false);
    expect(JSON.parse(await readFile(file, "utf8")).loadouts[0]).not.toHaveProperty("notes");
  });

  it("admite las 8 ranuras", async () => {
    const all = items({
      kinetic: ref("1"), energy: ref("2"), power: ref("3"),
      helmet: ref("4"), arms: ref("5"), chest: ref("6"), legs: ref("7"), classItem: ref("8"),
    });
    expect((await saveLoadout(input({ items: all }), file)).ok).toBe(true);
  });
});

describe("validación", () => {
  const invalid = async (patch: Partial<LoadoutInput> | Record<string, unknown>) => {
    const r = await saveLoadout({ ...input(), ...patch }, file);
    expect(r.ok).toBe(false);
    expect(await listLoadouts(file)).toEqual([]); // nunca se guarda un loadout inválido
    return r.ok ? "" : r.error;
  };

  it("exige nombre", async () => {
    expect(await invalid({ name: "   " })).toMatch(/nombre/i);
    expect(await invalid({ name: "x".repeat(61) })).toMatch(/60/);
  });

  it("exige al menos una pieza", async () => {
    expect(await invalid({ items: {} })).toMatch(/al menos una pieza/i);
  });

  it("rechaza clases y ranuras inexistentes", async () => {
    expect(await invalid({ classType: "paladin" })).toBeTruthy();
    expect(await invalid({ items: { arma_secreta: ref("x") } })).toBeTruthy();
  });

  it("rechaza la misma pieza en dos ranuras", async () => {
    expect(await invalid({ items: { kinetic: ref("dup"), energy: ref("dup") } })).toMatch(/dos ranuras/);
  });

  it("solo una exótica de arma y una de armadura", async () => {
    expect(await invalid({ items: { kinetic: ref("a", "exotic"), power: ref("b", "exotic") } })).toMatch(/una arma exótica/);
    expect(await invalid({ items: { helmet: ref("a", "exotic"), legs: ref("b", "exotic") } })).toMatch(/una armadura exótica/);
  });

  it("una exótica de arma y otra de armadura SÍ conviven", async () => {
    const r = await saveLoadout(input({ items: { kinetic: ref("a", "exotic"), helmet: ref("b", "exotic") } }), file);
    expect(r.ok).toBe(true);
  });

  it("solo acepta íconos de bungie.net (o ninguno)", async () => {
    expect(await invalid({ items: { kinetic: ref("a", "legendary", { icon: "https://evil.example/x.jpg" }) } })).toMatch(/bungie\.net/);
    expect(await invalid({ items: { kinetic: ref("a", "legendary", { icon: "javascript:alert(1)" }) } })).toMatch(/bungie\.net/);
    expect((await saveLoadout(input({ items: { kinetic: ref("a", "legendary", { icon: null }) } }), file)).ok).toBe(true);
  });

  it("limita el número de loadouts", async () => {
    const many = Array.from({ length: MAX_LOADOUTS }, (_, i) => ({
      id: `id-${i}`, name: `L${i}`, classType: "titan", items: { kinetic: ref(`k${i}`) },
      createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
    }));
    await writeFile(file, JSON.stringify({ version: 1, loadouts: many }));
    const r = await saveLoadout(input(), file);
    expect(r).toMatchObject({ ok: false, error: expect.stringMatching(/máximo/) });
  });
});

describe("borrar y robustez del archivo", () => {
  it("borra por id y avisa si no existe", async () => {
    const a = await saveLoadout(input({ name: "A" }), file);
    const b = await saveLoadout(input({ name: "B" }), file);
    if (!a.ok || !b.ok) throw new Error("no creó");
    expect(await deleteLoadout(a.loadout.id, file)).toEqual({ ok: true });
    expect((await listLoadouts(file)).map((l) => l.name)).toEqual(["B"]);
    expect(await deleteLoadout("no-existe", file)).toEqual({ ok: false });
  });

  it("sin archivo hay una lista vacía", async () => {
    expect(await listLoadouts(file)).toEqual([]);
  });

  it("un archivo corrupto o con otra forma se trata como vacío (y no se reescribe al leer)", async () => {
    await writeFile(file, "{roto");
    expect(await listLoadouts(file)).toEqual([]);
    expect(await readFile(file, "utf8")).toBe("{roto");
    await writeFile(file, JSON.stringify({ version: 2, loadouts: [] }));
    expect(await listLoadouts(file)).toEqual([]);
  });

  it("ignora las entradas inválidas pero conserva las buenas", async () => {
    const good = await saveLoadout(input(), file);
    if (!good.ok) throw new Error("no creó");
    const raw = JSON.parse(await readFile(file, "utf8"));
    raw.loadouts.push({ id: "mal", name: "" }, "basura", null);
    await writeFile(file, JSON.stringify(raw));
    expect((await listLoadouts(file)).map((l) => l.id)).toEqual([good.loadout.id]);
  });

  it("escrituras simultáneas no se pisan", async () => {
    const results = await Promise.all(Array.from({ length: 8 }, (_, i) => saveLoadout(input({ name: `L${i}` }), file)));
    expect(results.every((r) => r.ok)).toBe(true);
    expect(await listLoadouts(file)).toHaveLength(8);
  });

  it("el JSON guardado es legible y versionado", async () => {
    await saveLoadout(input(), file);
    const raw = JSON.parse(await readFile(file, "utf8"));
    expect(raw.version).toBe(1);
    expect(Array.isArray(raw.loadouts)).toBe(true);
  });
});
