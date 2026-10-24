import { FATAL_KINDS, RETRYABLE_KINDS, toActionError, type ActionError } from "../bungie/actions/errors";
import type { ActionsConfig } from "./actions.config";
import type { ActionResult } from "./types";

export interface QueueTask {
  actionId: string;
  itemInstanceId: string;
  run: () => Promise<void>;
  /** actionIds que deben haber salido bien; si alguno falló, la tarea se salta sin llamar a la API. */
  requires?: readonly string[];
}

export type QueueStop =
  | { reason: "cancelled" }
  | { reason: "fatal"; error: ActionError }
  | null;

export interface QueueOutcome {
  results: ActionResult[];
  /** Por qué terminó antes de tiempo, o null si procesó todo. */
  stopped: QueueStop;
}

export interface QueueOptions
  extends Pick<ActionsConfig, "delayBetweenCallsMs" | "maxRetries" | "retryBaseDelayMs"> {
  signal?: AbortSignal;
  onResult?: (result: ActionResult, done: number, total: number) => void;
  /** Inyectable para pruebas. */
  sleep?: (ms: number) => Promise<void>;
}

const realSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Ejecuta las tareas de una en una, con pausa entre llamadas, reintentos con backoff ante
 * límites de peticiones, y parada ante errores que no se arreglan reintentando
 * (actividad en curso, mantenimiento, sesión) o al cancelar.
 * Las tareas que no llegan a ejecutarse se devuelven como `skipped`.
 */
export async function runQueue(tasks: readonly QueueTask[], options: QueueOptions): Promise<QueueOutcome> {
  const sleep = options.sleep ?? realSleep;
  const results: ActionResult[] = [];
  let stopped: QueueStop = null;
  let calls = 0;

  const notSent = (task: QueueTask, error: ActionError): ActionResult => ({
    actionId: task.actionId,
    itemInstanceId: task.itemInstanceId,
    ok: false,
    skipped: true,
    error,
  });

  for (const task of tasks) {
    if (!stopped && options.signal?.aborted) stopped = { reason: "cancelled" };
    if (stopped) {
      const error: ActionError =
        stopped.reason === "cancelled"
          ? { kind: "unknown", message: "Cancelado antes de ejecutarse." }
          : { kind: stopped.error.kind, code: stopped.error.code, message: "No se ejecutó: la cola se detuvo antes." };
      const result = notSent(task, error);
      results.push(result);
      options.onResult?.(result, results.length, tasks.length);
      continue;
    }

    // Un paso que depende de otro que falló no se intenta: el error útil es el del paso anterior.
    const failedDependency = task.requires
      ?.map((id) => results.find((r) => r.actionId === id))
      .find((r) => r && !r.ok);
    if (failedDependency) {
      const cause = failedDependency.error;
      const result = notSent(task, {
        kind: cause?.kind ?? "unknown",
        code: cause?.code,
        message: `No se intentó porque falló el paso anterior${cause ? `: ${cause.message}` : "."}`,
      });
      results.push(result);
      options.onResult?.(result, results.length, tasks.length);
      continue;
    }

    let result: ActionResult | null = null;
    for (let attempt = 0; attempt <= options.maxRetries; attempt++) {
      if (calls > 0) await sleep(options.delayBetweenCallsMs);
      calls += 1;
      try {
        await task.run();
        result = { actionId: task.actionId, itemInstanceId: task.itemInstanceId, ok: true };
        break;
      } catch (err) {
        const error = toActionError(err);
        const canRetry = RETRYABLE_KINDS.has(error.kind) && attempt < options.maxRetries;
        if (canRetry) {
          await sleep(options.retryBaseDelayMs * 2 ** attempt);
          continue;
        }
        result = { actionId: task.actionId, itemInstanceId: task.itemInstanceId, ok: false, error };
        if (FATAL_KINDS.has(error.kind)) stopped = { reason: "fatal", error };
        break;
      }
    }
    results.push(result!);
    options.onResult?.(result!, results.length, tasks.length);
  }

  return { results, stopped };
}
