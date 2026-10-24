import { describe, expect, it } from "vitest";
import { toActionError } from "./errors";
import { MockInventoryActions } from "./mock";

const code = async (p: Promise<unknown>) => {
  try {
    await p;
    return null;
  } catch (e) {
    return toActionError(e).code;
  }
};

describe("el mock se comporta como la API (para que las pruebas valgan)", () => {
  const make = () =>
    new MockInventoryActions({
      items: {
        a: { location: "vault", locked: false },
        eq: { location: "c1", locked: false, equipped: true },
        b: { location: "vault", locked: false },
      },
      characterCapacity: { c1: 2 },
    });

  it("no deja mover un ítem equipado", async () => {
    expect(await code(make().transfer({ itemId: "eq", itemHash: 1, stackSize: 1, toVault: true, characterId: "c1" }))).toBe(1656);
  });

  it("falla si el ítem no está en el origen indicado o no existe", async () => {
    const m = make();
    expect(await code(m.transfer({ itemId: "a", itemHash: 1, stackSize: 1, toVault: true, characterId: "c1" }))).toBe(1646);
    expect(await code(m.transfer({ itemId: "zzz", itemHash: 1, stackSize: 1, toVault: false, characterId: "c1" }))).toBe(1623);
  });

  it("respeta la capacidad del personaje", async () => {
    const m = make(); // c1 ya tiene 1 (el equipado), capacidad 2
    await m.transfer({ itemId: "a", itemHash: 1, stackSize: 1, toVault: false, characterId: "c1" });
    expect(await code(m.transfer({ itemId: "b", itemHash: 1, stackSize: 1, toVault: false, characterId: "c1" }))).toBe(1642);
  });

  it("el candado en el alijo puede configurarse como no soportado", async () => {
    const m = new MockInventoryActions({ items: { a: { location: "vault", locked: false } }, vaultLockSupported: false });
    expect(await code(m.setLock({ itemId: "a", characterId: "c1", locked: true }))).toBe(1623);
    expect(m.items.a.locked).toBe(false);
  });

  it("no modifica el estado de entrada y registra las llamadas", async () => {
    const input = { a: { location: "vault", locked: false } };
    const m = new MockInventoryActions({ items: input });
    await m.setLock({ itemId: "a", characterId: "c1", locked: true });
    expect(input.a.locked).toBe(false);
    expect(m.calls).toEqual(["lock:a:true"]);
  });
});
