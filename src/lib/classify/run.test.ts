import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { vaultFixtures } from "../../../fixtures/vault-items";
import {
  applyManualVerdicts,
  EMPTY_OVERRIDES,
  loadOverrides,
  setAlwaysKeep,
  setManualVerdict,
} from "./overrides";
import { DEFAULT_PROFILE } from "./profile";
import { analyze, classifyWithRules } from "./run";
import type { Verdict } from "./types";

const verdictsOf = (report: ReturnType<typeof analyze>) =>
  Object.fromEntries(report.results.map((r) => [r.itemId, r.verdict]));

describe("análisis del alijo de ejemplo", () => {
  const report = analyze(vaultFixtures, { profile: DEFAULT_PROFILE });
  const v = verdictsOf(report);

  it("cada ítem recibe el veredicto esperado", () => {
    const expected: Record<string, Verdict> = {
      w101: "keep", // candado
      w102: "keep", // equipado
      w103: "junk", // rareza baja
      w104: "junk",
      w5001a: "keep", // mejor copia
      w5001b: "junk", // copia peor
      w5001c: "archive", // casi igual
      w106: "keep", // única copia
      w5002a: "keep",
      w5002b: "archive", // exótico: nunca junk
      a201: "junk",
      a202: "keep",
      a203: "archive",
      a204: "junk",
      a205: "keep",
      a206: "archive", // exótico
      a207: "keep", // candado
      o301: "keep",
      o302: "keep",
    };
    expect(v).toEqual(expected);
  });

  it("ningún ítem bloqueado o equipado es junk", () => {
    for (const item of vaultFixtures.filter((i) => i.locked || i.equipped)) {
      expect(v[item.id]).not.toBe("junk");
    }
  });

  it("el resumen cuadra con los resultados", () => {
    const { summary } = report;
    expect(summary.total).toBe(vaultFixtures.length);
    expect(Object.values(summary.counts).reduce((a, b) => a + b, 0)).toBe(summary.total);
    expect(summary.slotsFreed).toBe(summary.counts.junk);
    expect(summary.counts.junk).toBe(5);
  });

  it("cada resultado explica su razón", () => {
    for (const r of report.results) expect(r.reason.length).toBeGreaterThan(5);
  });

  it("el perfil cambia el resultado: sin cazador, sus armaduras ya no son basura", () => {
    const profile = {
      ...DEFAULT_PROFILE,
      version: 2,
      classes: { ...DEFAULT_PROFILE.classes, hunter: { ...DEFAULT_PROFILE.classes.hunter, enabled: false } },
    };
    const r = analyze(vaultFixtures, { profile });
    expect(verdictsOf(r).a204).toBe("archive");
    expect(r.profileVersion).toBe(2);
  });
});

describe("correcciones manuales", () => {
  it("un veredicto manual tiene prioridad sobre las reglas", () => {
    const overrides = {
      ...EMPTY_OVERRIDES,
      verdicts: { w103: { verdict: "keep" as const, at: "2026-01-01" } },
    };
    const r = analyze(vaultFixtures, { profile: DEFAULT_PROFILE, overrides });
    const result = r.results.find((x) => x.itemId === "w103")!;
    expect(result).toMatchObject({ verdict: "keep", source: "manual", confidence: 1 });
    expect(r.summary.bySource.manual).toBe(1);
  });

  it("«junk» manual se ignora en ítems con candado o equipados", () => {
    const overrides = {
      ...EMPTY_OVERRIDES,
      verdicts: {
        w101: { verdict: "junk" as const, at: "x" },
        w102: { verdict: "junk" as const, at: "x" },
      },
    };
    const v = verdictsOf(analyze(vaultFixtures, { profile: DEFAULT_PROFILE, overrides }));
    expect(v.w101).toBe("keep");
    expect(v.w102).toBe("keep");
  });

  it("«siempre conservar» protege un ítem que sería basura, incluso contra un junk manual", () => {
    const overrides = {
      verdicts: { w103: { verdict: "junk" as const, at: "x" } },
      alwaysKeep: ["w103"],
    };
    const v = verdictsOf(analyze(vaultFixtures, { profile: DEFAULT_PROFILE, overrides }));
    expect(v.w103).toBe("keep");
  });

  it("«siempre conservar» convierte en keep cualquier veredicto de las reglas", () => {
    const overrides = { ...EMPTY_OVERRIDES, alwaysKeep: ["w5001c", "a203"] }; // archive y archive
    const r = analyze(vaultFixtures, { profile: DEFAULT_PROFILE, overrides });
    const v = verdictsOf(r);
    expect(v.w5001c).toBe("keep");
    expect(v.a203).toBe("keep");
  });

  it("quitar «siempre conservar» devuelve el veredicto original de las reglas", () => {
    const rules = classifyWithRules(vaultFixtures, { profile: DEFAULT_PROFILE });
    const withKeep = applyManualVerdicts(rules, vaultFixtures, { ...EMPTY_OVERRIDES, alwaysKeep: ["w103"] });
    expect(withKeep.find((x) => x.itemId === "w103")!.verdict).toBe("keep");
    // Mismo resultado de reglas, sin la marca: vuelve a junk (la UI recalcula así, sin pasar por el servidor).
    const without = applyManualVerdicts(rules, vaultFixtures, EMPTY_OVERRIDES);
    expect(without.find((x) => x.itemId === "w103")!.verdict).toBe("junk");
  });

  it("applyManualVerdicts no toca ítems sin corrección", () => {
    const results = analyze(vaultFixtures, { profile: DEFAULT_PROFILE }).results;
    expect(applyManualVerdicts(results, vaultFixtures, EMPTY_OVERRIDES)).toEqual(results);
  });
});

describe("persistencia de correcciones", () => {
  let dir: string;
  let file: string;
  beforeEach(async () => {
    dir = await mkdtemp(path.join(tmpdir(), "overrides-test-"));
    file = path.join(dir, "overrides.json");
  });
  afterEach(() => rm(dir, { recursive: true, force: true }));

  it("sin archivo no hay correcciones", async () => {
    expect(await loadOverrides(file)).toEqual(EMPTY_OVERRIDES);
  });

  it("guarda, persiste entre cargas y permite quitar", async () => {
    await setManualVerdict("w103", "keep", file);
    await setAlwaysKeep("w104", true, file);
    const loaded = await loadOverrides(file);
    expect(loaded.verdicts.w103.verdict).toBe("keep");
    expect(loaded.alwaysKeep).toEqual(["w104"]);

    await setManualVerdict("w103", null, file);
    await setAlwaysKeep("w104", false, file);
    expect(await loadOverrides(file)).toEqual(EMPTY_OVERRIDES);
  });

  it("escrituras simultáneas no se pisan", async () => {
    await Promise.all(["a", "b", "c", "d", "e"].map((id) => setAlwaysKeep(id, true, file)));
    expect((await loadOverrides(file)).alwaysKeep.sort()).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("un archivo corrupto se trata como vacío", async () => {
    const { writeFile } = await import("node:fs/promises");
    await writeFile(file, "{roto");
    expect(await loadOverrides(file)).toEqual(EMPTY_OVERRIDES);
    expect(await readFile(file, "utf8")).toBe("{roto"); // cargar nunca reescribe
  });
});
