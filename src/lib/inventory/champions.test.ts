import { describe, expect, it } from "vitest";
import {
  artifactChampionPerks,
  championStatus,
  championsInText,
  detectChampions,
  looksLikeChampionPerk,
  parseArtifactPerk,
  type ArtifactChampionPerk,
} from "./champions";

// Nombres reales del manifest (es), versión de octubre de 2026.
const BREAKERS = {
  1: { name: "Perforación de escudos" },
  2: { name: "Perturbación" },
  3: { name: "Aturdimiento" },
};
const WEAPON_TYPES = [
  "Fusil de pulsos", "Fusil de fusión", "Escopeta", "Pistola", "Cañón de mano", "Fusil de explorador",
  "Guja", "Lanzacohetes", "Fusil de rastreo", "Fusil automático", "Subfusil", "Espada", "Lanzagranadas",
  "Fusil de francotirador", "Arco de combate", "Ametralladora", "Fusil de fusión lineal",
];

describe("texto de los rasgos: etiquetas de la API", () => {
  it("detecta la capacidad por el nombre exacto entre corchetes", () => {
    expect(championsInText("Efectivo contra [Perforación de escudos] campeones de barrera.", BREAKERS)).toEqual(["barrier"]);
    expect(championsInText("Efectivo contra [Aturdimiento] campeones imparables.", BREAKERS)).toEqual(["unstoppable"]);
    expect(championsInText("Efectivo contra [Perturbación] campeones de sobrecarga.", BREAKERS)).toEqual(["overload"]);
  });

  it("varias capacidades en un mismo texto, sin duplicar", () => {
    const text = "Efectivo contra [Aturdimiento] y [Perturbación]. Otra vez [Aturdimiento].";
    expect(championsInText(text, BREAKERS).sort()).toEqual(["overload", "unstoppable"]);
  });

  it("solo cuenta la etiqueta, no cualquier mención de campeones", () => {
    expect(championsInText("Desestabilizar a un campeón rellena tu cargador.", BREAKERS)).toEqual([]);
    expect(championsInText("Daña a campeones imparables sin etiqueta", BREAKERS)).toEqual([]);
    expect(championsInText("Efectivo contra Aturdimiento sin corchetes", BREAKERS)).toEqual([]);
  });

  it("textos vacíos o sin nombres de la API no fallan", () => {
    expect(championsInText(undefined, BREAKERS)).toEqual([]);
    expect(championsInText("[Aturdimiento]", {})).toEqual([]);
  });
});

describe("detectChampions: vías propias del arma", () => {
  it("combina definición, categorías, instancia y rasgos, anotando la vía de cada una", () => {
    const caps = detectChampions({
      itemBreaker: 3,
      categoryHashes: [59, 1793728308],
      instanceBreaker: 3,
      plugDescriptions: ["Efectivo contra [Perturbación] campeones de sobrecarga.", undefined, "sin campeones"],
      breakerNames: BREAKERS,
    });
    expect(caps.find((c) => c.type === "unstoppable")?.via.sort()).toEqual(["instance", "item"]);
    expect(caps.find((c) => c.type === "barrier")?.via).toEqual(["item"]);
    expect(caps.find((c) => c.type === "overload")?.via).toEqual(["plug"]);
    expect(caps).toHaveLength(3);
  });

  it("un arma sin nada no tiene capacidad", () => {
    expect(detectChampions({ categoryHashes: [59, 3], plugDescriptions: [], breakerNames: BREAKERS })).toEqual([]);
    expect(detectChampions({ itemBreaker: 0, instanceBreaker: 0, breakerNames: BREAKERS })).toEqual([]);
  });

  it("valores de breakerType desconocidos se ignoran", () => {
    expect(detectChampions({ itemBreaker: 9, breakerNames: BREAKERS })).toEqual([]);
  });
});

describe("ventajas de artefacto: interpretar el nombre", () => {
  it.each([
    ["Cañón de mano antibarrera", "barrier", "Cañón de mano"],
    ["Fusil de francotirador antibarrera", "barrier", "Fusil de francotirador"],
    ["Fusil de pulsos de sobrecarga", "overload", "Fusil de pulsos"],
    ["Subfusil de sobrecarga", "overload", "Subfusil"],
    ["Escopeta de sobrecarga", "overload", "Escopeta"],
    ["Arco imparable", "unstoppable", "Arco de combate"], // «Arco» = «Arco de combate»
    ["Pistola imparable", "unstoppable", "Pistola"],
    ["Guja imparable", "unstoppable", "Guja"],
    ["Fusil de explorador imparable", "unstoppable", "Fusil de explorador"],
    ["Fusil automático antibarrera", "barrier", "Fusil automático"],
    ["Fusiles de rastreo de sobrecarga", "overload", "Fusil de rastreo"], // plural
    ["Cañón de mano imparable", "unstoppable", "Cañón de mano"],
    ["Fusil de fusión antibarrera", "barrier", "Fusil de fusión"], // exacto antes que «lineal»
  ] as const)("«%s»", (name, champion, weaponType) => {
    expect(parseArtifactPerk(name, WEAPON_TYPES)).toEqual({ champion, weaponType });
  });

  it("ignora mayúsculas y tildes", () => {
    expect(parseArtifactPerk("FUSIL AUTOMATICO ANTIBARRERA", WEAPON_TYPES)).toEqual({ champion: "barrier", weaponType: "Fusil automático" });
  });

  it("no interpreta lo que no es una ventaja de campeón con tipo de arma claro", () => {
    expect(parseArtifactPerk("Munición quiebraescudos", WEAPON_TYPES)).toBeNull();
    expect(parseArtifactPerk("Fusión desestabilizadora", WEAPON_TYPES)).toBeNull();
    expect(parseArtifactPerk("Ojiva anticampeones", WEAPON_TYPES)).toBeNull();
    expect(parseArtifactPerk("Cosa rara imparable", WEAPON_TYPES)).toBeNull(); // tipo de arma inexistente
  });

  it("un prefijo ambiguo no se adivina", () => {
    expect(parseArtifactPerk("Fusil imparable", WEAPON_TYPES)).toBeNull(); // hay muchos «Fusil de ...»
  });

  it("looksLikeChampionPerk", () => {
    expect(looksLikeChampionPerk("Ojiva anticampeones")).toBe(true);
    expect(looksLikeChampionPerk("Arco imparable")).toBe(true);
    expect(looksLikeChampionPerk("Sifón elemental")).toBe(false);
  });

  it("artifactChampionPerks separa lo interpretado de lo que hay que revisar", () => {
    const items = {
      1: { name: "Arco imparable" },
      2: { name: "Sifón elemental" },
      3: { name: "Ojiva anticampeones" },
      4: { name: "Fusiles de rastreo de sobrecarga" },
    };
    const { perks, unparsed } = artifactChampionPerks([1, 2, 3, 4, 99], items, WEAPON_TYPES);
    expect(perks.map((p) => p.hash)).toEqual([1, 4]);
    expect(unparsed).toEqual(["Ojiva anticampeones"]);
  });
});

describe("championStatus: capacidad de un arma para un personaje", () => {
  const perks: ArtifactChampionPerk[] = [
    { hash: 10, name: "Fusil de pulsos de sobrecarga", champion: "overload", weaponType: "Fusil de pulsos" },
    { hash: 11, name: "Fusil de pulsos antibarrera", champion: "barrier", weaponType: "Fusil de pulsos" },
    { hash: 12, name: "Arco imparable", champion: "unstoppable", weaponType: "Arco de combate" },
  ];
  const pulse = { type: "Fusil de pulsos" };

  it("una ventaja ACTIVA da la capacidad ahora; las inactivas del mismo tipo quedan como potenciales", () => {
    const s = championStatus(pulse, perks, new Set([10]));
    expect(s.now).toEqual([{ type: "overload", via: ["artifact"] }]);
    expect(s.potential).toEqual([{ type: "barrier", perk: "Fusil de pulsos antibarrera" }]);
  });

  it("depende del personaje: cambiar las ventajas activas cambia el resultado", () => {
    expect(championStatus(pulse, perks, new Set([11])).now.map((c) => c.type)).toEqual(["barrier"]);
    expect(championStatus(pulse, perks, new Set()).now).toEqual([]);
    expect(championStatus(pulse, perks, new Set()).potential).toHaveLength(2);
  });

  it("no mezcla tipos de arma", () => {
    const s = championStatus({ type: "Espada" }, perks, new Set([10, 11, 12]));
    expect(s).toEqual({ now: [], potential: [] });
  });

  it("une la capacidad propia del arma con la del artefacto, sin duplicar vías", () => {
    const withOwn = { type: "Fusil de pulsos", champions: [{ type: "overload" as const, via: ["plug" as const] }] };
    const s = championStatus(withOwn, perks, new Set([10]));
    expect(s.now).toEqual([{ type: "overload", via: ["plug", "artifact"] }]);
  });

  it("lo que el arma ya hace no aparece como potencial", () => {
    const withOwn = { type: "Fusil de pulsos", champions: [{ type: "barrier" as const, via: ["item" as const] }] };
    expect(championStatus(withOwn, perks, new Set()).potential).toEqual([{ type: "overload", perk: "Fusil de pulsos de sobrecarga" }]);
  });

  it("no modifica el arma de entrada", () => {
    const own = { type: "Fusil de pulsos", champions: [{ type: "barrier" as const, via: ["item" as const] }] };
    championStatus(own, perks, new Set([11]));
    expect(own.champions[0].via).toEqual(["item"]);
  });
});
