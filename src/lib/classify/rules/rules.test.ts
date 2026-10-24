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
