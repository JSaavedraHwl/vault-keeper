"use client";

import { useMemo, useState } from "react";
import type { AnalyzeEvent } from "@/app/api/classify/analyze/route";
import type { AnalysisData, AnalysisStage } from "@/lib/classify/analyze-vault";
import { applyManualVerdicts, EMPTY_OVERRIDES, type ManualVerdict, type Overrides } from "@/lib/classify/overrides-pure";
import { summarize } from "@/lib/classify/run";
import type { ClassificationResult, RuleId, Verdict } from "@/lib/classify/types";
import type { ItemTier, NormalizedItem } from "@/lib/inventory/types";
import { ActionsPanel } from "./actions-panel";
import { setAlwaysKeepAction, setVerdictAction } from "./actions";

const STAGES: Record<AnalysisStage, { label: string; percent: number }> = {
  vault: { label: "Leyendo el alijo…", percent: 15 },
  profile: { label: "Cargando perfil y correcciones…", percent: 55 },
  rules: { label: "Aplicando reglas…", percent: 85 },
};

const VERDICT_LABELS: Record<Verdict, string> = {
  junk: "Basura",
  archive: "Archivar",
  keep: "Guardar",
  needs_review: "Revisar",
};
const GROUP_ORDER: Verdict[] = ["junk", "needs_review", "archive", "keep"];
const GROUP_STYLES: Record<Verdict, string> = {
  junk: "border-red-500 text-red-300",
  needs_review: "border-yellow-500 text-yellow-300",
  archive: "border-blue-500 text-blue-300",
  keep: "border-green-600 text-green-300",
};

const RULE_LABELS: Record<RuleId, string> = {
  protected: "Protegido",
  exceptions: "Excepción",
  obsolete: "Obsoleto",
  lowRarity: "Rareza baja",
  armor: "Armadura",
  duplicateSurplus: "Duplicado",
  weaponPreference: "Tipo de arma",
  bestCopy: "Mejor copia",
  otherItems: "Otros ítems",
};

const TIER_BORDER: Record<ItemTier, string> = {
  common: "border-zinc-500",
  uncommon: "border-green-600",
  rare: "border-blue-500",
  legendary: "border-purple-500",
  exotic: "border-yellow-400",
};

type ViewError = { kind: AnalyzeErrorKind; message: string };
type AnalyzeErrorKind = Extract<AnalyzeEvent, { type: "error" }>["kind"];

export function CleanupView({ simulate }: { simulate: boolean }) {
  const [data, setData] = useState<AnalysisData | null>(null);
  const [overrides, setOverrides] = useState<Overrides>(EMPTY_OVERRIDES);
  const [stage, setStage] = useState<AnalysisStage | null>(null);
  const [error, setError] = useState<ViewError | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const running = stage !== null;

  async function runAnalysis() {
    setStage("vault");
    setError(null);
    setActionError(null);
    try {
      const res = await fetch("/api/classify/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ simulate }),
      });
      if (!res.body) throw new Error("Respuesta vacía del servidor.");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines.filter(Boolean)) {
          const event = JSON.parse(line) as AnalyzeEvent;
          if (event.type === "stage") setStage(event.stage);
          else if (event.type === "done") {
            setData(event.data);
            setOverrides(event.data.overrides);
          } else if (event.kind === "refresh") {
            // Navegación completa a propósito: es una ruta de API que escribe cookies y redirige.
            // eslint-disable-next-line @next/next/no-location-assign-relative-destination
            window.location.href = "/api/auth/refresh?next=/cleanup";
            return;
          } else setError({ kind: event.kind, message: event.message });
        }
      }
    } catch (err) {
      setError({ kind: "other", message: err instanceof Error ? err.message : "Error desconocido." });
    } finally {
      setStage(null);
    }
  }

  async function change(action: () => ReturnType<typeof setVerdictAction>) {
    setActionError(null);
    const result = await action();
    if (result.ok) setOverrides(result.overrides);
    else setActionError(result.error);
  }

  // Las correcciones se aplican en el navegador: el cambio es instantáneo, sin volver a llamar a Bungie.
  const results = useMemo(
    () => (data ? applyManualVerdicts(data.ruleResults, data.items, overrides) : []),
    [data, overrides],
  );
  const summary = useMemo(() => summarize(results), [results]);
  const itemsById = useMemo(() => new Map((data?.items ?? []).map((i) => [i.id, i])), [data]);
  const groups = useMemo(() => {
    const out: Record<Verdict, ClassificationResult[]> = { junk: [], needs_review: [], archive: [], keep: [] };
    for (const r of results) out[r.verdict].push(r);
    for (const list of Object.values(out)) {
      list.sort((a, b) => (itemsById.get(a.itemId)?.name ?? "").localeCompare(itemsById.get(b.itemId)?.name ?? "", "es"));
    }
    return out;
  }, [results, itemsById]);

  return (
    <main className="mx-auto max-w-6xl p-4">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold">Limpieza del alijo</h1>
      </header>

      {simulate && (
        <p className="mb-4 rounded border border-yellow-500 bg-yellow-950/40 p-3 text-sm text-yellow-200">
          Modo simulación: se usan datos de ejemplo y no se llama a Bungie. Las correcciones se guardan aparte.
        </p>
      )}

      <p className="mb-4 text-sm text-zinc-400">
        Esta pantalla solo sugiere. La app nunca borra ni desmantela nada: eso lo haces tú dentro del juego.
      </p>

      <div className="mb-4 flex items-center gap-4">
        <button
          onClick={runAnalysis}
          disabled={running}
          className="rounded bg-blue-600 px-4 py-2 font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {running ? "Analizando…" : data ? "Analizar de nuevo" : "Analizar alijo"}
        </button>
        {running && (
          <div className="flex-1" role="progressbar" aria-valuenow={STAGES[stage].percent} aria-valuemin={0} aria-valuemax={100}>
            <p className="mb-1 text-xs text-zinc-400">{STAGES[stage].label}</p>
            <div className="h-2 overflow-hidden rounded bg-zinc-800">
              <div className="h-full bg-blue-500 transition-all duration-500" style={{ width: `${STAGES[stage].percent}%` }} />
            </div>
          </div>
        )}
      </div>

      {error && <ErrorBox error={error} />}
      {actionError && (
        <p className="mb-4 rounded border border-red-500 bg-red-950/40 p-3 text-sm text-red-300">{actionError}</p>
      )}

      {data && (
        <>
          <section className="mb-6">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {GROUP_ORDER.map((v) => (
                <div key={v} className={`rounded border-l-4 bg-zinc-900 p-3 ${GROUP_STYLES[v]}`}>
                  <p className="text-2xl font-bold">{summary.counts[v]}</p>
                  <p className="text-xs">{VERDICT_LABELS[v]}</p>
                </div>
              ))}
              <div className="rounded border-l-4 border-zinc-500 bg-zinc-900 p-3 text-zinc-200">
                <p className="text-2xl font-bold">{summary.slotsFreed}</p>
                <p className="text-xs">ranuras que liberarías</p>
              </div>
            </div>
            <p className="mt-2 text-xs text-zinc-500">
              {summary.total} ítems · {summary.bySource.manual} con corrección manual · analizado con el perfil v
              {data.profileVersion} a las {new Date(data.generatedAt).toLocaleTimeString("es")}
            </p>
          </section>

          <ActionsPanel data={data} simulate={simulate} onRefresh={runAnalysis} />

          <div className="space-y-4">
            {GROUP_ORDER.map((verdict) => (
              <Group
                key={verdict}
                verdict={verdict}
                results={groups[verdict]}
                itemsById={itemsById}
                overrides={overrides}
                defaultOpen={verdict !== "keep"}
                onVerdict={(id, v) => change(() => setVerdictAction(id, v, simulate))}
                onAlwaysKeep={(id, on) => change(() => setAlwaysKeepAction(id, on, simulate))}
              />
            ))}
          </div>
        </>
      )}
    </main>
  );
}

function ErrorBox({ error }: { error: ViewError }) {
  const titles: Record<AnalyzeErrorKind, string> = {
    expired: "Sesión expirada",
    refresh: "Renovando sesión",
    maintenance: "Bungie en mantenimiento",
    bungie: "Error de la API de Bungie",
    other: "No se pudo analizar el alijo",
  };
  return (
    <div className="mb-4 rounded border border-red-500 bg-red-950/40 p-4">
      <p className="font-semibold text-red-300">{titles[error.kind]}</p>
      <p className="mt-1 text-sm text-red-200">{error.message}</p>
      {error.kind === "expired" && (
        <a href="/api/auth/login" className="mt-3 inline-block rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500">
          Iniciar sesión de nuevo
        </a>
      )}
    </div>
  );
}

interface GroupProps {
  verdict: Verdict;
  results: ClassificationResult[];
  itemsById: Map<string, NormalizedItem>;
  overrides: Overrides;
  defaultOpen: boolean;
  onVerdict: (id: string, verdict: ManualVerdict | null) => void;
  onAlwaysKeep: (id: string, on: boolean) => void;
}

function Group({ verdict, results, itemsById, overrides, defaultOpen, onVerdict, onAlwaysKeep }: GroupProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className={`rounded border-l-4 bg-zinc-900 ${GROUP_STYLES[verdict]}`}>
      <button onClick={() => setOpen(!open)} className="flex w-full items-center justify-between p-3 text-left">
        <span className="font-semibold">
          {VERDICT_LABELS[verdict]} <span className="text-zinc-400">({results.length})</span>
        </span>
        <span className="text-xs text-zinc-400">{open ? "Ocultar" : "Mostrar"}</span>
      </button>
      {open && (
        <ul className="divide-y divide-zinc-800 border-t border-zinc-800 text-zinc-200">
          {results.length === 0 && <li className="p-3 text-sm text-zinc-500">Ningún ítem.</li>}
          {results.map((r) => {
            const item = itemsById.get(r.itemId);
            return item ? (
              <Row
                key={r.itemId}
                item={item}
                result={r}
                manual={overrides.verdicts[r.itemId]?.verdict}
                alwaysKeep={overrides.alwaysKeep.includes(r.itemId)}
                onVerdict={onVerdict}
                onAlwaysKeep={onAlwaysKeep}
              />
            ) : null;
          })}
        </ul>
      )}
    </section>
  );
}

interface RowProps {
  item: NormalizedItem;
  result: ClassificationResult;
  manual: ManualVerdict | undefined;
  alwaysKeep: boolean;
  onVerdict: GroupProps["onVerdict"];
  onAlwaysKeep: GroupProps["onAlwaysKeep"];
}

function Row({ item, result, manual, alwaysKeep, onVerdict, onAlwaysKeep }: RowProps) {
  const protectedItem = item.locked || item.equipped;
  const origin =
    result.source === "manual"
      ? "Manual"
      : result.ruleId
        ? `Regla: ${RULE_LABELS[result.ruleId]}`
        : "Sin regla";
  const alsoMatched = result.alsoMatched?.map((id) => RULE_LABELS[id]).join(", ");

  return (
    <li className="flex flex-wrap items-center gap-3 p-3 text-sm">
      {item.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.icon} alt="" width={40} height={40} loading="lazy" className={`h-10 w-10 shrink-0 rounded border-b-2 ${TIER_BORDER[item.tier]}`} />
      ) : (
        <div className={`h-10 w-10 shrink-0 rounded border-b-2 bg-zinc-800 ${TIER_BORDER[item.tier]}`} />
      )}

      <div className="min-w-[10rem] flex-1">
        <p className="font-medium">
          {item.name}
          {item.power !== null && <span className="ml-2 font-mono text-yellow-300">{item.power}</span>}
          {item.locked && <span title="Con candado"> 🔒</span>}
          {item.equipped && <span className="ml-1 text-xs text-zinc-400">(equipado)</span>}
        </p>
        <p className="text-xs text-zinc-400">
          {item.type}
          {item.gearTier !== undefined && item.gearTier > 0 && ` · nivel ${item.gearTier}`}
          {item.armorTotal !== undefined && ` · total ${item.armorTotal}`}
        </p>
      </div>

      <div className="min-w-[14rem] flex-[2]">
        <p>{result.reason}</p>
        <p className="text-xs text-zinc-400" title={alsoMatched ? `También coincidía: ${alsoMatched}` : undefined}>
          {origin} · confianza {Math.round(result.confidence * 100)}%
        </p>
      </div>

      <div className="flex items-center gap-2">
        <select
          value={result.verdict === "needs_review" ? "" : result.verdict}
          disabled={alwaysKeep}
          onChange={(e) => onVerdict(item.id, (e.target.value as ManualVerdict) || null)}
          aria-label={`Veredicto de ${item.name}`}
          className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1 disabled:opacity-50"
        >
          {result.verdict === "needs_review" && <option value="">Revisar…</option>}
          <option value="keep">Guardar</option>
          <option value="archive">Archivar</option>
          <option value="junk" disabled={protectedItem}>
            Basura
          </option>
        </select>
        {manual && !alwaysKeep && (
          <button onClick={() => onVerdict(item.id, null)} className="text-xs text-blue-400 hover:underline">
            Quitar corrección
          </button>
        )}
        <label className="flex items-center gap-1 text-xs text-zinc-300" title="Nunca se sugerirá como basura">
          <input type="checkbox" checked={alwaysKeep} onChange={(e) => onAlwaysKeep(item.id, e.target.checked)} />
          Siempre conservar
        </label>
      </div>
    </li>
  );
}
