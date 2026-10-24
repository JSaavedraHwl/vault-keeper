import type { NextRequest } from "next/server";
import { canAccess, wantsSimulation } from "@/app/cleanup/access";
import type { PlanResponse } from "@/lib/actions/events";
import { buildPlan } from "@/lib/actions/service";
import { loadWorld, toActionsError } from "@/lib/actions/service-io";
import type { PlanKind } from "@/lib/actions/types";

export const dynamic = "force-dynamic";

const KINDS: PlanKind[] = ["lock-keepers", "move-junk", "undo"];

/** Calcula (sin ejecutar nada) el plan de una acción con los datos de este momento. */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    kind?: string;
    characterId?: unknown;
    limit?: unknown;
    dryRun?: unknown;
    simulate?: unknown;
  };
  const simulate = wantsSimulation(body.simulate);

  if (!KINDS.includes(body.kind as PlanKind)) {
    return Response.json({ kind: "other", message: "Tipo de acción no válido." }, { status: 400 });
  }
  if (!(await canAccess(simulate))) {
    return Response.json({ kind: "expired", message: "Tu sesión expiró. Inicia sesión de nuevo." }, { status: 401 });
  }

  try {
    const world = await loadWorld(simulate);
    const plan = buildPlan(world.ctx, {
      kind: body.kind as PlanKind,
      characterId: typeof body.characterId === "string" ? body.characterId : undefined,
      limit: typeof body.limit === "number" && Number.isFinite(body.limit) ? body.limit : undefined,
      dryRun: body.dryRun === true,
    });
    const response: PlanResponse = {
      plan,
      characters: world.ctx.characters as PlanResponse["characters"],
      simulated: world.simulated,
      vaultLock: world.ctx.capabilities.vaultLock,
      lastRunId: world.ctx.lastRun?.runId,
    };
    return Response.json(response);
  } catch (err) {
    const error = toActionsError(err);
    return Response.json(error, { status: error.kind === "plan" ? 422 : error.kind === "expired" ? 401 : 500 });
  }
}
