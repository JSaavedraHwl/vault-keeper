import type { NextRequest } from "next/server";
import { canAccess, wantsSimulation } from "@/app/cleanup/access";
import { randomUUID } from "node:crypto";
import { executeRounds } from "@/lib/actions/execute";
import type { ExecuteEvent, ResultLine } from "@/lib/actions/events";
import { PlanError, prepareExecution } from "@/lib/actions/service";
import { loadWorld, toActionsError, withRunLock } from "@/lib/actions/service-io";
import type { PlanKind, PlannedAction } from "@/lib/actions/types";
import { VAULT } from "@/lib/actions/types";

export const dynamic = "force-dynamic";

const KINDS: PlanKind[] = ["lock-keepers", "move-junk", "undo"];

function describe(action: PlannedAction, characters: Map<string, string>): string {
  const place = (p: string) => (p === VAULT ? "alijo" : (characters.get(p) ?? "personaje"));
  if (action.kind === "lock") return action.state ? "bloquear" : "desbloquear";
  if (action.kind === "equip") return `equipar en ${characters.get(action.characterId) ?? "personaje"}`;
  return `${place(action.from)} → ${place(action.to)}`;
}

/**
 * Ejecuta UNA ronda y emite el progreso línea a línea (NDJSON). El plan se recalcula aquí con datos
 * frescos: del navegador solo se aceptan los identificadores de lo que el usuario confirmó.
 * Si el navegador se desconecta (Cancelar), la cola se detiene tras la acción en curso.
 */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as {
    kind?: string;
    characterId?: unknown;
    confirmedItemIds?: unknown;
    runId?: unknown;
    dryRun?: unknown;
    simulate?: unknown;
  };
  const simulate = wantsSimulation(body.simulate);
  const kind = body.kind as PlanKind;
  const confirmed = Array.isArray(body.confirmedItemIds)
    ? body.confirmedItemIds.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 64)
    : [];

  if (!KINDS.includes(kind)) {
    return Response.json({ kind: "other", message: "Tipo de acción no válido." }, { status: 400 });
  }
  if (!(await canAccess(simulate))) {
    return Response.json({ kind: "expired", message: "Tu sesión expiró. Inicia sesión de nuevo." }, { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: ExecuteEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // el navegador ya se desconectó: no hay a quién avisar
        }
      };

      try {
        await withRunLock(async () => {
          const world = await loadWorld(simulate);
          const dryRun = body.dryRun === true;
          const request = {
            kind,
            dryRun,
            characterId: typeof body.characterId === "string" ? body.characterId : undefined,
          };

          // Deshacer: se confirma sobre una ejecución concreta; si cambió, no se hace nada.
          if (kind === "undo") {
            if (!world.ctx.lastRun || world.ctx.lastRun.runId !== body.runId) {
              throw new PlanError("La última ejecución cambió desde la vista previa. Vuelve a calcular el plan.");
            }
          }

          // Para deshacer, lo «confirmado» son los ítems del plan inverso fresco.
          const ids =
            kind === "undo"
              ? [...new Set(world.ctx.lastRun!.entries.filter((e) => e.ok).map((e) => e.action.itemId))]
              : confirmed;
          const execution = prepareExecution(world.ctx, request, ids);

          if (execution.rounds.length === 0) {
            send({
              type: "done",
              summary: {
                runId: "",
                dryRun,
                stopped: null,
                results: [],
                omitted: execution.omitted,
                remainingRounds: execution.remainingRounds,
              },
            });
            return;
          }

          const characterNames = new Map(world.ctx.characters.map((c) => [c.id, c.classType]));
          const byId = new Map(execution.rounds.flatMap((r) => r.actions).map((a) => [a.id, a]));
          const total = byId.size;
          const toLine = (r: { actionId: string; itemInstanceId: string; ok: boolean; skipped?: boolean; error?: ResultLine["error"] }): ResultLine => {
            const action = byId.get(r.actionId)!;
            return { ...r, name: action.name, kind: action.kind, what: describe(action, characterNames) };
          };

          // Todas las tandas de una acción encadenable (bloquear) se ejecutan seguidas, como una sola ejecución.
          const runId = randomUUID();
          send({ type: "start", runId, total });
          const outcome = await executeRounds({ id: execution.plan.id }, execution.rounds, {
            actions: world.actions,
            dryRun,
            runId,
            signal: req.signal,
            auditFile: world.auditFile,
            onResult: (r, done) => send({ type: "progress", line: toLine(r), done, total }),
          });
          const results = outcome.results.map(toLine);

          if (world.commit && !dryRun) world.commit();

          send({
            type: "done",
            summary: {
              runId: outcome.runId,
              dryRun,
              stopped: outcome.stopped,
              results,
              omitted: execution.omitted,
              remainingRounds: execution.remainingRounds,
            },
          });
        });
      } catch (err) {
        send({ type: "error", ...toActionsError(err) });
      } finally {
        try {
          controller.close();
        } catch {
          // ya cerrado
        }
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}
