"use client";

import { useMemo, useState, useTransition } from "react";
import { EquipResult, type Equipping } from "@/components/equip-result";
import { ItemIcon } from "@/components/item-bits";
import type { EquipOutcome } from "@/lib/actions/equip-service";
import type { ActionsError } from "@/lib/actions/events";
import type { GearData } from "@/lib/inventory/gear";
import { analyzeLoadout, type LoadoutAnalysis, type SlotStatus } from "@/lib/loadouts/analyze";
import { draftFromEquipped } from "@/lib/loadouts/draft";
import { ARMOR_EQUIP_SLOTS, EQUIP_SLOT_LABELS, WEAPON_EQUIP_SLOTS, type EquipSlot, type Loadout } from "@/lib/loadouts/types";
import { useFreshness } from "@/lib/ui/use-freshness";
import { deleteLoadoutAction } from "./actions";
import { CLASS_LABELS, LoadoutEditor, type EditorInit } from "./loadout-editor";

const STATUS_TEXT: Record<SlotStatus, string> = {
  empty: "—",
  equipped: "Ya puesta",
  "in-inventory": "En el inventario",
  "from-vault": "Del alijo",
  "from-other": "De otro personaje",
  missing: "Ya no existe",
  "wrong-class": "Otra clase",
};

const STATUS_COLOR: Record<SlotStatus, string> = {
  empty: "text-zinc-600",
  equipped: "text-green-300",
  "in-inventory": "text-sky-300",
  "from-vault": "text-sky-300",
  "from-other": "text-sky-300",
  missing: "text-red-300",
  "wrong-class": "text-yellow-300",
};

export function LoadoutsView({
  data,
  loadouts: initialLoadouts,
  initialEditing,
  initialEquipId,
}: {
  data: GearData;
  loadouts: Loadout[];
  /** Abre el editor ya con este borrador (vista previa y pruebas). */
  initialEditing?: EditorInit;
  /** Abre la barra de equipar con este loadout (vista previa y pruebas). */
  initialEquipId?: string;
}) {
  const { items, characters } = data;
  const { age, reload, refreshing } = useFreshness(data.generatedAt);

  const [loadouts, setLoadouts] = useState(initialLoadouts);
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");
  const [editing, setEditing] = useState<EditorInit | null>(initialEditing ?? null);
  const [equipId, setEquipId] = useState<string | null>(initialEquipId ?? null);
  const [equipping, setEquipping] = useState<Equipping>({ state: "idle" });
  const [simulateOnly, setSimulateOnly] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [, startDelete] = useTransition();

  const character = characters.find((c) => c.id === characterId);
  const equipLoadout = loadouts.find((l) => l.id === equipId) ?? null;
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const analyses = useMemo(
    () => new Map(loadouts.map((l) => [l.id, character ? analyzeLoadout(l, character, items) : null])),
    [loadouts, character, items],
  );
  const analysis = equipLoadout ? analyses.get(equipLoadout.id) ?? null : null;

  function startNew() {
    setEditing({ name: "", classType: character?.classType ?? "titan", notes: "", items: {} });
  }
  function startFromEquipped() {
    if (!character) return;
    setEditing({ name: `Mi equipo de ${CLASS_LABELS[character.classType]}`, classType: character.classType, notes: "", items: draftFromEquipped(items, character.id) });
  }
  function startEdit(l: Loadout) {
    setEditing({ id: l.id, name: l.name, classType: l.classType, notes: l.notes ?? "", items: l.items });
  }
  function onSaved(saved: Loadout) {
    setLoadouts((all) => (all.some((l) => l.id === saved.id) ? all.map((l) => (l.id === saved.id ? saved : l)) : [...all, saved]));
    setEditing(null);
  }
  function remove(id: string) {
    setDeleteError(null);
    startDelete(async () => {
      const result = await deleteLoadoutAction(id);
      if (result.ok) {
        setLoadouts((all) => all.filter((l) => l.id !== id));
        if (equipId === id) setEquipId(null);
      } else {
        setDeleteError(result.error ?? "No se pudo borrar.");
      }
      setConfirmDelete(null);
    });
  }

  async function equip() {
    if (!equipLoadout || !character) return;
    const dryRun = simulateOnly;
    setEquipping({ state: "running", dryRun });
    try {
      const res = await fetch("/api/loadouts/equip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ loadoutId: equipLoadout.id, characterId: character.id, dryRun }),
      });
      const body = await res.json();
      if (!res.ok) return setEquipping({ state: "error", error: body as ActionsError });
      setEquipping({ state: "done", outcome: body as EquipOutcome });
      if (!dryRun) reload();
    } catch (err) {
      setEquipping({ state: "error", error: { kind: "other", message: err instanceof Error ? err.message : "Error desconocido." } });
    }
  }

  async function undo() {
    setEquipping({ state: "running", dryRun: false });
    try {
      const post = (path: string, body: unknown) =>
        fetch(path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const planRes = await post("/api/actions/plan", { kind: "undo" });
      const planned = await planRes.json();
      if (!planRes.ok) return setEquipping({ state: "error", error: planned as ActionsError });
      const res = await post("/api/actions/execute", { kind: "undo", runId: planned.lastRunId, confirmedItemIds: [] });
      const failure = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l)).find((l) => l.type === "error");
      if (failure) return setEquipping({ state: "error", error: failure as ActionsError });
      setEquipping({ state: "idle" });
      reload();
    } catch (err) {
      setEquipping({ state: "error", error: { kind: "other", message: err instanceof Error ? err.message : "Error desconocido." } });
    }
  }

  if (characters.length === 0) {
    return <main className="p-6 text-zinc-300">No se encontraron personajes en tu cuenta.</main>;
  }

  return (
    <main className="rise mx-auto w-full max-w-7xl p-4 pb-56">
      <header className="mb-6 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="mr-auto">
          <p className="eyebrow mb-1.5">Tu equipo, listo para la actividad</p>
          <h1 className="page-title">Loadouts</h1>
        </div>
        <span className="text-xs text-zinc-500" title="Los datos son una foto del momento en que se leyó tu cuenta">Datos de {age}</span>
        <button onClick={reload} disabled={refreshing} className="btn btn-sm">{refreshing ? "Actualizando…" : "Actualizar"}</button>
        <label className="flex items-center gap-2 text-sm">
          <span className="eyebrow">Personaje</span>
          <select
            value={characterId}
            onChange={(e) => { setCharacterId(e.target.value); setEquipping({ state: "idle" }); }}
            className="field"
            aria-label="Personaje"
          >
            {characters.map((c) => (
              <option key={c.id} value={c.id}>{CLASS_LABELS[c.classType]} · poder {c.light}</option>
            ))}
          </select>
        </label>
      </header>

      {!editing && (
        <div className="mb-6 flex flex-wrap gap-3">
          <button onClick={startNew} className="btn btn-gold">Nuevo loadout</button>
          <button onClick={startFromEquipped} className="btn" title="Crea un loadout con lo que lleva puesto el personaje elegido">
            Guardar lo que llevo puesto
          </button>
        </div>
      )}

      {editing && (
        <LoadoutEditor
          key={editing.id ?? "nuevo"}
          items={items}
          character={character}
          characters={characters}
          init={editing}
          onSaved={onSaved}
          onCancel={() => setEditing(null)}
        />
      )}

      {deleteError && <p className="mb-4 border border-red-500/60 bg-red-950/40 p-3 text-sm text-red-200" role="alert">{deleteError}</p>}

      {loadouts.length === 0 ? (
        <p className="panel-quiet p-8 text-center text-zinc-400">
          Aún no tienes loadouts. Crea uno con <strong className="text-zinc-200">Nuevo loadout</strong>, o guarda lo que llevas puesto ahora mismo.
        </p>
      ) : (
        <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" aria-label="Loadouts guardados">
          {loadouts.map((l) => (
            <LoadoutCard
              key={l.id}
              loadout={l}
              analysis={analyses.get(l.id) ?? null}
              known={byId}
              selected={equipId === l.id}
              confirmingDelete={confirmDelete === l.id}
              onEquip={() => { setEquipId(l.id); setEquipping({ state: "idle" }); }}
              onEdit={() => startEdit(l)}
              onAskDelete={() => setConfirmDelete(l.id)}
              onCancelDelete={() => setConfirmDelete(null)}
              onDelete={() => remove(l.id)}
            />
          ))}
        </ul>
      )}

      {equipLoadout && analysis && character && (
        <aside aria-label="Equipar loadout" className="fixed inset-x-0 bottom-0 z-20 border-t border-gold/30 bg-zinc-950/92 p-4 backdrop-blur-md shadow-[0_-20px_50px_-20px_rgba(0,0,0,0.9)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent opacity-70" />
          <div className="mx-auto flex max-w-7xl flex-wrap items-start gap-5">
            <div className="min-w-[18rem] flex-1">
              <p className="display text-xl leading-tight text-white">
                {equipLoadout.name} <span className="text-sm text-zinc-400">· {CLASS_LABELS[equipLoadout.classType]}</span>
              </p>
              <ul className="mt-2 grid grid-cols-2 gap-x-5 gap-y-0.5 text-xs sm:grid-cols-4">
                {analysis.slots.map((s) => (
                  <li key={s.slot} className="flex items-baseline justify-between gap-2 border-b border-white/5 py-0.5">
                    <span className="text-zinc-400">{EQUIP_SLOT_LABELS[s.slot]}</span>
                    <span className={STATUS_COLOR[s.status]}>{STATUS_TEXT[s.status]}</span>
                  </li>
                ))}
              </ul>
              {analysis.blockers.map((b) => <p key={b} className="mt-1.5 text-xs text-red-300">⛔ {b}</p>)}
              {analysis.warnings.map((w) => <p key={w} className="mt-1 text-xs text-zinc-400">ℹ {w}</p>)}
              <p className="mt-1.5 text-xs text-zinc-500">Equipar solo funciona en una zona social, en órbita o sin conexión, no en medio de una actividad.</p>
            </div>

            <div className="flex flex-col items-end gap-2.5">
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <button
                  onClick={equip}
                  disabled={!analysis.canEquip || equipping.state === "running"}
                  title={analysis.canEquip ? "" : analysis.blockers[0] ?? "No hay nada que equipar"}
                  className="btn btn-go"
                >
                  {equipping.state === "running" ? "Trabajando…" : `Equipar en ${CLASS_LABELS[character.classType]}`}
                </button>
                <button onClick={() => { setEquipId(null); setEquipping({ state: "idle" }); }} className="btn btn-quiet">Cerrar</button>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
                <input type="checkbox" checked={simulateOnly} onChange={(e) => setSimulateOnly(e.target.checked)} />
                Solo simular (no cambia nada)
              </label>
            </div>
          </div>
          <EquipResult equipping={equipping} onUndo={undo} doneText="Listo: loadout equipado." />
        </aside>
      )}
    </main>
  );
}

function LoadoutCard(props: {
  loadout: Loadout;
  analysis: LoadoutAnalysis | null;
  known: Map<string, import("@/lib/inventory/types").NormalizedItem>;
  selected: boolean;
  confirmingDelete: boolean;
  onEquip: () => void;
  onEdit: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}) {
  const { loadout: l, analysis: a } = props;
  const wrongClass = a ? a.blockers.some((b) => b.startsWith("Este loadout es de")) : false;
  const status = !a
    ? null
    : wrongClass
      ? { text: "Otra clase", cls: "border-zinc-600 text-zinc-400" }
      : a.toDo === 0 && a.blockers.length === 0
        ? { text: "Ya lo llevas puesto", cls: "border-green-500/60 text-green-300" }
        : a.blockers.length > 0
          ? { text: "No se puede equipar ahora", cls: "border-red-500/60 text-red-300" }
          : { text: `${a.toDo} por equipar`, cls: "border-sky-400/60 text-sky-300" };

  const row = (slots: readonly EquipSlot[]) => (
    <div className="flex gap-1.5">
      {slots.map((slot) => {
        const ref = l.items[slot];
        const missing = ref && !props.known.has(ref.id);
        return (
          <span
            key={slot}
            title={ref ? `${EQUIP_SLOT_LABELS[slot]}: ${ref.name}${missing ? " (ya no existe)" : ""}` : `${EQUIP_SLOT_LABELS[slot]}: vacía`}
            className={`item-card flat relative grid h-[46px] w-[46px] place-items-center !p-0 ${ref ? "" : "!border-dashed !bg-transparent opacity-40"} ${missing ? "opacity-40 grayscale" : ""}`}
            data-tier={ref?.tier ?? "common"}
          >
            {ref ? <ItemIcon icon={ref.icon} size={44} /> : <span className="text-zinc-600">·</span>}
            {missing && <span className="absolute inset-0 grid place-items-center text-lg text-red-400">✕</span>}
          </span>
        );
      })}
    </div>
  );

  return (
    <li className={`panel flex flex-col gap-3.5 p-4 ${props.selected ? "!border-gold shadow-[0_0_34px_-8px_rgba(230,195,106,0.6)]" : ""}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h2 className="display truncate text-xl leading-tight text-white" title={l.name}>{l.name}</h2>
          <p className="eyebrow mt-0.5">{CLASS_LABELS[l.classType]}</p>
        </div>
        {status && <span className={`display shrink-0 border px-2 py-0.5 text-xs ${status.cls}`}>{status.text}</span>}
      </div>
      {l.notes && <p className="text-sm text-zinc-400">{l.notes}</p>}
      <div className="space-y-1.5">
        {row(WEAPON_EQUIP_SLOTS)}
        {row(ARMOR_EQUIP_SLOTS)}
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-2 pt-1">
        <button onClick={props.onEquip} className="btn btn-go btn-sm">Equipar</button>
        <button onClick={props.onEdit} className="btn btn-sm">Editar</button>
        {props.confirmingDelete ? (
          <>
            <button onClick={props.onDelete} className="btn btn-danger btn-sm">Sí, borrar</button>
            <button onClick={props.onCancelDelete} className="btn btn-quiet btn-sm">No</button>
          </>
        ) : (
          <button onClick={props.onAskDelete} className="btn btn-quiet btn-sm ml-auto">Borrar</button>
        )}
      </div>
    </li>
  );
}
