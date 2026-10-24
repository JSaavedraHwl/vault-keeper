import type { NextRequest } from "next/server";
import { hasValidSession } from "@/lib/bungie/session";
import { EquipError, equipWeapon } from "@/lib/actions/equip-service";
import { toActionsError } from "@/lib/actions/service-io";

export const dynamic = "force-dynamic";

/**
 * Equipa un arma en un personaje. Del navegador solo se aceptan DOS identificadores (arma y personaje):
 * el plan se recalcula aquí con la cuenta recién leída, así que nada desactualizado llega a ejecutarse.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { itemId?: unknown; characterId?: unknown; dryRun?: unknown; mode?: unknown };
  const { itemId, characterId } = body;
  if (typeof itemId !== "string" || !itemId || itemId.length > 64 || typeof characterId !== "string" || !characterId || characterId.length > 64) {
    return Response.json({ kind: "other", message: "Petición no válida." }, { status: 400 });
  }
  if (!(await hasValidSession())) {
    return Response.json({ kind: "expired", message: "Tu sesión expiró. Inicia sesión de nuevo." }, { status: 401 });
  }

  try {
    const outcome = await equipWeapon({
      itemId,
      characterId,
      dryRun: body.dryRun === true,
      mode: body.mode === "send" ? "send" : "equip",
      signal: req.signal,
    });
    return Response.json(outcome);
  } catch (err) {
    if (err instanceof EquipError) return Response.json({ kind: "plan", message: err.message }, { status: 422 });
    const error = toActionsError(err);
    return Response.json(error, { status: error.kind === "expired" ? 401 : error.kind === "busy" ? 409 : 500 });
  }
}
