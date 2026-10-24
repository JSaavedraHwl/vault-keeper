import type { NextRequest } from "next/server";
import { canAccess, wantsSimulation } from "@/app/cleanup/access";
import { loadAnalysisData, type AnalysisData, type AnalysisStage } from "@/lib/classify/analyze-vault";
import {
  BungieError,
  MaintenanceError,
  NeedsRefreshError,
  SessionExpiredError,
} from "@/lib/bungie/errors";

export const dynamic = "force-dynamic";

export type AnalyzeEvent =
  | { type: "stage"; stage: AnalysisStage }
  | { type: "done"; data: AnalysisData }
  | { type: "error"; kind: "expired" | "refresh" | "maintenance" | "bungie" | "other"; message: string };

function errorEvent(err: unknown): AnalyzeEvent {
  const message = err instanceof Error ? err.message : "Error desconocido.";
  if (err instanceof NeedsRefreshError) return { type: "error", kind: "refresh", message };
  if (err instanceof SessionExpiredError) return { type: "error", kind: "expired", message };
  if (err instanceof MaintenanceError) return { type: "error", kind: "maintenance", message };
  if (err instanceof BungieError) return { type: "error", kind: "bungie", message };
  return { type: "error", kind: "other", message };
}

/** Respuesta en NDJSON: una línea JSON por evento (etapas y resultado final). */
export async function POST(req: NextRequest) {
  const body = (await req.json().catch(() => ({}))) as { simulate?: unknown };
  const simulate = wantsSimulation(body.simulate);

  if (!(await canAccess(simulate))) {
    return Response.json(errorEvent(new SessionExpiredError()), { status: 401 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: AnalyzeEvent) => controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      try {
        const data = await loadAnalysisData({
          simulate,
          onStage: (stage) => send({ type: "stage", stage }),
        });
        send({ type: "done", data });
      } catch (err) {
        send(errorEvent(err));
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson; charset=utf-8" } });
}
