// Resultado de equipar o mandar al inventario (un arma o un loadout entero). Presentación compartida.

import type { EquipOutcome } from "@/lib/actions/equip-service";
import type { ActionsError } from "@/lib/actions/events";

export type Equipping =
  | { state: "idle" }
  | { state: "running"; dryRun: boolean }
  | { state: "done"; outcome: EquipOutcome }
  | { state: "error"; error: ActionsError };

export function EquipResult({ equipping, onUndo, doneText = "Listo: arma equipada." }: { equipping: Equipping; onUndo: () => void; doneText?: string }) {
  if (equipping.state === "error") {
    return (
      <div className="mx-auto mt-3 max-w-7xl border border-red-500/60 bg-red-950/40 p-3 text-sm text-red-200" role="alert">
        {equipping.error.message}
        {equipping.error.kind === "expired" && <a href="/api/auth/login" className="link ml-2">Iniciar sesión</a>}
      </div>
    );
  }
  if (equipping.state !== "done") return null;
  const { outcome } = equipping;
  if (outcome.blocked) {
    return <div className="mx-auto mt-3 max-w-7xl border border-yellow-500/60 bg-yellow-950/40 p-3 text-sm text-yellow-100">{outcome.blocked.join(" ")}</div>;
  }
  return (
    <div className={`mx-auto mt-3 max-w-7xl border p-3 text-sm ${outcome.ok ? "border-green-500/60 bg-green-950/30 text-green-100" : "border-red-500/60 bg-red-950/40 text-red-100"}`} role="status">
      <p className="display text-base">
        {outcome.dryRun ? "Simulación: no se cambió nada." : outcome.ok ? doneText : "No se pudo completar."}
      </p>
      <ul className="mt-1 max-h-40 space-y-0.5 overflow-y-auto text-xs">
        {outcome.steps.map((s, i) => (
          <li key={i}>
            {s.ok ? "✓" : "✗"} {s.name} <span className="text-zinc-400">· {s.what}</span>
            {s.error && <span> — {s.error.message}</span>}
          </li>
        ))}
      </ul>
      {!outcome.dryRun && outcome.steps.some((s) => s.ok && !s.skipped) && (
        <button onClick={onUndo} className="btn btn-sm mt-2.5">Deshacer</button>
      )}
    </div>
  );
}
