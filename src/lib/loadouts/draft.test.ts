import { describe, expect, it } from "vitest";
import { makeItem } from "../classify/testing";
import type { ItemSlot, NormalizedItem } from "../inventory/types";
import { candidatesFor, classOf, draftFromEquipped, dropOtherClassArmor, refOf, withSlot, type DraftItems } from "./draft";
import { isWeaponSlot, type EquipSlot } from "./types";

const piece = (slot: EquipSlot, over: Partial<NormalizedItem> = {}) =>
  makeItem({
    slot: slot as ItemSlot,
    kind: isWeaponSlot(slot) ? "weapon" : "armor",
    classType: isWeaponSlot(slot) ? null : "warlock",
    location: "vault",
    ...over,
  });

describe("capturar lo que llevas puesto", () => {
  it("toma solo lo equipado del personaje pedido, una pieza por ranura", () => {
    const mine = piece("kinetic", { location: "character", characterId: "me", equipped: true });
    const helmet = piece("helmet", { location: "character", characterId: "me", equipped: true });
    const otherChar = piece("energy", { location: "character", characterId: "otro", equipped: true });
    const inInventory = piece("power", { location: "character", characterId: "me" });
    const inVault = piece("arms");
    const draft = draftFromEquipped([mine, helmet, otherChar, inInventory, inVault], "me");
    expect(Object.keys(draft).sort()).toEqual(["helmet", "kinetic"]);
    expect(draft.kinetic?.id).toBe(mine.id);
  });

  it("la referencia guarda una «foto» (nombre, ícono, rareza) para mostrarla aunque la pieza desaparezca", () => {
    const w = piece("kinetic", { name: "Mi arma", icon: "https://www.bungie.net/x.jpg", tier: "exotic" });
    expect(refOf(w)).toEqual({ id: w.id, hash: w.hash, name: "Mi arma", icon: "https://www.bungie.net/x.jpg", tier: "exotic" });
  });
});

describe("piezas que se pueden elegir para una ranura", () => {
  const items = [
    piece("kinetic", { name: "Baja", power: 1900 }),
    piece("kinetic", { name: "Alta", power: 2010 }),
    piece("energy", { name: "De energía" }),
    piece("helmet", { name: "Casco de hechicero", classType: "warlock" }),
    piece("helmet", { name: "Casco de titán", classType: "titan" }),
    piece("helmet", { name: "Casco universal", classType: null }),
  ];

  it("solo las de esa ranura, ordenadas por poder (mayor primero) y no por nombre", () => {
    expect(candidatesFor("kinetic", "warlock", items, {}).map((c) => c.item.name)).toEqual(["Alta", "Baja"]);
    // Aquí el orden alfabético sería el contrario al de poder.
    const byPower = [piece("kinetic", { name: "A-débil", power: 1000 }), piece("kinetic", { name: "Z-fuerte", power: 2000 })];
    expect(candidatesFor("kinetic", "warlock", byPower, {}).map((c) => c.item.name)).toEqual(["Z-fuerte", "A-débil"]);
  });

  it("a igual poder, ordena por nombre", () => {
    const same = [piece("kinetic", { name: "Beta", power: 2000 }), piece("kinetic", { name: "Alfa", power: 2000 })];
    expect(candidatesFor("kinetic", "warlock", same, {}).map((c) => c.item.name)).toEqual(["Alfa", "Beta"]);
  });

  it("las armaduras solo de la clase del loadout (o sin clase); las armas no tienen clase", () => {
    const names = candidatesFor("helmet", "warlock", items, {}).map((c) => c.item.name).sort();
    expect(names).toEqual(["Casco de hechicero", "Casco universal"]);
    expect(candidatesFor("kinetic", "titan", items, {})).toHaveLength(2);
  });

  it("la pieza ya elegida en esta ranura sigue ofreciéndose (para poder cambiarla o dejarla)", () => {
    const low = items[0];
    expect(candidatesFor("kinetic", "warlock", items, { kinetic: refOf(low) }).map((c) => c.item.id)).toContain(low.id);
  });

  it("filtra por nombre sin importar mayúsculas", () => {
    expect(candidatesFor("kinetic", "warlock", items, {}, "  ALT ").map((c) => c.item.name)).toEqual(["Alta"]);
    expect(candidatesFor("kinetic", "warlock", items, {}, "zzz")).toEqual([]);
  });

  it("no hay candidatas bloqueadas si no hay otra exótica elegida", () => {
    const withExotic = [...items, piece("kinetic", { tier: "exotic", name: "Exótica" })];
    expect(candidatesFor("kinetic", "warlock", withExotic, {}).every((c) => c.blockedReason === null)).toBe(true);
  });

  it("con otra exótica de ARMA ya elegida en otra ranura, las exóticas de arma salen bloqueadas con su motivo", () => {
    const exoticA = piece("power", { tier: "exotic", name: "Exótica A" });
    const exoticB = piece("kinetic", { tier: "exotic", name: "Exótica B" });
    const legendary = piece("kinetic", { name: "Legendaria" });
    const c = candidatesFor("kinetic", "warlock", [exoticB, legendary], { power: refOf(exoticA) });
    expect(c.find((x) => x.item.name === "Exótica B")?.blockedReason).toMatch(/Exótica A.*solo permite una/);
    expect(c.find((x) => x.item.name === "Legendaria")?.blockedReason).toBeNull();
  });

  it("reemplazar la exótica de la MISMA ranura no está bloqueado", () => {
    const current = piece("kinetic", { tier: "exotic", name: "Actual" });
    const other = piece("kinetic", { tier: "exotic", name: "Otra" });
    const c = candidatesFor("kinetic", "warlock", [current, other], { kinetic: refOf(current) });
    expect(c.every((x) => x.blockedReason === null)).toBe(true);
  });

  it("armas y armaduras cuentan por separado", () => {
    const exoticWeapon = piece("kinetic", { tier: "exotic" });
    const exoticHelmet = piece("helmet", { tier: "exotic", name: "Casco exótico" });
    const c = candidatesFor("helmet", "warlock", [exoticHelmet], { kinetic: refOf(exoticWeapon) });
    expect(c[0].blockedReason).toBeNull();
  });
});

describe("modificar el borrador", () => {
  it("withSlot pone y quita sin mutar", () => {
    const w = piece("kinetic");
    const base: DraftItems = {};
    const filled = withSlot(base, "kinetic", w);
    expect(base).toEqual({});
    expect(filled.kinetic?.id).toBe(w.id);
    expect(withSlot(filled, "kinetic", null)).toEqual({});
    expect(filled.kinetic?.id).toBe(w.id);
  });

  it("al cambiar de clase se quitan las armaduras de otra clase y se conservan las armas", () => {
    const weapon = piece("kinetic");
    const mine = piece("helmet", { classType: "warlock" });
    const foreign = piece("legs", { classType: "titan" });
    const universal = piece("arms", { classType: null });
    const draft: DraftItems = { kinetic: refOf(weapon), helmet: refOf(mine), legs: refOf(foreign), arms: refOf(universal) };
    const out = dropOtherClassArmor(draft, "warlock", [weapon, mine, foreign, universal]);
    expect(Object.keys(out.draft).sort()).toEqual(["arms", "helmet", "kinetic"]);
    expect(out.dropped).toBe(1);
    expect(dropOtherClassArmor(draft, "titan", [weapon, mine, foreign, universal]).dropped).toBe(1); // la del hechicero
  });

  it("un arma nunca se descarta por clase, aunque el dato de clase sea raro", () => {
    const odd = piece("kinetic", { classType: "titan" }); // las armas normalmente no tienen clase
    const out = dropOtherClassArmor({ kinetic: refOf(odd) }, "warlock", [odd]);
    expect(out.dropped).toBe(0);
    expect(out.draft.kinetic).toBeDefined();
  });

  it("una pieza desconocida (ya no existe) no se descarta por clase: se conserva para avisarlo luego", () => {
    const ghost = piece("helmet");
    const out = dropOtherClassArmor({ helmet: refOf(ghost) }, "titan", []);
    expect(out.dropped).toBe(0);
    expect(out.draft.helmet).toBeDefined();
  });

  it("classOf usa la clase del personaje, y un valor por defecto sin personaje", () => {
    expect(classOf({ classType: "hunter" })).toBe("hunter");
    expect(classOf(undefined)).toBe("titan");
  });
});
