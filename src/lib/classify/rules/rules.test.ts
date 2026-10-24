import { describe, expect, it } from "vitest";
import { DEFAULT_CONFIG, type ClassifyConfig } from "../classify.config";
import { classifyItems } from "../engine";
import { DEFAULT_PROFILE, type UsageProfile } from "../profile";
import { makeArmor, makeItem } from "../testing";

const profileWith = (patch: Partial<UsageProfile>): UsageProfile => ({ ...DEFAULT_PROFILE, ...patch });
const configWith = (patch: Partial<ClassifyConfig>): ClassifyConfig => ({ ...DEFAULT_CONFIG, ...patch });

const one = (item: ReturnType<typeof makeItem>, opts = {}) => classifyItems([item], opts)[0];

describe("protección", () => {
  it("un ítem con candado es keep aunque la rareza sea baja", () => {
    const r = one(makeItem({ tier: "common", locked: true }));
    expect(r.verdict).toBe("keep");
    expect(r.ruleId).toBe("protected");
  });

  it("un ítem equipado es keep", () => {
    expect(one(makeItem({ tier: "common", equipped: true })).verdict).toBe("keep");
  });

  it("«siempre conservar» es keep", () => {
    const item = makeItem({ tier: "common" });
    expect(one(item, { protectedIds: new Set([item.id]) }).verdict).toBe("keep");
  });

  it("excepciones por hash y por nombre", () => {
    const byHash = makeItem({ tier: "common", hash: 42 });
    const byName = makeItem({ tier: "common", name: "Mi favorita" });
    const config = configWith({ exceptions: { hashes: [42], names: ["Mi favorita"] } });
    expect(one(byHash, { config }).ruleId).toBe("exceptions");
    expect(one(byName, { config }).verdict).toBe("keep");
  });
});

describe("protección: la regla decide, no solo la red de seguridad", () => {
  it("equipado y «siempre conservar» los resuelve la regla `protected`", () => {
    const equipped = makeItem({ tier: "common", equipped: true });
    const kept = makeItem({ tier: "common" });
    expect(one(equipped).ruleId).toBe("protected");
    expect(one(equipped).reason).toMatch(/equipado/i);
    const r = one(kept, { protectedIds: new Set([kept.id]) });
    expect(r.ruleId).toBe("protected");
    expect(r.reason).toMatch(/siempre conservar/i);
  });
});

describe("fronteras exactas de los umbrales", () => {
  // Por defecto: basura bajo 60, conservar desde 68.
  it("total == umbral de basura no es basura; uno menos sí", () => {
    expect(one(makeArmor([10, 10, 10, 10, 10, 10])).verdict).not.toBe("junk"); // 60
    expect(one(makeArmor([10, 10, 10, 10, 10, 9])).verdict).toBe("junk"); // 59
  });

  it("total == umbral de conservar es keep; uno menos no", () => {
    expect(one(makeArmor([12, 11, 11, 11, 11, 12])).verdict).toBe("keep"); // 68
    expect(one(makeArmor([12, 11, 11, 11, 11, 11])).verdict).toBe("archive"); // 67
  });

  it("diferencia == surplusGap es basura; menos, archivo", () => {
    const config = configWith({
      duplicates: { perkWeight: 10, statWeight: 1, powerWeight: 0, tierWeight: 0, surplusGap: 5 },
    });
    const best = makeItem({ hash: 11, stats: stat(15) });
    const exact = makeItem({ hash: 11, stats: stat(10) }); // gap 5
    const close = makeItem({ hash: 11, stats: stat(11) }); // gap 4
    const results = classifyItems([best, exact, close], { config });
    expect(results[1].verdict).toBe("junk");
    expect(results[2].verdict).toBe("archive");
  });
});

const stat = (value: number) => [{ name: "Estabilidad", value }];

describe("rareza baja", () => {
  it.each(["common", "uncommon", "rare"] as const)("%s en armas y armaduras es junk", (tier) => {
    expect(one(makeItem({ tier })).verdict).toBe("junk");
    expect(one(makeArmor([10, 10, 10, 10, 10, 10], { tier })).verdict).toBe("junk");
  });

  it("no afecta a ítems que no son armas ni armaduras", () => {
    expect(one(makeItem({ kind: "other", tier: "common" })).ruleId).toBe("otherItems");
  });
});

describe("armaduras", () => {
  it("total bajo el umbral → junk", () => {
    const r = one(makeArmor([8, 8, 8, 8, 8, 8])); // 48
    expect(r.verdict).toBe("junk");
    expect(r.ruleId).toBe("armor");
  });

  it("total alto → keep", () => {
    expect(one(makeArmor([12, 12, 12, 12, 12, 12])).verdict).toBe("keep"); // 72
  });

  it("total alto pero stats prioritarias bajas → archive", () => {
    const profile = profileWith({
      classes: {
        ...DEFAULT_PROFILE.classes,
        titan: { ...DEFAULT_PROFILE.classes.titan, armorStatPriority: ["health", "class"] },
      },
    });
    // salud y clase en 2: suma 4, muy por debajo de 40
    const item = makeArmor([30, 2, 2, 30, 4, 4]); // 72
    expect(one(item, { profile }).verdict).toBe("archive");
  });

  it("zona intermedia con stats prioritarias buenas → archive", () => {
    const profile = profileWith({
      classes: {
        ...DEFAULT_PROFILE.classes,
        titan: { ...DEFAULT_PROFILE.classes.titan, armorStatPriority: ["health", "class"] },
      },
    });
    const item = makeArmor([5, 25, 20, 5, 5, 5]); // 65, prioridad 45
    expect(one(item, { profile }).verdict).toBe("archive");
  });

  it("el umbral propio de la clase sustituye al global", () => {
    const profile = profileWith({
      classes: { ...DEFAULT_PROFILE.classes, titan: { ...DEFAULT_PROFILE.classes.titan, minArmorTotal: 50 } },
    });
    const item = makeArmor([9, 9, 9, 9, 9, 9]); // 54: basura con 60, no con 50
    expect(one(item).verdict).toBe("junk");
    expect(one(item, { profile }).verdict).not.toBe("junk");
  });

  it("clase desactivada no genera junk por stats", () => {
    const profile = profileWith({
      classes: { ...DEFAULT_PROFILE.classes, hunter: { ...DEFAULT_PROFILE.classes.hunter, enabled: false } },
    });
    const r = one(makeArmor([8, 8, 8, 8, 8, 8], { classType: "hunter" }), { profile });
    expect(r.verdict).toBe("archive");
  });
});

describe("armaduras por nivel de pieza (gearTier)", () => {
  // Un total típico de cada nivel, según el alijo real: N1≈55, N2≈60, N3≈66, N4≈72, N5=75.
  const piece = (tier: number, total: number, over = {}) => {
    const base = Math.floor(total / 6);
    const rest = total - base * 6;
    return makeArmor([base + rest, base, base, base, base, base], { gearTier: tier, ...over });
  };

  it.each([
    [1, 55, "junk"],
    [2, 60, "junk"],
    [2, 63, "junk"],
    [3, 66, "archive"],
    [3, 69, "archive"],
    [4, 72, "keep"],
    [4, 75, "keep"],
    [5, 75, "keep"],
  ] as const)("nivel %i con total %i → %s", (tier, total, verdict) => {
    expect(one(piece(tier, total)).verdict).toBe(verdict);
  });

  it("un total excepcional se conserva aunque el nivel sea bajo", () => {
    const r = one(piece(2, 88));
    expect(r.verdict).toBe("keep");
    expect(r.reason).toMatch(/excepcional/i);
    expect(one(piece(2, 75)).verdict).toBe("junk"); // 75 < 76: no es excepcional
    expect(one(piece(2, 76)).verdict).toBe("keep"); // frontera exacta
  });

  it("el nivel manda sobre el total: nivel 1 con total alto sigue siendo basura", () => {
    expect(one(piece(1, 70)).verdict).toBe("junk");
  });

  it("sin nivel (0 o ausente) se usa el total, como antes", () => {
    expect(one(piece(0, 50)).verdict).toBe("junk");
    expect(one(piece(0, 72)).verdict).toBe("keep");
    expect(one(makeArmor([10, 10, 10, 10, 10, 9])).verdict).toBe("junk"); // sin gearTier
  });

  it("nivel intermedio con stats prioritarias bajas → revisar", () => {
    const profile = profileWith({
      classes: {
        ...DEFAULT_PROFILE.classes,
        titan: { ...DEFAULT_PROFILE.classes.titan, armorStatPriority: ["health", "class"] },
      },
    });
    const item = makeArmor([30, 2, 2, 20, 6, 6], { gearTier: 3 }); // 66, salud+clase = 4
    expect(one(item, { profile }).verdict).toBe("needs_review");
  });

  it("nivel alto con stats prioritarias bajas → archivar, no conservar sin más", () => {
    const profile = profileWith({
      classes: {
        ...DEFAULT_PROFILE.classes,
        titan: { ...DEFAULT_PROFILE.classes.titan, armorStatPriority: ["health", "class"] },
      },
    });
    const item = makeArmor([30, 2, 2, 24, 8, 6], { gearTier: 5 }); // 72
    expect(one(item, { profile }).verdict).toBe("archive");
  });

  it("el mínimo propio de la clase descarta piezas aunque su nivel sea alto", () => {
    const profile = profileWith({
      classes: { ...DEFAULT_PROFILE.classes, titan: { ...DEFAULT_PROFILE.classes.titan, minArmorTotal: 73 } },
    });
    expect(one(piece(4, 72), { profile }).verdict).toBe("junk");
  });

  it("armadura sin ninguna stat informada → revisar, no basura", () => {
    const item = makeArmor([0, 0, 0, 0, 0, 0], { gearTier: 0 });
    const r = one(item);
    expect(r.verdict).toBe("needs_review");
    expect(r.reason).toMatch(/sin|no tiene stats/i);
  });

  it("reproduce el alijo real (421 armaduras): el nivel ordena el resultado", () => {
    // Distribución observada por nivel → [nivel, total, cantidad]
    const observed: [number, number, number][] = [
      [1, 55, 9], [1, 53, 5], [2, 59, 14], [2, 60, 19], [2, 62, 16],
      [3, 65, 41], [3, 66, 53], [3, 67, 47], [3, 68, 22],
      [4, 72, 16], [4, 73, 14], [4, 74, 15], [5, 75, 18], [5, 85, 7],
    ];
    const items = observed.flatMap(([tier, total, n]) => Array.from({ length: n }, () => piece(tier, total)));
    const counts = { junk: 0, archive: 0, keep: 0, needs_review: 0 };
    for (const r of classifyItems(items)) counts[r.verdict] += 1;
    expect(counts).toEqual({ junk: 63, archive: 163, keep: 70, needs_review: 0 });
  });
});

describe("duplicados: el nivel de la pieza pesa", () => {
  it("a igual arma, la copia de mayor nivel es la mejor", () => {
    const low = makeItem({ hash: 21, gearTier: 3 });
    const high = makeItem({ hash: 21, gearTier: 5 });
    const [rLow, rHigh] = classifyItems([low, high]);
    expect(rHigh.verdict).toBe("keep");
    expect(rLow.verdict).toBe("junk");
  });

  it("un perk favorito compensa un nivel", () => {
    const profile = profileWith({ favoredPerks: ["Torrente"] });
    const higherTier = makeItem({ hash: 22, gearTier: 4 });
    const withPerk = makeItem({ hash: 22, gearTier: 3, perks: [{ name: "Torrente" }] });
    const [a, b] = classifyItems([higherTier, withPerk], { profile });
    // Empatan (10 puntos cada uno): ninguna es basura, solo una se archiva.
    expect([a.verdict, b.verdict]).not.toContain("junk");
  });

  it("sin gearTier el comportamiento anterior no cambia", () => {
    const [, b] = classifyItems([makeItem({ hash: 23 }), makeItem({ hash: 23 })]);
    expect(b.verdict).toBe("archive");
  });
});

describe("duplicados", () => {
  it("la mejor copia es keep y la peor junk", () => {
    const strong = makeItem({ hash: 7, power: 250, stats: [{ name: "x", value: 80 }] });
    const weak = makeItem({ hash: 7, power: 200, stats: [{ name: "x", value: 40 }] });
    const [a, b] = classifyItems([weak, strong]);
    expect(a.verdict).toBe("junk");
    expect(a.ruleId).toBe("duplicateSurplus");
    expect(b.verdict).toBe("keep");
    expect(b.ruleId).toBe("bestCopy");
  });

  it("los perks favoritos pesan en la elección", () => {
    const profile = profileWith({ favoredPerks: ["Torrente"] });
    const withPerk = makeItem({ hash: 9, perks: [{ name: "Torrente" }] });
    const without = makeItem({ hash: 9, stats: [{ name: "x", value: 20 }] });
    const [a, b] = classifyItems([without, withPerk], { profile });
    expect(b.verdict).toBe("keep");
    expect(a.verdict).toBe("junk");
  });

  it("copias casi equivalentes se archivan en vez de marcarse como basura", () => {
    const [, b] = classifyItems([makeItem({ hash: 5 }), makeItem({ hash: 5 })]);
    expect(b.verdict).toBe("archive");
  });

  it("un arma sin duplicados es keep", () => {
    expect(one(makeItem()).verdict).toBe("keep");
  });

  it("una copia con candado no se marca como basura aunque sea la peor", () => {
    const strong = makeItem({ hash: 3, power: 300, stats: [{ name: "x", value: 90 }] });
    const lockedWeak = makeItem({ hash: 3, locked: true });
    const results = classifyItems([strong, lockedWeak]);
    expect(results[1].verdict).toBe("keep");
  });
});

describe("preferencias de arma", () => {
  const profile = profileWith({ weaponPreferences: { pve: ["Rifle de pulsos"] } });

  it("un tipo no usado se archiva", () => {
    expect(one(makeItem({ type: "Espada" }), { profile }).verdict).toBe("archive");
  });

  it("un tipo preferido se conserva", () => {
    expect(one(makeItem({ type: "Rifle de pulsos" }), { profile }).verdict).toBe("keep");
  });

  it("sin preferencias no se aplica", () => {
    expect(one(makeItem({ type: "Espada" })).ruleId).toBe("bestCopy");
  });

  it("solo cuentan las actividades de clases activas", () => {
    const p = profileWith({
      classes: {
        ...DEFAULT_PROFILE.classes,
        hunter: { ...DEFAULT_PROFILE.classes.hunter, enabled: false, activities: ["pvp"] },
      },
      weaponPreferences: { pve: ["Rifle de pulsos"], pvp: ["Espada"] },
    });
    expect(one(makeItem({ type: "Espada" }), { profile: p }).verdict).toBe("archive");
  });
});

describe("obsoletos", () => {
  it("por hash, por patrón de nombre y por poder", () => {
    const config = configWith({
      obsolete: { hashes: [77], namePatterns: ["^Antigua"], belowPower: 100, verdict: "junk" },
    });
    expect(one(makeItem({ hash: 77 }), { config }).ruleId).toBe("obsolete");
    expect(one(makeItem({ name: "antigua espada" }), { config }).ruleId).toBe("obsolete");
    expect(one(makeItem({ power: 50 }), { config }).verdict).toBe("junk");
    expect(one(makeItem({ power: 150 }), { config }).ruleId).not.toBe("obsolete");
  });

  it("el veredicto es el configurado", () => {
    const config = configWith({
      obsolete: { hashes: [77], namePatterns: [], belowPower: null, verdict: "archive" },
    });
    expect(one(makeItem({ hash: 77 }), { config }).verdict).toBe("archive");
  });
});

describe("otros ítems", () => {
  it("usan el veredicto configurado", () => {
    const item = makeItem({ kind: "other" });
    expect(one(item).verdict).toBe("keep");
    expect(one(item, { config: configWith({ otherItems: { verdict: "archive" } }) }).verdict).toBe("archive");
  });
});
