import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { makeItem } from "@/lib/classify/testing";
import type { GearData } from "@/lib/inventory/gear";
import type { ItemSlot, NormalizedItem } from "@/lib/inventory/types";
import { isWeaponSlot, type EquipSlot, type Loadout } from "@/lib/loadouts/types";
import { LoadoutsView } from "./loadouts-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));
// Las acciones del servidor tocan disco y sesión: aquí no se ejecutan, solo se renderiza.
vi.mock("./actions", () => ({ saveLoadoutAction: vi.fn(), deleteLoadoutAction: vi.fn() }));

const piece = (slot: EquipSlot, over: Partial<NormalizedItem> = {}) =>
  makeItem({
    slot: slot as ItemSlot,
    kind: isWeaponSlot(slot) ? "weapon" : "armor",
    classType: isWeaponSlot(slot) ? null : "warlock",
    location: "vault",
    ...over,
  });

const equippedKinetic = piece("kinetic", { name: "Arma puesta", location: "character", characterId: "w", equipped: true });
const vaultEnergy = piece("energy", { name: "Escopeta del alijo" });
const vaultHelmet = piece("helmet", { name: "Casco del alijo" });

const refOf = (i: NormalizedItem) => ({ id: i.id, hash: i.hash, name: i.name, icon: null, tier: i.tier });
const loadout = (name: string, classType: Loadout["classType"], items: Loadout["items"]): Loadout => ({
  id: `id-${name}`, name, classType, items, createdAt: "x", updatedAt: "x",
});

const data: GearData = {
  generatedAt: "2026-10-24T12:00:00.000Z",
  items: [equippedKinetic, vaultEnergy, vaultHelmet],
  characters: [
    { id: "w", classType: "warlock", light: 2000, free: { kinetic: 3, energy: 3, power: 3, helmet: 3, arms: 3, chest: 3, legs: 3, classItem: 3 }, activeArtifactPerks: [] },
    { id: "t", classType: "titan", light: 1900, free: {}, activeArtifactPerks: [] },
  ],
  artifact: { perks: [], unparsed: [] },
};

const ready = loadout("Para equipar", "warlock", { energy: refOf(vaultEnergy), helmet: refOf(vaultHelmet) });
const done = loadout("Ya puesto", "warlock", { kinetic: refOf(equippedKinetic) });
const titan = loadout("De titán", "titan", { kinetic: refOf(equippedKinetic) });
const gone = loadout("Con pieza perdida", "warlock", { kinetic: refOf(equippedKinetic), power: refOf(piece("power", { name: "Desmantelada" })) });

const html = (props: Partial<Parameters<typeof LoadoutsView>[0]> = {}) =>
  renderToStaticMarkup(<LoadoutsView data={data} loadouts={[ready, done, titan, gone]} {...props} />);

describe("pantalla de loadouts", () => {
  it("lista cada loadout con su clase y su estado frente al personaje elegido", () => {
    const out = html();
    for (const n of ["Para equipar", "Ya puesto", "De titán", "Con pieza perdida"]) expect(out).toContain(n);
    expect(out).toContain("2 por equipar"); // escopeta y casco
    expect(out).toContain("Ya lo llevas puesto");
    expect(out).toContain("Otra clase"); // el loadout de titán con un hechicero elegido
  });

  it("marca como inexistente la pieza que ya no está", () => {
    expect(html()).toContain("Pesada: Desmantelada (ya no existe)");
  });

  it("sin loadouts, explica cómo crear uno", () => {
    const out = html({ loadouts: [] });
    expect(out).toContain("Aún no tienes loadouts");
    expect(out).toContain("Nuevo loadout");
  });

  it("ofrece crear uno nuevo y guardar lo que llevas puesto", () => {
    const out = html();
    expect(out).toContain("Nuevo loadout");
    expect(out).toContain("Guardar lo que llevo puesto");
    expect(out).toContain("Hechicero · poder 2000");
  });

  it("no muestra la barra de equipar hasta elegir un loadout", () => {
    expect(html()).not.toContain('aria-label="Equipar loadout"');
  });

  describe("barra de equipar", () => {
    it("muestra el estado de cada ranura y permite equipar", () => {
      const out = html({ initialEquipId: ready.id });
      expect(out).toContain('aria-label="Equipar loadout"');
      expect(out).toContain("Del alijo"); // energía y casco
      expect(out).toContain("Equipar en Hechicero");
      expect(out.match(/<button[^>]*>Equipar en Hechicero<\/button>/)![0]).not.toMatch(/\sdisabled=""/);
      expect(out).toContain("Solo simular");
    });

    it("un loadout de otra clase no se puede equipar y dice por qué", () => {
      const out = html({ initialEquipId: titan.id });
      expect(out.match(/<button[^>]*>Equipar en Hechicero<\/button>/)![0]).toMatch(/\sdisabled=""/);
      expect(out).toMatch(/Este loadout es de Titán/);
    });

    it("si no hay nada que hacer, el botón queda desactivado", () => {
      const out = html({ initialEquipId: done.id });
      expect(out.match(/<button[^>]*>Equipar en Hechicero<\/button>/)![0]).toMatch(/\sdisabled=""/);
      expect(out).toContain("Ya puesta");
    });

    it("avisa de las piezas que ya no existen", () => {
      const out = html({ initialEquipId: gone.id });
      expect(out).toContain("Ya no existe");
      expect(out).toMatch(/ya no existe; se omite/);
    });

    it("recuerda que solo funciona fuera de una actividad", () => {
      expect(html({ initialEquipId: ready.id })).toContain("no en medio de una actividad");
    });
  });

  describe("editor", () => {
    const init = { id: ready.id, name: ready.name, classType: ready.classType, notes: "", items: ready.items };

    it("se abre con el borrador y muestra las ocho ranuras", () => {
      const out = html({ initialEditing: init });
      expect(out).toContain("Editando");
      expect(out).toContain("Guardar cambios");
      for (const s of ["Cinética", "Energía", "Pesada", "Casco", "Guanteletes", "Peto", "Botas", "Objeto de clase"]) expect(out).toContain(s);
      expect(out).toContain("Escopeta del alijo");
      expect(out).toContain("Vacía");
    });

    it("uno nuevo dice «Guardar loadout» y no tiene piezas", () => {
      const out = html({ initialEditing: { name: "", classType: "warlock", notes: "", items: {} } });
      expect(out).toContain("Nuevo loadout");
      expect(out).toContain("Guardar loadout");
      expect(out).not.toContain("Guardar cambios");
    });

    it("mientras se edita no se ofrecen los botones de crear", () => {
      expect(html({ initialEditing: init })).not.toContain("Guardar lo que llevo puesto");
    });

    it("permite rellenar con lo que lleva puesto el personaje", () => {
      expect(html({ initialEditing: init })).toContain("Rellenar con lo que llevo puesto");
    });
  });

  it("sin personajes, avisa en vez de romper", () => {
    expect(html({ data: { ...data, characters: [] } })).toContain("No se encontraron personajes");
  });

  it("muestra la antigüedad de los datos", () => {
    expect(html()).toMatch(/Datos de (ahora mismo|hace \d+ (s|min))/);
  });
});
