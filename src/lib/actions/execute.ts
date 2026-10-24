import { randomUUID } from "node:crypto";
import type { InventoryActions } from "../bungie/actions/api";
import { DEFAULT_ACTIONS_CONFIG, type ActionsConfig } from "./actions.config";
import { appendAudit, AUDIT_FILE } from "./audit";
import { runQueue, type QueueOutcome, type QueueTask } from "./queue";
import { VAULT, type ActionPlan, type ActionResult, type AuditEntry, type PlanRound, type PlannedAction } from "./types";

export interface ExecuteOptions {
  actions: InventoryActions;
  config?: ActionsConfig;
  /** Sin llamar a Bungie: todas las acciones salen como simuladas. */
  dryRun?: boolean;
  signal?: AbortSignal;
  onResult?: (result: ActionResult, done: number, total: number) => void;
  auditFile?: string;
  sleep?: (ms: number) => Promise<void>;
  runId?: string;
}

export interface ExecuteOutcome extends QueueOutcome {
  runId: string;
}

function toTask(action: PlannedAction, actions: InventoryActions): QueueTask {
  return {
    actionId: action.id,
    itemInstanceId: action.itemId,
    run:
      action.kind === "lock"
        ? () => actions.setLock({ itemId: action.itemId, characterId: action.characterId, locked: action.state })
        : () => {
            const toVault = action.to === VAULT;
            return actions.transfer({
              itemId: action.itemId,
              itemHash: action.hash,
              stackSize: action.stackSize,
              toVault,
              characterId: toVault ? action.from : action.to,
            });
          },
  };
}

/** Ejecuta una ronda del plan y registra cada acción en el log de auditoría. */
export async function executeRound(
  plan: Pick<ActionPlan, "id">,
  round: PlanRound,
  options: ExecuteOptions,
): Promise<ExecuteOutcome> {
  const config = options.config ?? DEFAULT_ACTIONS_CONFIG;
  const runId = options.runId ?? randomUUID();
  const dryRun = options.dryRun ?? false;
  const byId = new Map(round.actions.map((a) => [a.id, a]));

  let outcome: QueueOutcome;
  if (dryRun) {
    const results = round.actions.map<ActionResult>((a) => ({
      actionId: a.id,
      itemInstanceId: a.itemId,
      ok: true,
      skipped: true,
    }));
    results.forEach((r, i) => options.onResult?.(r, i + 1, results.length));
    outcome = { results, stopped: null };
  } else {
    outcome = await runQueue(
      round.actions.map((a) => toTask(a, options.actions)),
      { ...config, signal: options.signal, onResult: options.onResult, sleep: options.sleep },
    );
  }

  const at = new Date().toISOString();
  const entries: AuditEntry[] = outcome.results.map((r) => ({
    runId,
    planId: plan.id,
    at,
    dryRun,
    action: byId.get(r.actionId)!,
    // En simulación todo "sale bien"; en real, una acción que no llegó a ejecutarse no cuenta como hecha.
    ok: dryRun || (r.ok && !r.skipped),
    ...(r.error && { error: r.error }),
  }));
  await appendAudit(entries, options.auditFile ?? AUDIT_FILE);

  return { ...outcome, runId };
}
