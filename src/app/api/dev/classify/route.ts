import { NextResponse, type NextRequest } from "next/server";
import { analyzeVault } from "@/lib/classify/analyze-vault";
import { hasValidSession } from "@/lib/bungie/session";
import { MaintenanceError, NeedsRefreshError, SessionExpiredError } from "@/lib/bungie/errors";

export const dynamic = "force-dynamic";

// Solo para desarrollo. ?sim=1 usa los datos de ejemplo (no necesita sesión de Bungie).
export async function GET(req: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "no disponible" }, { status: 404 });
  }
  const simulate = req.nextUrl.searchParams.get("sim") === "1" ? true : undefined;
  if (!simulate && !(await hasValidSession())) {
    return NextResponse.json({ error: "Sin sesión. Inicia sesión o usa ?sim=1." }, { status: 401 });
  }
  try {
    const { items, report, simulated } = await analyzeVault({ simulate });
    const names = new Map(items.map((i) => [i.id, i.name]));

    // Para calibrar umbrales: cuántas armaduras hay con cada total de stats, y qué regla decidió qué.
    const armorTotals: Record<string, number> = {};
    for (const item of items.filter((i) => i.kind === "armor")) {
      const key = item.armorTotal === undefined ? "sin stats" : String(item.armorTotal);
      armorTotals[key] = (armorTotals[key] ?? 0) + 1;
    }
    // Cruce nivel de la pieza × total de stats (¿explica el nivel los dos grupos de totales?).
    const armorByGearTier: Record<string, Record<string, number>> = {};
    for (const item of items.filter((i) => i.kind === "armor")) {
      const tier = item.gearTier === undefined ? "sin dato" : String(item.gearTier);
      const total = item.armorTotal === undefined ? "sin stats" : String(item.armorTotal);
      const row = (armorByGearTier[tier] ??= {});
      row[total] = (row[total] ?? 0) + 1;
    }
    const weaponGearTiers: Record<string, number> = {};
    for (const item of items.filter((i) => i.kind === "weapon")) {
      const tier = item.gearTier === undefined ? "sin dato" : String(item.gearTier);
      weaponGearTiers[tier] = (weaponGearTiers[tier] ?? 0) + 1;
    }
    const ruleHits: Record<string, number> = {};
    for (const r of report.results) {
      const key = `${r.ruleId ?? r.source} -> ${r.verdict}`;
      ruleHits[key] = (ruleHits[key] ?? 0) + 1;
    }

    return NextResponse.json({
      simulated,
      profileVersion: report.profileVersion,
      summary: report.summary,
      ruleHits,
      armorByGearTier: Object.fromEntries(
        Object.entries(armorByGearTier).map(([tier, row]) => [
          tier,
          Object.fromEntries(Object.entries(row).sort(([a], [b]) => Number(a) - Number(b))),
        ]),
      ),
      weaponGearTiers,
      armorTotals: Object.fromEntries(
        Object.entries(armorTotals).sort(([a], [b]) => Number(a) - Number(b)),
      ),
      results: report.results.map((r) => ({
        name: names.get(r.itemId),
        verdict: r.verdict,
        reason: r.reason,
        confidence: r.confidence,
        source: r.source,
        ruleId: r.ruleId,
      })),
    });
  } catch (err) {
    if (err instanceof NeedsRefreshError) {
      return NextResponse.redirect(new URL("/api/auth/refresh?next=/api/dev/classify", req.url));
    }
    const status = err instanceof SessionExpiredError ? 401 : err instanceof MaintenanceError ? 503 : 500;
    return NextResponse.json({ error: (err as Error).message }, { status });
  }
}
