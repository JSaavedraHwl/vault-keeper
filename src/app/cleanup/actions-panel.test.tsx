import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { AnalysisData } from "@/lib/classify/analyze-vault";
import { ActionsPanel } from "./actions-panel";

const base: AnalysisData = {
  generatedAt: "2026-01-01T00:00:00Z",
  simulated: false,
  profileVersion: 1,
  items: [],
  ruleResults: [],
  overrides: { verdicts: {}, alwaysKeep: [] },
  characters: [
    { id: "c1", classType: "titan", light: 2000, free: { kinetic: 9, helmet: 4 } },
    { id: "c2", classType: "warlock", light: 1950, free: {} },
  ],
  vaultLock: true,
};

const html = (over: Partial<AnalysisData> = {}, simulate = false) =>
  renderToStaticMarkup(<ActionsPanel data={{ ...base, ...over }} simulate={simulate} onRefresh={() => {}} />);

describe("panel de acciones (estado inicial)", () => {
  it("muestra los tres botones y los personajes con su poder", () => {
    const out = html();
    expect(out).toContain("Bloquear los que conservo");
    expect(out).toContain("Mover basura a Titán");
    expect(out).toContain("Deshacer última ejecución");
    expect(out).toContain("Titán · poder 2000");
    expect(out).toContain("Hechicero · poder 1950");
    expect(out).toContain("13 huecos libres"); // 9 + 4 del primer personaje
  });

  it("«Deshacer» está desactivado mientras no haya una ejecución previa, y se activa con ella", () => {
    const undoButton = (out: string) => out.match(/<button[^>]*>Deshacer última ejecución<\/button>/)![0];
    expect(undoButton(html())).toMatch(/\sdisabled=""/);
    expect(undoButton(html({ lastRunId: "run-1" }))).not.toMatch(/\sdisabled=""/);
  });

  it("avisa de que el candado en el alijo no se ha probado solo cuando no se sabe", () => {
    expect(html({ vaultLock: undefined })).toContain("Aún no se ha probado el candado");
    expect(html({ vaultLock: true })).not.toContain("Aún no se ha probado el candado");
    expect(html({ vaultLock: false })).not.toContain("Aún no se ha probado el candado");
  });

  it("sin personajes, las acciones quedan desactivadas", () => {
    const out = html({ characters: [] });
    for (const label of ["Bloquear los que conservo", "Mover basura a"]) {
      expect(out.match(new RegExp(`<button[^>]*>${label}[^<]*</button>`))![0]).toMatch(/\sdisabled=""/);
    }
  });

  it("los controles de simulación solo aparecen en modo simulación", () => {
    expect(html({}, false)).not.toContain("Simular desmantelado");
    const sim = html({ simulated: true }, true);
    expect(sim).toContain("Simular desmantelado en el juego");
    expect(sim).toContain("Reiniciar el mundo de ejemplo");
  });

  it("deja claro que la app no desmantela", () => {
    expect(html()).toMatch(/no desmantela nada/);
  });
});
