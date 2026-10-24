"use client";

import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import type { EquipOutcome } from "@/lib/actions/equip-service";
import type { ActionsError } from "@/lib/actions/events";
import {
  CHAMPION_LABELS,
  CHAMPIONS,
  type Champion,
  type ChampionVia,
} from "@/lib/inventory/champions";
import type { GearData } from "@/lib/inventory/gear";
import {
  equippedBySlot,
  filterGear,
  NO_FILTERS,
  planEquip,
  SLOT_LABELS,
  WEAPON_SLOT_ORDER,
  type GearFilters,
  type GearRow,
  type WeaponSlot,
} from "@/lib/inventory/gear-filter";
import type { CharacterInfo, ItemTier, NormalizedItem } from "@/lib/inventory/types";

const CLASS_LABELS: Record<CharacterInfo["classType"], string> = { titan: "Titán", hunter: "Cazador", warlock: "Hechicero" };

const CHAMPION_STYLES: Record<Champion, { solid: string; dashed: string }> = {
  barrier: { solid: "border-orange-500 bg-orange-950 text-orange-200", dashed: "border-dashed border-orange-700 text-orange-400" },
  unstoppable: { solid: "border-red-500 bg-red-950 text-red-200", dashed: "border-dashed border-red-800 text-red-400" },
  overload: { solid: "border-sky-500 bg-sky-950 text-sky-200", dashed: "border-dashed border-sky-800 text-sky-400" },
};

const VIA_LABELS: Record<ChampionVia, string> = {
  item: "de serie",
  plug: "por su rasgo",
  instance: "según el juego",
  artifact: "por una ventaja de artefacto activa",
};

const TIER_BORDER: Record<ItemTier, string> = {
  common: "border-zinc-500",
  uncommon: "border-green-600",
  rare: "border-blue-500",
  legendary: "border-purple-500",
  exotic: "border-yellow-400",
};

type Equipping =
  | { state: "idle" }
  | { state: "running"; dryRun: boolean }
  | { state: "done"; outcome: EquipOutcome }
  | { state: "error"; error: ActionsError };

export function GearView({ data }: { data: GearData }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const { items, characters, artifact } = data;

  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");
  const [filters, setFilters] = useState<GearFilters>(NO_FILTERS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [equipping, setEquipping] = useState<Equipping>({ state: "idle" });

  const character = characters.find((c) => c.id === characterId);
  const activePerks = useMemo(() => new Set(character?.activeArtifactPerks ?? []), [character]);
  const ctx = useMemo(() => ({ characterId, perks: artifact.perks, activePerks }), [characterId, artifact.perks, activePerks]);

  const rows = useMemo(() => filterGear(items, ctx, filters), [items, ctx, filters]);
  const equipped = useMemo(() => equippedBySlot(items, characterId), [items, characterId]);
  const selected = items.find((i) => i.id === selectedId) ?? null;
  const equipPlan = useMemo(() => (selected && character ? planEquip(selected, character, items) : null), [selected, character, items]);

  const types = useMemo(() => [...new Set(items.map((i) => i.type))].sort((a, b) => a.localeCompare(b, "es")), [items]);
  const elements = useMemo(() => [...new Set(items.map((i) => i.element).filter((e): e is string => Boolean(e)))].sort((a, b) => a.localeCompare(b, "es")), [items]);

  const activeChampionPerks = artifact.perks.filter((p) => activePerks.has(p.hash));
  const label = (id?: string) => CLASS_LABELS[characters.find((c) => c.id === id)?.classType ?? "titan"];
  const total = WEAPON_SLOT_ORDER.reduce((n, s) => n + rows[s].length, 0);
  const filtering = filters.champions.length > 0 || filters.type || filters.element || filters.query || filters.where !== "all";

  const toggleChampion = (c: Champion) =>
    setFilters((f) => ({ ...f, champions: f.champions.includes(c) ? f.champions.filter((x) => x !== c) : [...f.champions, c] }));

  async function equip(dryRun: boolean) {
    if (!selected || !character) return;
    setEquipping({ state: "running", dryRun });
    try {
      const res = await fetch("/api/gear/equip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: selected.id, characterId: character.id, dryRun }),
      });
      const body = await res.json();
      if (!res.ok) return setEquipping({ state: "error", error: body as ActionsError });
      setEquipping({ state: "done", outcome: body as EquipOutcome });
      if (!dryRun && (body as EquipOutcome).ok) startRefresh(() => router.refresh());
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
      const lines = (await res.text()).split("\n").filter(Boolean).map((l) => JSON.parse(l));
      const failure = lines.find((l) => l.type === "error");
      if (failure) return setEquipping({ state: "error", error: failure as ActionsError });
      setEquipping({ state: "idle" });
      startRefresh(() => router.refresh());
    } catch (err) {
      setEquipping({ state: "error", error: { kind: "other", message: err instanceof Error ? err.message : "Error desconocido." } });
    }
  }

  if (characters.length === 0) {
    return <main className="p-6 text-zinc-300">No se encontraron personajes en tu cuenta.</main>;
  }

  return (
    <main className="mx-auto max-w-7xl p-4 pb-40">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold">Equipar</h1>
        <label className="flex items-center gap-2 text-sm">
          <span className="text-zinc-400">Personaje:</span>
          <select
            value={characterId}
            onChange={(e) => { setCharacterId(e.target.value); setSelectedId(null); setEquipping({ state: "idle" }); }}
            className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5"
          >
            {characters.map((c) => (
              <option key={c.id} value={c.id}>{CLASS_LABELS[c.classType]} · poder {c.light}</option>
            ))}
          </select>
        </label>
      </header>

      {/* Lo que lleva equipado ahora, por ranura */}
      <section aria-label="Equipado ahora" className="mb-4 grid gap-3 md:grid-cols-3">
        {WEAPON_SLOT_ORDER.map((slot) => {
          const current = equipped[slot];
          const target = equipPlan?.slot === slot && !equipPlan.alreadyEquipped;
          return (
            <div key={slot} className={`rounded border p-3 ${target ? "border-green-500 bg-green-950/30 ring-1 ring-green-500" : "border-zinc-700 bg-zinc-900"}`}>
              <p className="text-xs uppercase tracking-wide text-zinc-400">{SLOT_LABELS[slot].number} · {SLOT_LABELS[slot].name}</p>
              {current ? <MiniWeapon item={current} rows={rows[slot]} /> : <p className="mt-1 text-sm text-zinc-500">Vacía</p>}
              {target && selected && (
                <p className="mt-2 text-xs text-green-300">↳ Aquí irá: <strong>{selected.name}</strong></p>
              )}
            </div>
          );
        })}
      </section>

      {/* Artefacto */}
      <p className="mb-3 text-xs text-zinc-400">
        Artefacto{artifact.name ? ` «${artifact.name}»` : ""}: ventajas de campeón activas en este personaje →{" "}
        {activeChampionPerks.length > 0 ? activeChampionPerks.map((p) => p.name).join(" · ") : "ninguna"}
        {artifact.unparsed.length > 0 && (
          <span className="text-yellow-300" title={artifact.unparsed.join(", ")}> · {artifact.unparsed.length} ventaja(s) que no pude interpretar</span>
        )}
      </p>

      {/* Filtros */}
      <section aria-label="Filtros" className="mb-4 space-y-3 rounded border border-zinc-700 bg-zinc-900 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm text-zinc-300">Rompe:</span>
          {CHAMPIONS.map((c) => {
            const on = filters.champions.includes(c);
            return (
              <button
                key={c}
                onClick={() => toggleChampion(c)}
                aria-pressed={on}
                className={`rounded border px-3 py-1 text-sm ${on ? CHAMPION_STYLES[c].solid : "border-zinc-600 text-zinc-300 hover:bg-zinc-800"}`}
              >
                {CHAMPION_LABELS[c]}
              </button>
            );
          })}
          <label className="ml-2 flex items-center gap-1 text-xs text-zinc-300" title="Armas que lo harían si activaras la ventaja de artefacto que ahora no tienes activa">
            <input type="checkbox" checked={filters.includePotential} onChange={(e) => setFilters((f) => ({ ...f, includePotential: e.target.checked }))} />
            incluir las que lo harían activando una ventaja
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))} className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1" aria-label="Tipo de arma">
            <option value="">Todos los tipos</option>
            {types.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={filters.element} onChange={(e) => setFilters((f) => ({ ...f, element: e.target.value }))} className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1" aria-label="Elemento">
            <option value="">Todos los elementos</option>
            {elements.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={filters.where} onChange={(e) => setFilters((f) => ({ ...f, where: e.target.value as GearFilters["where"] }))} className="rounded border border-zinc-600 bg-zinc-950 px-2 py-1" aria-label="Ubicación">
            <option value="all">Todas las ubicaciones</option>
            <option value="vault">Solo alijo</option>
            <option value="selected">Solo en {label(characterId)}</option>
            <option value="others">En otros personajes</option>
          </select>
          <input type="search" value={filters.query} onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))} placeholder="Buscar por nombre…" className="w-48 rounded border border-zinc-600 bg-zinc-950 px-2 py-1" />
          {filtering && (
            <button onClick={() => setFilters({ ...NO_FILTERS, includePotential: filters.includePotential })} className="text-xs text-blue-400 hover:underline">Limpiar filtros</button>
          )}
          <span className="ml-auto text-xs text-zinc-500">{total} armas{refreshing ? " · actualizando…" : ""}</span>
        </div>
      </section>

      {/* Las tres ranuras, separadas */}
      <div className="grid gap-4 lg:grid-cols-3">
        {WEAPON_SLOT_ORDER.map((slot) => (
          <SlotColumn
            key={slot}
            slot={slot}
            rows={rows[slot]}
            selectedId={selectedId}
            characterId={characterId}
            label={label}
            onSelect={(id) => { setSelectedId(id === selectedId ? null : id); setEquipping({ state: "idle" }); }}
          />
        ))}
      </div>

      {/* Selección */}
      {selected && equipPlan && character && (
        <aside aria-label="Selección" className="fixed inset-x-0 bottom-0 z-20 border-t border-zinc-700 bg-zinc-950/95 p-3 backdrop-blur">
          <div className="mx-auto flex max-w-7xl flex-wrap items-start gap-4">
            <div className="min-w-[14rem] flex-1 text-sm">
              <p className="font-semibold">{selected.name} <span className="font-normal text-zinc-400">· {selected.type}{selected.element ? ` · ${selected.element}` : ""}</span></p>
              <p className="text-zinc-300">
                Irá a la <strong>{SLOT_LABELS[equipPlan.slot].number.toLowerCase()} ({SLOT_LABELS[equipPlan.slot].name.toLowerCase()})</strong> de tu {CLASS_LABELS[character.classType]}
                {equipPlan.replaces ? <> y reemplazará a <strong>{equipPlan.replaces.name}</strong>.</> : equipPlan.alreadyEquipped ? " (ya la lleva equipada)." : ", que ahora no lleva nada ahí."}
              </p>
              {equipPlan.problems.map((p) => (
                <p key={p} className={`text-xs ${equipPlan.canEquip ? "text-zinc-400" : "text-red-300"}`}>{equipPlan.canEquip ? "ℹ" : "⛔"} {p}</p>
              ))}
              <p className="mt-1 text-xs text-zinc-500">Equipar solo funciona en una zona social, en órbita o sin conexión, no en medio de una actividad.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button disabled={equipping.state === "running"} onClick={() => equip(true)} className="rounded bg-zinc-700 px-3 py-2 text-sm hover:bg-zinc-600 disabled:opacity-50">Simular</button>
              <button
                disabled={!equipPlan.canEquip || equipping.state === "running"}
                onClick={() => equip(false)}
                className="rounded bg-green-700 px-4 py-2 text-sm font-medium text-white hover:bg-green-600 disabled:opacity-40"
              >
                {equipping.state === "running" && !equipping.dryRun ? "Equipando…" : `Equipar en ${CLASS_LABELS[character.classType]}`}
              </button>
              <button onClick={() => { setSelectedId(null); setEquipping({ state: "idle" }); }} className="rounded px-3 py-2 text-sm text-zinc-400 hover:bg-zinc-800">Cerrar</button>
            </div>
          </div>

          <Result equipping={equipping} onUndo={undo} />
        </aside>
      )}
    </main>
  );
}

function Result({ equipping, onUndo }: { equipping: Equipping; onUndo: () => void }) {
  if (equipping.state === "error") {
    return (
      <div className="mx-auto mt-2 max-w-7xl rounded border border-red-500 bg-red-950/40 p-2 text-sm text-red-200" role="alert">
        {equipping.error.message}
        {equipping.error.kind === "expired" && <a href="/api/auth/login" className="ml-2 text-blue-300 underline">Iniciar sesión</a>}
      </div>
    );
  }
  if (equipping.state !== "done") return null;
  const { outcome } = equipping;
  if (outcome.blocked) {
    return <div className="mx-auto mt-2 max-w-7xl rounded border border-yellow-500 bg-yellow-950/40 p-2 text-sm text-yellow-100">{outcome.blocked.join(" ")}</div>;
  }
  return (
    <div className={`mx-auto mt-2 max-w-7xl rounded border p-2 text-sm ${outcome.ok ? "border-green-600 bg-green-950/30 text-green-100" : "border-red-500 bg-red-950/40 text-red-100"}`} role="status">
      <p className="font-medium">
        {outcome.dryRun ? "Simulación: no se cambió nada." : outcome.ok ? "Listo: arma equipada." : "No se pudo completar."}
      </p>
      <ul className="mt-1 space-y-0.5 text-xs">
        {outcome.steps.map((s, i) => (
          <li key={i}>
            {s.ok ? "✓" : "✗"} {s.name} <span className="text-zinc-400">· {s.what}</span>
            {s.error && <span> — {s.error.message}</span>}
          </li>
        ))}
      </ul>
      {!outcome.dryRun && outcome.steps.some((s) => s.ok && !s.skipped) && (
        <button onClick={onUndo} className="mt-2 rounded bg-zinc-700 px-2 py-1 text-xs hover:bg-zinc-600">Deshacer</button>
      )}
    </div>
  );
}

function MiniWeapon({ item, rows }: { item: NormalizedItem; rows: GearRow[] }) {
  const row = rows.find((r) => r.item.id === item.id);
  return (
    <div className="mt-1 flex items-center gap-2">
      {item.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.icon} alt="" width={36} height={36} className={`h-9 w-9 rounded border-b-2 ${TIER_BORDER[item.tier]}`} />
      ) : <div className="h-9 w-9 rounded bg-zinc-800" />}
      <div className="min-w-0">
        <p className="truncate text-sm font-medium">{item.name}</p>
        <p className="text-xs text-zinc-400">{item.type}{item.element ? ` · ${item.element}` : ""}</p>
        {row && <Badges row={row} />}
      </div>
    </div>
  );
}

function SlotColumn(props: {
  slot: WeaponSlot;
  rows: GearRow[];
  selectedId: string | null;
  characterId: string;
  label: (id?: string) => string;
  onSelect: (id: string) => void;
}) {
  const s = SLOT_LABELS[props.slot];
  return (
    <section aria-label={`${s.number} · ${s.name}`}>
      <h2 className="mb-2 flex items-baseline justify-between border-b border-zinc-700 pb-1">
        <span className="font-semibold">{s.number} <span className="font-normal text-zinc-400">· {s.name}</span></span>
        <span className="text-xs text-zinc-500">{props.rows.length}</span>
      </h2>
      {props.rows.length === 0 ? (
        <p className="text-sm text-zinc-500">Ninguna arma coincide.</p>
      ) : (
        <ul className="space-y-2">
          {props.rows.map((row) => {
            const { item } = row;
            const here = item.location === "character" && item.characterId === props.characterId;
            const selected = item.id === props.selectedId;
            return (
              <li key={item.id}>
                <button
                  onClick={() => props.onSelect(item.id)}
                  aria-pressed={selected}
                  className={`flex w-full items-start gap-2 rounded border-l-4 bg-zinc-900 p-2 text-left hover:bg-zinc-800 ${TIER_BORDER[item.tier]} ${selected ? "ring-2 ring-green-500" : ""}`}
                >
                  {item.icon ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.icon} alt="" width={44} height={44} loading="lazy" className="h-11 w-11 shrink-0 rounded" />
                  ) : <div className="h-11 w-11 shrink-0 rounded bg-zinc-800" />}
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-semibold">{item.name}</span>
                      {item.power !== null && <span className="font-mono text-xs text-yellow-300">{item.power}</span>}
                    </div>
                    <p className="text-xs text-zinc-400">
                      {item.type}{item.element ? ` · ${item.element}` : ""}
                    </p>
                    <p className="text-xs text-zinc-500">
                      {item.location === "vault" ? "En el alijo" : `${props.label(item.characterId)}${item.equipped ? " · equipada" : ""}`}
                      {here && item.equipped ? " ✓" : ""}
                    </p>
                    <Badges row={row} />
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function Badges({ row }: { row: GearRow }) {
  const { now, potential } = row.status;
  if (now.length === 0 && potential.length === 0) return null;
  return (
    <p className="mt-1 flex flex-wrap gap-1">
      {now.map((c) => (
        <span key={c.type} title={`${CHAMPION_LABELS[c.type]}: ${c.via.map((v) => VIA_LABELS[v]).join(", ")}`} className={`rounded border px-1.5 text-[11px] ${CHAMPION_STYLES[c.type].solid}`}>
          {CHAMPION_LABELS[c.type]}
        </span>
      ))}
      {potential.map((p) => (
        <span key={p.type} title={`Lo haría activando la ventaja de artefacto «${p.perk}»`} className={`rounded border px-1.5 text-[11px] ${CHAMPION_STYLES[p.type].dashed}`}>
          {CHAMPION_LABELS[p.type]}?
        </span>
      ))}
    </p>
  );
}
