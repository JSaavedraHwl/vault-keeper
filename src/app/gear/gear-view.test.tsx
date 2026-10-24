import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { makeItem } from "@/lib/classify/testing";
import type { GearData } from "@/lib/inventory/gear";
import type { ItemSlot, NormalizedItem } from "@/lib/inventory/types";
import { GearView } from "./gear-view";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => {} }) }));

const weapon = (slot: ItemSlot, name: string, over: Partial<NormalizedItem> = {}) =>
  makeItem({ slot, name, type: "Fusil de pulsos", element: "Solar", power: 2000, location: "vault", ...over });

const equippedKinetic = weapon("kinetic", "Equipada Cinética", { location: "character", characterId: "c1", equipped: true });
const equippedEnergy = weapon("energy", "Equipada Energía", { location: "character", characterId: "c1", equipped: true });
const vaultKinetic = weapon("kinetic", "Rifle del alijo");
const vaultPower = weapon("power", "Cohete del alijo", { type: "Lanzacohetes", champions: [{ type: "unstoppable", via: ["item"] }] });

const data: GearData = {
  generatedAt: "2026-10-24T12:00:00.000Z",
  items: [equippedKinetic, equippedEnergy, vaultKinetic, vaultPower],
  characters: [
    { id: "c1", classType: "warlock", light: 2000, free: { kinetic: 3, energy: 3, power: 3 }, activeArtifactPerks: [10] },
    { id: "c2", classType: "titan", light: 1900, free: {}, activeArtifactPerks: [] },
  ],
  artifact: {
    name: "Instrumento de curiosidad",
    perks: [
      { hash: 10, name: "Fusil de pulsos de sobrecarga", champion: "overload", weaponType: "Fusil de pulsos" },
      { hash: 11, name: "Fusil de pulsos antibarrera", champion: "barrier", weaponType: "Fusil de pulsos" },
    ],
    unparsed: ["Ojiva anticampeones"],
  },
};

const html = (d: GearData = data) => renderToStaticMarkup(<GearView data={d} />);

/** Contenido de una columna de ranura (<section aria-label="Ranura N · Nombre">). */
const column = (out: string, label: string) => {
  const start = out.indexOf(`aria-label="${label}"`);
  expect(start).toBeGreaterThan(-1);
  const end = out.indexOf("</section>", start);
  return out.slice(start, end);
};

describe("pantalla Equipar", () => {
  it("separa las armas en Ranura 1 (cinética), Ranura 2 (energía) y Ranura 3 (pesada)", () => {
    const out = html();
    expect(out).toContain("Ranura 1");
    expect(out).toContain("Ranura 2");
    expect(out).toContain("Ranura 3");

    const k = column(out, "Ranura 1 · Cinética");
    expect(k).toContain("Rifle del alijo");
    expect(k).toContain("Equipada Cinética");
    expect(k).not.toContain("Cohete del alijo");

    const e = column(out, "Ranura 2 · Energía");
    expect(e).toContain("Equipada Energía");
    expect(e).not.toContain("Rifle del alijo");

    const p = column(out, "Ranura 3 · Pesada");
    expect(p).toContain("Cohete del alijo");
    expect(p).not.toContain("Rifle del alijo");
  });

  it("muestra lo equipado ahora en cada ranura y deja vacía la que no tiene nada", () => {
    const out = html();
    const now = column(out, "Equipado ahora");
    expect(now).toContain("Equipada Cinética");
    expect(now).toContain("Equipada Energía");
    expect(now).toContain("Vacía"); // la pesada
  });

  it("indica dónde está cada arma", () => {
    const out = html();
    expect(out).toContain("En el alijo");
    expect(out).toContain("Hechicero · equipada");
  });

  it("muestra la capacidad contra campeones del arma y las ventajas activas del personaje", () => {
    const out = html();
    expect(column(out, "Ranura 3 · Pesada")).toContain("Imparable");
    expect(out).toContain("Instrumento de curiosidad");
    expect(out).toContain("Fusil de pulsos de sobrecarga"); // activa en el hechicero
    expect(out).toContain("1 ventaja(s) que no pude interpretar");
  });

  it("las armas de un tipo con ventaja ACTIVA muestran la capacidad; la inactiva sale como potencial (con «?»)", () => {
    const k = column(html(), "Ranura 1 · Cinética");
    expect(k).toContain("Sobrecarga"); // activa
    expect(k).toContain("Barrera?"); // potencial, borde discontinuo
  });

  it("ofrece el filtro de munición y muestra la munición de cada arma", () => {
    const withAmmo: GearData = {
      ...data,
      items: [
        weapon("kinetic", "Escopeta K", { ammo: "special", type: "Escopeta" }),
        weapon("energy", "Pulsos E", { ammo: "primary" }),
        weapon("power", "Cohete P", { ammo: "heavy", type: "Lanzacohetes" }),
      ],
    };
    const out = html(withAmmo);
    expect(out).toContain("Toda la munición");
    for (const o of ["Munición principal", "Munición especial", "Munición pesada"]) expect(out).toContain(o);
    expect(column(out, "Ranura 1 · Cinética")).toContain(">Especial<");
    expect(column(out, "Ranura 2 · Energía")).toContain(">Principal<");
    expect(column(out, "Ranura 3 · Pesada")).toContain(">Pesada<");
  });

  it("ofrece los tres filtros de campeón, el de potenciales y los demás", () => {
    const out = html();
    for (const label of ["Barrera", "Imparable", "Sobrecarga"]) expect(out).toContain(label);
    expect(out).toContain("incluir las que lo harían activando una ventaja");
    expect(out).toContain("Todos los tipos");
    expect(out).toContain("Todos los elementos");
    expect(out).toContain("Todas las ubicaciones");
  });

  it("sin personajes, avisa en vez de romper", () => {
    expect(html({ ...data, characters: [] })).toContain("No se encontraron personajes");
  });

  it("muestra la antigüedad de los datos y un botón para actualizarlos", () => {
    const out = html();
    expect(out).toMatch(/Datos de (ahora mismo|hace \d+ (s|min))/);
    expect(out).toContain(">Actualizar<");
  });

  it("no hay panel de selección hasta elegir un arma", () => {
    expect(html()).not.toContain('aria-label="Selección"');
  });

  it("sin armas en una ranura, lo dice", () => {
    expect(column(html({ ...data, items: [vaultKinetic] }), "Ranura 3 · Pesada")).toContain("Ninguna arma coincide");
  });
});
