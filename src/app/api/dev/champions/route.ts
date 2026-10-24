import { NextResponse } from "next/server";
import { MaintenanceError, NeedsRefreshError, SessionExpiredError } from "@/lib/bungie/errors";
import { hasValidSession } from "@/lib/bungie/session";
import { CHAMPION_LABELS, CHAMPIONS, championStatus, type Champion } from "@/lib/inventory/champions";
import { loadGearData } from "@/lib/inventory/gear";

export const dynamic = "force-dynamic";

const CLASS_LABELS = { titan: "Titán", hunter: "Cazador", warlock: "Hechicero" } as const;

/**
 * Diagnóstico (solo fuera de producción, con sesión): contrasta la detección de campeones con TU cuenta.
 * Responde, sobre todo: ¿el `breakerType` de la instancia ya incluye las ventajas de artefacto activas?
 */
export async function GET() {
  if (process.env.NODE_ENV === "production") return NextResponse.json({ error: "no disponible" }, { status: 404 });
  if (!(await hasValidSession())) return NextResponse.json({ error: "Sin sesión." }, { status: 401 });

  try {
    const { items, characters, artifact } = await loadGearData();
    const perkName = new Map(artifact.perks.map((p) => [p.hash, p.name]));

    // 1. Capacidad propia de las armas, por vía.
    const byVia: Record<string, number> = {};
    const byChampion: Record<string, string[]> = {};
    for (const w of items) {
      for (const cap of w.champions ?? []) {
        for (const via of cap.via) byVia[via] = (byVia[via] ?? 0) + 1;
        (byChampion[CHAMPION_LABELS[cap.type]] ??= []).push(`${w.name} (${w.type}, vía ${cap.via.join("+")})`);
      }
    }

    // 2. LA PRUEBA: para las ventajas de campeón activas de cada personaje, ¿las armas de ese tipo
    //    ya traen la capacidad en la instancia?
    const instanceTest = characters.map((c) => {
      const active = new Set(c.activeArtifactPerks);
      const rows = artifact.perks
        .filter((p) => active.has(p.hash))
        .map((p) => {
          const weapons = items.filter((w) => w.type === p.weaponType);
          const withInstance = weapons.filter((w) => w.champions?.some((cap) => cap.type === p.champion && cap.via.includes("instance")));
          return { ventaja: p.name, armasDeEseTipo: weapons.length, conCapacidadEnLaInstancia: withInstance.length };
        });
      return { personaje: `${CLASS_LABELS[c.classType]} · ${c.light}`, ventajasDeCampeonActivas: rows };
    });

    // 3. Vista final: cuántas armas tendría cada capacidad ahora / potencialmente, por personaje.
    const summary = characters.map((c) => {
      const active = new Set(c.activeArtifactPerks);
      const now: Record<string, number> = {};
      const potential: Record<string, number> = {};
      for (const w of items) {
        const s = championStatus(w, artifact.perks, active);
        for (const cap of s.now) now[CHAMPION_LABELS[cap.type]] = (now[CHAMPION_LABELS[cap.type]] ?? 0) + 1;
        for (const p of s.potential) potential[CHAMPION_LABELS[p.type]] = (potential[CHAMPION_LABELS[p.type]] ?? 0) + 1;
      }
      return { personaje: `${CLASS_LABELS[c.classType]} · ${c.light}`, ahora: now, siActivasLaVentaja: potential };
    });

    return NextResponse.json({
      armas: { total: items.length, enAlijo: items.filter((i) => i.location === "vault").length, enPersonajes: items.filter((i) => i.location === "character").length, equipadas: items.filter((i) => i.equipped).length },
      artefacto: {
        nombre: artifact.name,
        ventajasDeCampeonInterpretadas: artifact.perks.map((p) => `${p.name} → ${CHAMPION_LABELS[p.champion]} / ${p.weaponType}`),
        ventajasQueNoSePudieronInterpretar: artifact.unparsed,
        activasPorPersonaje: characters.map((c) => ({
          personaje: `${CLASS_LABELS[c.classType]} · ${c.light}`,
          activasDeCampeon: c.activeArtifactPerks.map((h) => perkName.get(h)).filter(Boolean),
          totalActivas: c.activeArtifactPerks.length,
        })),
      },
      capacidadPropiaDelArma: { porVia: byVia, ejemplos: Object.fromEntries(Object.entries(byChampion).map(([k, v]) => [k, v.slice(0, 6)])), cantidad: Object.fromEntries(Object.entries(byChampion).map(([k, v]) => [k, v.length])) },
      pruebaInstanciaVsArtefacto: instanceTest,
      resumenPorPersonaje: summary,
      campeones: CHAMPIONS.map((c: Champion) => CHAMPION_LABELS[c]),
    });
  } catch (err) {
    if (err instanceof NeedsRefreshError) return NextResponse.redirect(new URL("/api/auth/refresh?next=/api/dev/champions", "https://localhost:3000"));
    const status = err instanceof SessionExpiredError ? 401 : err instanceof MaintenanceError ? 503 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
