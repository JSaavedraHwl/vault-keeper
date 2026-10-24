import { randomUUID } from "node:crypto";
import type { ActionPlan, AuditEntry, PlannedAction } from "./types";

/**
 * Plan inverso de una ejecución anterior: devuelve al origen lo movido y restaura los candados.
 * Solo se revierte lo que salió bien, en orden inverso. Lo desmantelado en el juego no se puede recuperar:
 * esas acciones fallarán con «ítem no encontrado» y quedarán en el reporte.
 */
export function planUndo(entries: readonly AuditEntry[]): ActionPlan {
  const done = entries.filter((e) => e.ok && !e.dryRun);
  let counter = 0;

  const actions: PlannedAction[] = [];
  for (const { action } of [...done].reverse()) {
    const id = `undo-${++counter}`;
    if (action.kind === "transfer") {
      actions.push({ ...action, id, from: action.to, to: action.from, reason: "Deshacer: devolver al origen." });
    } else if (action.previous !== action.state) {
      actions.push({ ...action, id, state: action.previous, previous: action.state, reason: "Deshacer: restaurar el candado." });
    }
  }

  return {
    id: randomUUID(),
    kind: "undo",
    createdAt: new Date().toISOString(),
    dryRun: false,
    rounds: actions.length > 0 ? [{ index: 0, actions, note: `Deshacer ${actions.length} acciones.` }] : [],
    skipped: [],
    warnings:
      actions.length > 0
        ? ["Lo que ya desmantelaste en el juego no se puede recuperar; esas acciones fallarán."]
        : ["No hay nada que deshacer."],
  };
}
