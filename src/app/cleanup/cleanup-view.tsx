"use client";

import { useMemo, useState } from "react";
import type { AnalyzeEvent } from "@/app/api/classify/analyze/route";
import type { AnalysisData, AnalysisStage } from "@/lib/classify/analyze-vault";
import { applyManualVerdicts, EMPTY_OVERRIDES, type ManualVerdict, type Overrides } from "@/lib/classify/overrides-pure";
import { summarize } from "@/lib/classify/run";
import type { ClassificationResult, RuleId, Verdict } from "@/lib/classify/types";
import { ItemIcon, Power } from "@/components/item-bits";
import type { NormalizedItem } from "@/lib/inventory/types";
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
// Un color por veredicto, usado en el resumen, las cabeceras de grupo y las filas.
const VERDICT_COLORS: Record<Verdict, string> = {
  junk: "#ef5b5b",
  needs_review: "#e8b04a",
  archive: "#5aa0f0",
  keep: "#4fc283",
};
const VERDICT_HINTS: Record<Verdict, string> = {
  junk: "Candidatos a desmantelar",
  needs_review: "Decide tú",
  archive: "Por ahora no, pero podrían servir",
  keep: "Se quedan",
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

type ViewError = { kind: AnalyzeErrorKind; message: string };
type AnalyzeErrorKind = Extract<AnalyzeEvent, { type: "error" }>["kind"];

export function CleanupView({ simulate, initialData }: { simulate: boolean; initialData?: AnalysisData }) {
  // `initialData` permite mostrar la pantalla ya con resultados (vista previa y pruebas).
  const [data, setData] = useState<AnalysisData | null>(initialData ?? null);
  const [overrides, setOverrides] = useState<Overrides>(initialData?.overrides ?? EMPTY_OVERRIDES);
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
    <main className="rise mx-auto w-full max-w-6xl p-4 pb-16">
      <header className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="mr-auto">
          <p className="eyebrow mb-1.5">Decide qué conservas</p>
          <h1 className="page-title">Limpieza del alijo</h1>
        </div>
        <button onClick={runAnalysis} disabled={running} className="btn btn-gold">
          {running ? "Analizando…" : data ? "Analizar de nuevo" : "Analizar alijo"}
        </button>
      </header>

      {simulate && (
        <p className="mb-4 border border-yellow-500/50 bg-yellow-500/10 px-4 py-2.5 text-sm text-yellow-200">
          Modo simulación: se usan datos de ejemplo y no se llama a Bungie. Las correcciones se guardan aparte.
        </p>
      )}

      <p className="mb-5 text-sm text-zinc-400">
        Esta pantalla solo sugiere. La app nunca borra ni desmantela nada: eso lo haces tú dentro del juego.
      </p>

      {running && (
        <div className="panel-quiet mb-5 p-4" role="progressbar" aria-valuenow={STAGES[stage].percent} aria-valuemin={0} aria-valuemax={100}>
          <p className="eyebrow mb-2 !text-gold">{STAGES[stage].label}</p>
          <div className="meter meter-info">
            <span style={{ width: `${STAGES[stage].percent}%` }} />
          </div>
        </div>
      )}

      {error && <ErrorBox error={error} />}
      {actionError && (
        <p className="mb-4 border border-red-500/60 bg-red-950/40 p-3 text-sm text-red-300">{actionError}</p>
      )}

      {data && (
        <>
          <section className="mb-7">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
              {GROUP_ORDER.map((v) => (
                <div
                  key={v}
                  className="panel relative overflow-hidden p-4"
                  style={{ ["--c" as string]: VERDICT_COLORS[v] }}
                >
                  <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: VERDICT_COLORS[v], boxShadow: `0 0 14px ${VERDICT_COLORS[v]}` }} />
                  <p className="display text-4xl font-bold leading-none" style={{ color: VERDICT_COLORS[v] }}>{summary.counts[v]}</p>
                  <p className="display mt-1.5 text-sm text-zinc-200">{VERDICT_LABELS[v]}</p>
                  <p className="mt-0.5 text-[0.7rem] text-zinc-500">{VERDICT_HINTS[v]}</p>
                </div>
              ))}
              <div className="panel relative overflow-hidden p-4">
                <span className="absolute inset-y-0 left-0 w-[3px] bg-zinc-400" />
                <p className="display text-4xl font-bold leading-none text-white">{summary.slotsFreed}</p>
                <p className="display mt-1.5 text-sm text-zinc-200">Ranuras</p>
                <p className="mt-0.5 text-[0.7rem] text-zinc-500">que liberarías</p>
              </div>
            </div>
            <p className="mt-3 text-xs text-zinc-500">
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
    <div className="mb-5 border border-red-500/60 bg-red-950/40 p-4">
      <p className="display text-lg text-red-300">{titles[error.kind]}</p>
      <p className="mt-1 text-sm text-red-200">{error.message}</p>
      {error.kind === "expired" && (
        <a href="/api/auth/login" className="btn btn-gold btn-sm mt-3">
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
    <section className="panel-quiet relative overflow-hidden">
      <span className="absolute inset-y-0 left-0 w-[3px]" style={{ background: VERDICT_COLORS[verdict], boxShadow: `0 0 14px ${VERDICT_COLORS[verdict]}` }} />
      <button onClick={() => setOpen(!open)} className="flex w-full cursor-pointer items-center justify-between px-5 py-3.5 text-left hover:bg-white/[0.03]">
        <span className="display text-xl" style={{ color: VERDICT_COLORS[verdict] }}>
          {VERDICT_LABELS[verdict]} <span className="text-base text-zinc-400">({results.length})</span>
        </span>
        <span className="eyebrow">{open ? "Ocultar" : "Mostrar"}</span>
      </button>
      {open && (
        <ul className="divide-y divide-white/5 border-t border-white/8 text-zinc-200">
          {results.length === 0 && <li className="p-4 text-sm text-zinc-500">Ningún ítem.</li>}
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
    <li className="item-card flat flex flex-wrap items-center gap-3.5 !border-x-0 !border-y-0 !bg-transparent px-5 py-3 text-sm" data-tier={item.tier}>
      <ItemIcon icon={item.icon} size={46} />

      <div className="min-w-[10rem] flex-1">
        <p className="flex items-center gap-2.5">
          <span className="item-name display text-base text-white">{item.name}</span>
          <Power value={item.power} className="text-base" />
          {item.locked && <span title="Con candado" className="text-xs text-gold">🔒</span>}
          {item.equipped && <span className="text-xs text-zinc-400">(equipado)</span>}
        </p>
        <p className="text-xs text-zinc-400">
          {item.type}
          {item.gearTier !== undefined && item.gearTier > 0 && ` · nivel ${item.gearTier}`}
          {item.armorTotal !== undefined && ` · total ${item.armorTotal}`}
        </p>
      </div>

      <div className="min-w-[14rem] flex-[2]">
        <p className="text-zinc-100">{result.reason}</p>
        <p className="text-xs text-zinc-500" title={alsoMatched ? `También coincidía: ${alsoMatched}` : undefined}>
          {origin} · confianza {Math.round(result.confidence * 100)}%
        </p>
      </div>

      <div className="flex items-center gap-2.5">
        <select
          value={result.verdict === "needs_review" ? "" : result.verdict}
          disabled={alwaysKeep}
          onChange={(e) => onVerdict(item.id, (e.target.value as ManualVerdict) || null)}
          aria-label={`Veredicto de ${item.name}`}
          className="field disabled:opacity-50"
        >
          {result.verdict === "needs_review" && <option value="">Revisar…</option>}
          <option value="keep">Guardar</option>
          <option value="archive">Archivar</option>
          <option value="junk" disabled={protectedItem}>
            Basura
          </option>
        </select>
        {manual && !alwaysKeep && (
          <button onClick={() => onVerdict(item.id, null)} className="link text-xs">
            Quitar corrección
          </button>
        )}
        <label className="flex cursor-pointer items-center gap-1.5 text-xs text-zinc-300" title="Nunca se sugerirá como basura">
          <input type="checkbox" checked={alwaysKeep} onChange={(e) => onAlwaysKeep(item.id, e.target.checked)} />
          Siempre conservar
        </label>
      </div>
    </li>
  );
}
