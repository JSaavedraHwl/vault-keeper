"use client";

import { useMemo, useRef, useState } from "react";
import type { ActionsError, ExecuteEvent, ExecutionSummary, PlanResponse, ResultLine } from "@/lib/actions/events";
import type { PlanKind, PlannedAction } from "@/lib/actions/types";
import { VAULT } from "@/lib/actions/types";
import type { AnalysisData } from "@/lib/classify/analyze-vault";
import type { CharacterInfo } from "@/lib/inventory/types";

const CLASS_LABELS: Record<CharacterInfo["classType"], string> = {
  titan: "Titán",
  hunter: "Cazador",
  warlock: "Hechicero",
};

const ERROR_TITLES: Record<ActionsError["kind"], string> = {
  expired: "Sesión expirada",
  refresh: "Renovando sesión",
  maintenance: "Bungie en mantenimiento",
  busy: "Ejecución en curso",
  plan: "No se puede preparar la acción",
  bungie: "Error de la API de Bungie",
  other: "Algo salió mal",
};

type Stage = "idle" | "planning" | "confirm" | "running" | "report";

interface RoundItem {
  id: string;
  name: string;
  what: string;
}

const describe = (a: PlannedAction, label: (id: string) => string) =>
  a.kind === "lock"
    ? a.state ? "bloquear" : "desbloquear"
    : `${a.from === VAULT ? "alijo" : label(a.from)} → ${a.to === VAULT ? "alijo" : label(a.to)}`;

export function ActionsPanel({
  data,
  simulate,
  onRefresh,
}: {
  data: AnalysisData;
  simulate: boolean;
  /** Vuelve a leer el alijo (tras ejecutar algo, lo que había cambia). */
  onRefresh: () => void;
}) {
  const { characters } = data;
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");
  const [stage, setStage] = useState<Stage>("idle");
  const [kind, setKind] = useState<PlanKind>("lock-keepers");
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [count, setCount] = useState(0);
  const [lines, setLines] = useState<ResultLine[]>([]);
  const [progress, setProgress] = useState({ done: 0, total: 0 });
  const [summary, setSummary] = useState<ExecutionSummary | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [error, setError] = useState<ActionsError | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const character = characters.find((c) => c.id === characterId);
  const label = useMemo(() => {
    const byId = new Map(characters.map((c) => [c.id, CLASS_LABELS[c.classType]]));
    return (id: string) => byId.get(id) ?? "personaje";
  }, [characters]);

  const roundItems: RoundItem[] = useMemo(() => {
    const first = plan?.plan.rounds[0];
    if (!first) return [];
    const seen = new Map<string, RoundItem>();
    for (const a of first.actions) {
      if (!seen.has(a.itemId)) seen.set(a.itemId, { id: a.itemId, name: a.name, what: describe(a, label) });
    }
    return [...seen.values()];
  }, [plan, label]);

  const busy = stage === "planning" || stage === "running";

  async function post(path: string, body: unknown, signal?: AbortSignal) {
    return fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal });
  }

  function fail(e: ActionsError) {
    if (e.kind === "refresh") {
      // Navegación completa: es una ruta de API que escribe cookies y redirige.
      // eslint-disable-next-line @next/next/no-location-assign-relative-destination
      window.location.href = "/api/auth/refresh?next=/cleanup";
      return;
    }
    setError(e);
    setStage("idle");
  }

  async function startPlan(nextKind: PlanKind) {
    setKind(nextKind);
    setError(null);
    setSummary(null);
    setStage("planning");
    try {
      const res = await post("/api/actions/plan", { kind: nextKind, characterId, simulate });
      const body = await res.json();
      if (!res.ok) return fail(body as ActionsError);
      const response = body as PlanResponse;
      setPlan(response);
      const size = new Set((response.plan.rounds[0]?.actions ?? []).map((a) => a.itemId)).size;
      setCount(size);
      setStage("confirm");
    } catch (err) {
      fail({ kind: "other", message: err instanceof Error ? err.message : "Error desconocido." });
    }
  }

  async function execute(dryRun: boolean) {
    if (!plan) return;
    const ids = roundItems.slice(0, count).map((i) => i.id);
    const controller = new AbortController();
    abortRef.current = controller;
    setCancelled(false);
    setLines([]);
    setProgress({ done: 0, total: 0 });
    setSummary(null);
    setError(null);
    setStage("running");

    const collected: ResultLine[] = [];
    let finished: ExecutionSummary | null = null;
    try {
      const res = await post(
        "/api/actions/execute",
        { kind, characterId, confirmedItemIds: ids, runId: plan.lastRunId, dryRun, simulate },
        controller.signal,
      );
      if (!res.body) throw new Error("Respuesta vacía del servidor.");
      if (!res.ok) return fail((await res.json()) as ActionsError);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const parts = buffer.split("\n");
        buffer = parts.pop() ?? "";
        for (const part of parts.filter(Boolean)) {
          const event = JSON.parse(part) as ExecuteEvent;
          if (event.type === "start") setProgress({ done: 0, total: event.total });
          else if (event.type === "progress") {
            collected.push(event.line);
            setLines([...collected]);
            setProgress({ done: event.done, total: event.total });
          } else if (event.type === "done") finished = event.summary;
          else return fail(event);
        }
      }
    } catch (err) {
      if (!(err instanceof DOMException && err.name === "AbortError")) {
        return fail({ kind: "other", message: err instanceof Error ? err.message : "Error desconocido." });
      }
      setCancelled(true);
    }

    // Tras cancelar no llega el resumen del servidor: se arma con lo recibido hasta ese momento.
    setSummary(
      finished ?? {
        runId: "",
        dryRun,
        stopped: { reason: "cancelled" },
        results: collected,
        omitted: [],
        remainingRounds: 0,
      },
    );
    setStage("report");
    if (!dryRun) onRefresh();
  }

  function cancel() {
    abortRef.current?.abort();
  }

  async function simAction(action: "dismantle" | "reset") {
    await post("/api/actions/sim", { action, characterId });
    setStage("idle");
    setPlan(null);
    onRefresh();
  }

  const noCharacters = characters.length === 0;

  return (
    <section aria-label="Acciones sobre el inventario" className="mb-6 rounded border border-zinc-700 bg-zinc-900 p-4">
      <h2 className="mb-1 text-lg font-semibold">Acciones</h2>
      <p className="mb-3 text-xs text-zinc-400">
        Tú decides cada paso. La app no desmantela nada: mueve y bloquea, y el desmantelado lo haces en el juego.
      </p>

      {error && (
        <div className="mb-3 rounded border border-red-500 bg-red-950/40 p-3 text-sm">
          <p className="font-semibold text-red-300">{ERROR_TITLES[error.kind]}</p>
          <p className="mt-1 text-red-200">{error.message}</p>
          {error.kind === "expired" && (
            <a href="/api/auth/login" className="mt-2 inline-block rounded bg-blue-600 px-3 py-1 text-white hover:bg-blue-500">
              Iniciar sesión de nuevo
            </a>
          )}
        </div>
      )}

      {stage === "idle" && (
        <Idle
          characters={characters}
          characterId={characterId}
          onCharacter={setCharacterId}
          character={character}
          disabled={busy || noCharacters}
          vaultLock={data.vaultLock}
          canUndo={Boolean(data.lastRunId)}
          simulate={simulate}
          onPlan={startPlan}
          onSim={simAction}
        />
      )}

      {stage === "planning" && <p className="text-sm text-zinc-300">Preparando el plan con los datos actuales…</p>}

      {stage === "confirm" && plan && (
        <Confirm
          kind={kind}
          plan={plan}
          character={character}
          roundItems={roundItems}
          count={count}
          onCount={setCount}
          onBack={() => setStage("idle")}
          onSimulate={() => execute(true)}
          onExecute={() => execute(false)}
        />
      )}

      {stage === "running" && (
        <Running progress={progress} lines={lines} cancelled={cancelled} onCancel={() => { setCancelled(true); cancel(); }} />
      )}

      {stage === "report" && summary && (
        <Report
          kind={kind}
          summary={summary}
          cancelled={cancelled}
          character={character}
          simulate={simulate}
          canUndo={!summary.dryRun && summary.results.some((r) => r.ok && !r.skipped)}
          onDone={() => setStage("idle")}
          onNext={() => startPlan(kind)}
          onRealRun={() => setStage("confirm")}
          onUndo={() => startPlan("undo")}
          onDismantle={() => simAction("dismantle")}
        />
      )}
    </section>
  );
}

function Idle(props: {
  characters: CharacterInfo[];
  characterId: string;
  character?: CharacterInfo;
  disabled: boolean;
  vaultLock?: boolean;
  canUndo: boolean;
  simulate: boolean;
  onCharacter: (id: string) => void;
  onPlan: (kind: PlanKind) => void;
  onSim: (action: "dismantle" | "reset") => void;
}) {
  const freeTotal = Object.values(props.character?.free ?? {}).reduce((a, b) => a + (b ?? 0), 0);
  return (
    <div className="space-y-3">
      {props.vaultLock === undefined && (
        <p className="rounded border border-yellow-500 bg-yellow-950/40 p-2 text-xs text-yellow-200">
          Aún no se ha probado el candado en el alijo. Antes de bloquear en masa, pruébalo con un solo ítem en la
          pantalla Alijo (botón del candado).
        </p>
      )}
      <label className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-300">Personaje:</span>
        <select
          value={props.characterId}
          onChange={(e) => props.onCharacter(e.target.value)}
          className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1"
        >
          {props.characters.map((c) => (
            <option key={c.id} value={c.id}>
              {CLASS_LABELS[c.classType]} · poder {c.light}
            </option>
          ))}
        </select>
        {props.character && <span className="text-xs text-zinc-500">{freeTotal} huecos libres en armas y armaduras</span>}
      </label>

      <div className="flex flex-wrap gap-2">
        <button
          disabled={props.disabled}
          onClick={() => props.onPlan("lock-keepers")}
          className="rounded bg-blue-600 px-3 py-2 text-sm font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          Bloquear los que conservo
        </button>
        <button
          disabled={props.disabled}
          onClick={() => props.onPlan("move-junk")}
          className="rounded bg-red-700 px-3 py-2 text-sm font-medium text-white hover:bg-red-600 disabled:opacity-50"
        >
          Mover basura a {props.character ? CLASS_LABELS[props.character.classType] : "…"}
        </button>
        <button
          disabled={props.disabled || !props.canUndo}
          onClick={() => props.onPlan("undo")}
          title={props.canUndo ? "" : "Todavía no hay ninguna ejecución que deshacer"}
          className="rounded bg-zinc-700 px-3 py-2 text-sm hover:bg-zinc-600 disabled:opacity-40"
        >
          Deshacer última ejecución
        </button>
      </div>

      {props.simulate && (
        <div className="flex flex-wrap gap-2 border-t border-zinc-800 pt-3 text-xs">
          <span className="text-zinc-500">Solo simulación:</span>
          <button onClick={() => props.onSim("dismantle")} className="text-blue-400 hover:underline">
            Simular desmantelado en el juego
          </button>
          <button onClick={() => props.onSim("reset")} className="text-blue-400 hover:underline">
            Reiniciar el mundo de ejemplo
          </button>
        </div>
      )}
    </div>
  );
}

function Confirm(props: {
  kind: PlanKind;
  plan: PlanResponse;
  character?: CharacterInfo;
  roundItems: RoundItem[];
  count: number;
  onCount: (n: number) => void;
  onBack: () => void;
  onSimulate: () => void;
  onExecute: () => void;
}) {
  const { plan } = props.plan;
  const total = props.roundItems.length;
  const rounds = plan.rounds.length;
  const target = props.character ? `tu ${CLASS_LABELS[props.character.classType]}` : "el personaje";
  const n = Math.min(Math.max(props.count, 1), total);

  const title =
    props.kind === "lock-keepers"
      ? `Se bloquearán ${n} ítems`
      : props.kind === "move-junk"
        ? `Se moverán ${n} ítems a ${target}`
        : `Se deshará la última ejecución (${n} ítems)`;

  if (total === 0) {
    return (
      <div className="space-y-3 text-sm">
        <p className="text-zinc-200">{plan.warnings.join(" ") || "No hay nada que hacer."}</p>
        <SkippedList skipped={plan.skipped} />
        <button onClick={props.onBack} className="rounded bg-zinc-700 px-3 py-1.5 hover:bg-zinc-600">
          Volver
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="rounded border border-blue-500 bg-blue-950/30 p-3">
        <p className="text-base font-semibold text-blue-100">{title}</p>
        <p className="mt-1 text-xs text-blue-200">
          {plan.rounds[0].note}
          {rounds > 1 && ` En total ${rounds} rondas.`}
          {props.plan.simulated && " · Datos de simulación."}
        </p>
      </div>

      {plan.warnings.length > 0 && (
        <ul className="space-y-1 rounded border border-yellow-500 bg-yellow-950/40 p-2 text-xs text-yellow-200">
          {plan.warnings.map((w) => (
            <li key={w}>⚠ {w}</li>
          ))}
        </ul>
      )}

      {props.kind === "move-junk" && (
        <p className="text-xs text-zinc-400">
          Esto solo mueve los ítems. Después tendrás que desmantelarlos tú, dentro del juego, desde el inventario de {target}.
          {rounds > 1 && " Entre una ronda y la siguiente debes desmantelar lo movido para liberar espacio."}
        </p>
      )}
      {props.kind === "undo" && (
        <p className="text-xs text-zinc-400">Lo que ya desmantelaste en el juego no se puede recuperar: esas acciones fallarán.</p>
      )}

      {props.kind !== "undo" && (
        <label className="flex flex-wrap items-center gap-2">
          <span className="text-zinc-300">Ítems en esta ejecución:</span>
          <input
            type="number"
            min={1}
            max={total}
            value={n}
            onChange={(e) => props.onCount(Number(e.target.value))}
            className="w-20 rounded border border-zinc-600 bg-zinc-950 px-2 py-1"
          />
          <span className="text-xs text-zinc-500">de {total} · usa 1 o 2 para probar primero</span>
        </label>
      )}

      <details>
        <summary className="cursor-pointer text-zinc-300">Ver los {n} ítems</summary>
        <ul className="mt-2 max-h-56 space-y-0.5 overflow-y-auto text-xs text-zinc-300">
          {props.roundItems.slice(0, n).map((i) => (
            <li key={i.id}>
              {i.name} <span className="text-zinc-500">· {i.what}</span>
            </li>
          ))}
        </ul>
      </details>
      <SkippedList skipped={plan.skipped} />

      <div className="flex flex-wrap gap-2 pt-1">
        <button onClick={props.onSimulate} className="rounded bg-zinc-700 px-3 py-2 hover:bg-zinc-600">
          Simular (no cambia nada)
        </button>
        <button onClick={props.onExecute} className="rounded bg-green-700 px-3 py-2 font-medium text-white hover:bg-green-600">
          Ejecutar ahora
        </button>
        <button onClick={props.onBack} className="rounded px-3 py-2 text-zinc-400 hover:bg-zinc-800">
          Cancelar
        </button>
      </div>
    </div>
  );
}

function SkippedList({ skipped }: { skipped: { itemId: string; name: string; reason: string }[] }) {
  if (skipped.length === 0) return null;
  return (
    <details>
      <summary className="cursor-pointer text-zinc-400">{skipped.length} ítems omitidos (ver motivos)</summary>
      <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-zinc-400">
        {skipped.map((s) => (
          <li key={s.itemId}>
            {s.name} <span className="text-zinc-600">· {s.reason}</span>
          </li>
        ))}
      </ul>
    </details>
  );
}

function Running(props: {
  progress: { done: number; total: number };
  lines: ResultLine[];
  cancelled: boolean;
  onCancel: () => void;
}) {
  const { done, total } = props.progress;
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  return (
    <div className="space-y-3 text-sm" aria-live="polite">
      <div>
        <p className="mb-1 text-zinc-300">
          {props.cancelled ? "Cancelando… se detendrá tras la acción en curso." : `Ejecutando… ${done} de ${total}`}
        </p>
        <div className="h-2 overflow-hidden rounded bg-zinc-800" role="progressbar" aria-valuenow={percent} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full bg-green-500 transition-all" style={{ width: `${percent}%` }} />
        </div>
      </div>
      <ul className="max-h-56 space-y-0.5 overflow-y-auto text-xs">
        {props.lines.map((l) => (
          <li key={l.actionId} className={l.ok ? "text-green-300" : "text-red-300"}>
            {l.ok ? "✓" : "✗"} {l.name} <span className="text-zinc-500">· {l.what}</span>
            {l.error && <span> — {l.error.message}</span>}
          </li>
        ))}
      </ul>
      <button disabled={props.cancelled} onClick={props.onCancel} className="rounded bg-zinc-700 px-3 py-1.5 hover:bg-zinc-600 disabled:opacity-50">
        Cancelar
      </button>
    </div>
  );
}

function Report(props: {
  kind: PlanKind;
  summary: ExecutionSummary;
  cancelled: boolean;
  character?: CharacterInfo;
  simulate: boolean;
  canUndo: boolean;
  onDone: () => void;
  onNext: () => void;
  onRealRun: () => void;
  onUndo: () => void;
  onDismantle: () => void;
}) {
  const { summary } = props;
  const done = summary.results.filter((r) => r.ok && !r.skipped);
  const failed = summary.results.filter((r) => !r.ok && !r.skipped);
  const notRun = summary.results.filter((r) => !r.ok && r.skipped);
  const target = props.character ? CLASS_LABELS[props.character.classType] : "el personaje";
  const movedItems = props.kind === "move-junk" ? done.length : 0;
  const stoppedFatal = summary.stopped?.reason === "fatal" ? summary.stopped.error : null;

  return (
    <div className="space-y-3 text-sm">
      {summary.dryRun ? (
        <p className="rounded border border-zinc-500 bg-zinc-800 p-3 text-zinc-200">
          Esto fue una simulación: no se cambió nada. {summary.results.length} acciones se habrían ejecutado.
        </p>
      ) : (
        <p className={`rounded border p-3 ${failed.length === 0 && notRun.length === 0 ? "border-green-600 bg-green-950/30 text-green-200" : "border-yellow-500 bg-yellow-950/30 text-yellow-100"}`}>
          {done.length} correctas · {failed.length} con error · {notRun.length} sin ejecutar
          {summary.omitted.length > 0 && ` · ${summary.omitted.length} omitidas por cambios`}
        </p>
      )}

      {props.cancelled && (
        <p className="text-yellow-200">Cancelado: lo ya hecho se queda hecho. Puedes revertirlo con «Deshacer última ejecución».</p>
      )}
      {stoppedFatal && <p className="text-red-300">Se detuvo: {stoppedFatal.message}</p>}

      {movedItems > 0 && (
        <div className="rounded border border-blue-500 bg-blue-950/40 p-3 text-blue-100">
          <p className="font-semibold">Ahora ve al juego</p>
          <p className="mt-1">
            Abre el inventario de tu {target} y desmantela los {movedItems} ítems que se movieron.
            {summary.remainingRounds > 0 && ` Quedan ${summary.remainingRounds} rondas más: cuando termines, pulsa «Siguiente ronda».`}
          </p>
        </div>
      )}

      {failed.length > 0 && (
        <details open>
          <summary className="cursor-pointer text-red-300">{failed.length} con error</summary>
          <ul className="mt-2 max-h-48 space-y-0.5 overflow-y-auto text-xs text-red-200">
            {failed.map((l) => (
              <li key={l.actionId}>
                {l.name} <span className="text-zinc-500">· {l.what}</span> — {l.error?.message}
              </li>
            ))}
          </ul>
        </details>
      )}
      {summary.omitted.length > 0 && (
        <details>
          <summary className="cursor-pointer text-yellow-200">{summary.omitted.length} omitidas</summary>
          <ul className="mt-2 max-h-40 space-y-0.5 overflow-y-auto text-xs text-zinc-400">
            {summary.omitted.map((o) => (
              <li key={o.itemId}>
                {o.name} · {o.reason}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="flex flex-wrap gap-2 pt-1">
        {summary.dryRun && (
          <button onClick={props.onRealRun} className="rounded bg-green-700 px-3 py-2 font-medium text-white hover:bg-green-600">
            Ejecutar de verdad
          </button>
        )}
        {!summary.dryRun && props.kind === "move-junk" && summary.remainingRounds > 0 && (
          <button onClick={props.onNext} className="rounded bg-blue-600 px-3 py-2 font-medium text-white hover:bg-blue-500">
            Siguiente ronda
          </button>
        )}
        {!summary.dryRun && props.kind === "move-junk" && summary.remainingRounds === 0 && movedItems > 0 && (
          <button onClick={props.onNext} className="rounded bg-zinc-700 px-3 py-2 hover:bg-zinc-600">
            Comprobar si queda más basura
          </button>
        )}
        {props.canUndo && props.kind !== "undo" && (
          <button onClick={props.onUndo} className="rounded bg-zinc-700 px-3 py-2 hover:bg-zinc-600">
            Deshacer esta ejecución
          </button>
        )}
        {props.simulate && movedItems > 0 && (
          <button onClick={props.onDismantle} className="rounded bg-zinc-800 px-3 py-2 text-xs hover:bg-zinc-700">
            Simular desmantelado en el juego
          </button>
        )}
        <button onClick={props.onDone} className="rounded px-3 py-2 text-zinc-400 hover:bg-zinc-800">
          Cerrar
        </button>
      </div>
    </div>
  );
}
