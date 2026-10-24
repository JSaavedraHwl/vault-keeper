import type { NextRequest } from "next/server";
import { wantsSimulation } from "@/app/cleanup/access";
import { resetSimWorld, simDismantle } from "@/lib/actions/sim-world";

export const dynamic = "force-dynamic";

/**
 * Solo en modo simulación: imita «desmantelar en el juego» lo que hay en un personaje,
 * o reinicia el mundo de ejemplo. Nunca toca Bungie.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { action?: string; characterId?: unknown };
  if (!wantsSimulation(true)) {
    return Response.json({ kind: "other", message: "No disponible." }, { status: 404 });
  }
  if (body.action === "reset") {
    resetSimWorld();
    return Response.json({ ok: true });
  }
  if (body.action === "dismantle" && typeof body.characterId === "string") {
    return Response.json({ ok: true, dismantled: simDismantle(body.characterId) });
  }
  return Response.json({ kind: "other", message: "Acción no válida." }, { status: 400 });
}
