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
    return NextResponse.json({
      simulated,
      profileVersion: report.profileVersion,
      summary: report.summary,
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
