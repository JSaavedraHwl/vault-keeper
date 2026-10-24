import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { DEFAULT_PROFILE } from "./profile";
import { loadProfile, saveProfile } from "./profile-store";

let dir: string;
let file: string;

beforeEach(async () => {
  dir = await mkdtemp(path.join(tmpdir(), "profile-test-"));
  file = path.join(dir, "usage-profile.json");
});
afterEach(() => rm(dir, { recursive: true, force: true }));

const { version: _v, ...validInput } = DEFAULT_PROFILE;
void _v;

describe("perfil de uso", () => {
  it("sin archivo devuelve el perfil por defecto", async () => {
    expect(await loadProfile(file)).toEqual({ profile: DEFAULT_PROFILE });
  });

  it("guardar y volver a cargar; la versión sube en cada guardado", async () => {
    const first = await saveProfile({ ...validInput, favoredPerks: ["Torrente"] }, file);
    expect(first).toMatchObject({ ok: true, profile: { version: 2 } });
    const second = await saveProfile(validInput, file);
    expect(second).toMatchObject({ ok: true, profile: { version: 3 } });

    const { profile } = await loadProfile(file);
    expect(profile.version).toBe(3);
    expect(JSON.parse(await readFile(file, "utf8")).version).toBe(3);
  });

  it("acepta PvE, Grandmaster y PvP en cualquiera de las tres clases", async () => {
    const result = await saveProfile(
      {
        ...validInput,
        classes: {
          ...validInput.classes,
          warlock: { ...validInput.classes.warlock, activities: ["pve", "grandmaster", "pvp"] },
        },
      },
      file,
    );
    expect(result.ok).toBe(true);
  });

  it.each([
    ["más de 3 stats prioritarias", { armorStatPriority: ["health", "class", "melee", "super"] }],
    ["stat inexistente", { armorStatPriority: ["velocidad"] }],
    ["actividad inexistente", { activities: ["raids"] }],
    ["total mínimo fuera de rango", { minArmorTotal: 500 }],
  ])("rechaza %s", async (_name, patch) => {
    const result = await saveProfile(
      { ...validInput, classes: { ...validInput.classes, titan: { ...validInput.classes.titan, ...patch } } },
      file,
    );
    expect(result.ok).toBe(false);
    await expect(readFile(file, "utf8")).rejects.toThrow(); // no se escribió nada
  });

  it("un archivo corrupto o inválido cae a los valores por defecto con aviso", async () => {
    await writeFile(file, "{no es json");
    expect((await loadProfile(file)).warning).toMatch(/JSON/);
    await writeFile(file, JSON.stringify({ version: 1 }));
    const loaded = await loadProfile(file);
    expect(loaded.profile).toEqual(DEFAULT_PROFILE);
    expect(loaded.warning).toBeDefined();
  });
});
