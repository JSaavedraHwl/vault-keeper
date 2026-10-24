"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
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
import { AMMO_LABELS, AMMO_ORDER, type CharacterInfo, type NormalizedItem } from "@/lib/inventory/types";
import { ElementMark, ItemIcon } from "@/components/item-bits";
import { AMMO_COLORS, CHAMPION_COLORS } from "@/lib/ui/theme";

const CLASS_LABELS: Record<CharacterInfo["classType"], string> = { titan: "Titán", hunter: "Cazador", warlock: "Hechicero" };

const VIA_LABELS: Record<ChampionVia, string> = {
  item: "de serie",
  plug: "por su rasgo",
  instance: "según el juego",
  artifact: "por una ventaja de artefacto activa",
};

const SLOT_NUMERAL: Record<WeaponSlot, string> = { kinetic: "I", energy: "II", power: "III" };

type Equipping =
  | { state: "idle" }
  | { state: "running"; dryRun: boolean }
  | { state: "done"; outcome: EquipOutcome }
  | { state: "error"; error: ActionsError };

export function GearView({ data, initialSelectedId }: { data: GearData; initialSelectedId?: string }) {
  const router = useRouter();
  const [refreshing, startRefresh] = useTransition();
  const { items, characters, artifact } = data;

  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");
  const [filters, setFilters] = useState<GearFilters>(NO_FILTERS);
  // `initialSelectedId` deja la pantalla con un arma ya elegida (vista previa y pruebas).
  const [selectedId, setSelectedId] = useState<string | null>(initialSelectedId ?? null);
  const [equipping, setEquipping] = useState<Equipping>({ state: "idle" });
  const [simulateOnly, setSimulateOnly] = useState(false);

  // El juego sigue cambiando mientras tanto: se muestra la antigüedad de los datos y se releen solos
  // al volver a esta pestaña (p. ej. tras cambiar algo dentro del juego).
  const [now, setNow] = useState(() => Date.parse(data.generatedAt));
  const generatedAtRef = useRef(Date.parse(data.generatedAt));
  useEffect(() => {
    generatedAtRef.current = Date.parse(data.generatedAt);
  }, [data.generatedAt]);
  useEffect(() => {
    const tick = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(tick);
  }, []);
  const reload = useCallback(() => startRefresh(() => router.refresh()), [router]);
  useEffect(() => {
    const onBack = () => {
      if (document.visibilityState === "visible" && Date.now() - generatedAtRef.current > 15_000) reload();
    };
    window.addEventListener("focus", onBack);
    document.addEventListener("visibilitychange", onBack);
    return () => {
      window.removeEventListener("focus", onBack);
      document.removeEventListener("visibilitychange", onBack);
    };
  }, [reload]);
  const ageSeconds = Math.max(0, Math.round((now - Date.parse(data.generatedAt)) / 1000));
  const age = ageSeconds < 60 ? `${ageSeconds < 5 ? "ahora mismo" : `hace ${ageSeconds} s`}` : `hace ${Math.round(ageSeconds / 60)} min`;

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
  const filtering = filters.champions.length > 0 || filters.type || filters.element || filters.ammo || filters.query || filters.where !== "all";

  const toggleChampion = (c: Champion) =>
    setFilters((f) => ({ ...f, champions: f.champions.includes(c) ? f.champions.filter((x) => x !== c) : [...f.champions, c] }));

  async function equip(mode: "equip" | "send") {
    if (!selected || !character) return;
    const dryRun = simulateOnly;
    setEquipping({ state: "running", dryRun });
    try {
      const res = await fetch("/api/gear/equip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: selected.id, characterId: character.id, dryRun, mode }),
      });
      const body = await res.json();
      if (!res.ok) return setEquipping({ state: "error", error: body as ActionsError });
      setEquipping({ state: "done", outcome: body as EquipOutcome });
      // Se haya podido o no, lo que hay en la cuenta pudo cambiar: se relee.
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
    <main className="rise mx-auto w-full max-w-7xl p-4 pb-48">
      <header className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-2">
        <div className="mr-auto">
          <p className="eyebrow mb-1.5">Prepara tu equipo</p>
          <h1 className="page-title">Equipar</h1>
        </div>
        <span className="text-xs text-zinc-500" title="Los datos son una foto del momento en que se leyó tu cuenta">
          Datos de {age}
        </span>
        <button onClick={reload} disabled={refreshing} className="btn btn-sm">
          {refreshing ? "Actualizando…" : "Actualizar"}
        </button>
        <label className="flex items-center gap-2 text-sm">
          <span className="eyebrow">Personaje</span>
          <select
            value={characterId}
            onChange={(e) => { setCharacterId(e.target.value); setSelectedId(null); setEquipping({ state: "idle" }); }}
            className="field"
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
            <div
              key={slot}
              className={`panel p-3.5 transition-shadow ${target ? "!border-green-400/70 shadow-[0_0_34px_-6px_rgba(79,200,131,0.65)]" : ""}`}
            >
              <p className="eyebrow flex items-center gap-2">
                <span className="display text-base text-gold">{SLOT_NUMERAL[slot]}</span>
                {SLOT_LABELS[slot].number} · {SLOT_LABELS[slot].name}
              </p>
              {current ? <MiniWeapon item={current} rows={rows[slot]} /> : <p className="mt-2 text-sm text-zinc-500">Vacía</p>}
              {target && selected && (
                <p className="mt-2.5 border-t border-green-400/30 pt-2 text-xs text-green-300">↳ Aquí irá: <strong className="text-green-200">{selected.name}</strong></p>
              )}
            </div>
          );
        })}
      </section>

      {/* Artefacto */}
      <p className="panel-quiet mb-4 flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-xs text-zinc-400">
        <span className="eyebrow !text-gold">Artefacto{artifact.name ? ` «${artifact.name}»` : ""}</span>
        <span>ventajas de campeón activas en este personaje →</span>
        <span className="text-zinc-200">{activeChampionPerks.length > 0 ? activeChampionPerks.map((p) => p.name).join(" · ") : "ninguna"}</span>
        {artifact.unparsed.length > 0 && (
          <span className="text-yellow-300" title={artifact.unparsed.join(", ")}> · {artifact.unparsed.length} ventaja(s) que no pude interpretar</span>
        )}
      </p>

      {/* Filtros */}
      <section aria-label="Filtros" className="panel mb-6 space-y-3.5 p-4">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="eyebrow mr-1">Rompe</span>
          {CHAMPIONS.map((c) => (
            <button
              key={c}
              onClick={() => toggleChampion(c)}
              aria-pressed={filters.champions.includes(c)}
              className="chip"
              style={{ "--chip": CHAMPION_COLORS[c] } as CSSProperties}
            >
              {CHAMPION_LABELS[c]}
            </button>
          ))}
          <label className="ml-2 flex cursor-pointer items-center gap-2 text-xs text-zinc-300" title="Armas que lo harían si activaras la ventaja de artefacto que ahora no tienes activa">
            <input type="checkbox" checked={filters.includePotential} onChange={(e) => setFilters((f) => ({ ...f, includePotential: e.target.checked }))} />
            incluir las que lo harían activando una ventaja
          </label>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          <select value={filters.type} onChange={(e) => setFilters((f) => ({ ...f, type: e.target.value }))} className="field" aria-label="Tipo de arma">
            <option value="">Todos los tipos</option>
            {types.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={filters.element} onChange={(e) => setFilters((f) => ({ ...f, element: e.target.value }))} className="field" aria-label="Elemento">
            <option value="">Todos los elementos</option>
            {elements.map((t) => <option key={t}>{t}</option>)}
          </select>
          <select value={filters.ammo} onChange={(e) => setFilters((f) => ({ ...f, ammo: e.target.value as GearFilters["ammo"] }))} className="field" aria-label="Munición">
            <option value="">Toda la munición</option>
            {AMMO_ORDER.map((a) => <option key={a} value={a}>Munición {AMMO_LABELS[a].toLowerCase()}</option>)}
          </select>
          <select value={filters.where} onChange={(e) => setFilters((f) => ({ ...f, where: e.target.value as GearFilters["where"] }))} className="field" aria-label="Ubicación">
            <option value="all">Todas las ubicaciones</option>
            <option value="vault">Solo alijo</option>
            <option value="selected">Solo en {label(characterId)}</option>
            <option value="others">En otros personajes</option>
          </select>
          <input type="search" value={filters.query} onChange={(e) => setFilters((f) => ({ ...f, query: e.target.value }))} placeholder="Buscar por nombre…" className="field w-52" />
          {filtering && (
            <button onClick={() => setFilters({ ...NO_FILTERS, includePotential: filters.includePotential })} className="link text-xs">Limpiar filtros</button>
          )}
          <span className="display ml-auto text-sm text-zinc-400"><span className="text-lg text-white">{total}</span> armas{refreshing ? " · actualizando…" : ""}</span>
        </div>
      </section>

      {/* Las tres ranuras, separadas */}
      <div className="grid gap-6 lg:grid-cols-3">
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
        <aside aria-label="Selección" className="fixed inset-x-0 bottom-0 z-20 border-t border-gold/30 bg-zinc-950/92 p-4 backdrop-blur-md shadow-[0_-20px_50px_-20px_rgba(0,0,0,0.9)]">
          <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-gold to-transparent opacity-70" />
          <div className="mx-auto flex max-w-7xl flex-wrap items-start gap-5">
            <div className="min-w-[16rem] flex-1 text-sm">
              <p className="display text-lg leading-tight text-white">{selected.name} <span className="text-sm font-medium normal-case tracking-normal text-zinc-400">· {selected.type}{selected.element ? ` · ${selected.element}` : ""}</span></p>
              <p className="mt-1 text-zinc-300">
                Irá a la <strong className="text-gold-bright">{SLOT_LABELS[equipPlan.slot].number.toLowerCase()} ({SLOT_LABELS[equipPlan.slot].name.toLowerCase()})</strong> de tu {CLASS_LABELS[character.classType]}
                {equipPlan.replaces ? <> y reemplazará a <strong className="text-white">{equipPlan.replaces.name}</strong>.</> : equipPlan.alreadyEquipped ? " (ya la lleva equipada)." : ", que ahora no lleva nada ahí."}
              </p>
              {/* Lo que impide equiparla (rojo) y la información que no impide nada (gris), por separado */}
              {equipPlan.blockers.map((p) => (
                <p key={p} className="mt-1 text-xs text-red-300">⛔ {p}</p>
              ))}
              {equipPlan.notes.map((p) => (
                <p key={p} className="mt-1 text-xs text-zinc-400">ℹ {p}</p>
              ))}
              {equipPlan.exoticConflict && (
                <p className="mt-1 text-xs text-zinc-400">
                  ¿Ya no la llevas equipada? Estos datos son de {age}.{" "}
                  <button onClick={reload} disabled={refreshing} className="link disabled:opacity-50">
                    Actualizar y volver a comprobar
                  </button>
                </p>
              )}
              <p className="mt-1.5 text-xs text-zinc-500">Equipar solo funciona en una zona social, en órbita o sin conexión, no en medio de una actividad.</p>
            </div>

            <div className="flex flex-col items-end gap-2.5">
              <div className="flex flex-wrap items-center justify-end gap-2.5">
                <button
                  disabled={!equipPlan.canEquip || equipping.state === "running"}
                  onClick={() => equip("equip")}
                  title={equipPlan.canEquip ? "" : equipPlan.blockers[0] ?? "Ya está equipada"}
                  className="btn btn-go"
                >
                  {equipping.state === "running" ? "Trabajando…" : `Equipar en ${CLASS_LABELS[character.classType]}`}
                </button>
                <button
                  disabled={!equipPlan.canSend || equipping.state === "running"}
                  onClick={() => equip("send")}
                  title={equipPlan.alreadyThere ? "Ya está en el personaje" : equipPlan.sendBlockers[0] ?? "La deja en el inventario del personaje, sin equiparla"}
                  className="btn btn-info"
                >
                  Mandar al inventario
                </button>
                <button onClick={() => { setSelectedId(null); setEquipping({ state: "idle" }); }} className="btn btn-quiet">Cerrar</button>
              </div>
              <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
                <input type="checkbox" checked={simulateOnly} onChange={(e) => setSimulateOnly(e.target.checked)} />
                Solo simular (no cambia nada)
              </label>
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
        <button onClick={onUndo} className="btn btn-sm mt-2.5">Deshacer</button>
      )}
    </div>
  );
}

function WeaponIcon({ item, size }: { item: NormalizedItem; size: number }) {
  return <ItemIcon icon={item.icon} size={size} />;
}

function MiniWeapon({ item, rows }: { item: NormalizedItem; rows: GearRow[] }) {
  const row = rows.find((r) => r.item.id === item.id);
  return (
    <div className="item-card mt-2.5 flex items-center gap-3 p-2.5" data-tier={item.tier}>
      <WeaponIcon item={item} size={52} />
      <div className="min-w-0">
        <p className="item-name display truncate text-base leading-tight text-white">{item.name}</p>
        <p className="flex items-center gap-1.5 text-xs text-zinc-400"><ElementMark element={item.element} />{item.type}{item.element ? ` · ${item.element}` : ""}</p>
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
      <h2 className="relative mb-3 flex items-end justify-between border-b border-white/10 pb-2">
        <span className="flex items-center gap-2.5">
          <span className="display grid h-8 w-8 place-items-center border border-gold/60 text-lg text-gold shadow-[0_0_14px_-2px_rgba(230,195,106,0.45)]" style={{ transform: "rotate(0deg)" }}>
            {SLOT_NUMERAL[props.slot]}
          </span>
          <span className="display text-xl leading-none text-white">{s.number} <span className="text-zinc-400">· {s.name}</span></span>
        </span>
        <span className="display text-sm text-zinc-500">{props.rows.length}</span>
        <span className="absolute -bottom-px left-0 h-px w-16 bg-gold" />
      </h2>
      {props.rows.length === 0 ? (
        <p className="panel-quiet p-4 text-sm text-zinc-500">Ninguna arma coincide.</p>
      ) : (
        <ul className="space-y-2.5">
          {props.rows.map((row) => {
            const { item } = row;
            const here = item.location === "character" && item.characterId === props.characterId;
            const selected = item.id === props.selectedId;
            return (
              <li key={item.id}>
                <button
                  onClick={() => props.onSelect(item.id)}
                  aria-pressed={selected}
                  data-tier={item.tier}
                  data-selected={selected}
                  className="item-card flex w-full cursor-pointer items-start gap-3 p-2.5 pl-3.5 text-left"
                >
                  <WeaponIcon item={item} size={56} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <span className="item-name display truncate text-[1.05rem] leading-tight text-white">{item.name}</span>
                      {item.power !== null && (
                        <span className="display flex items-center gap-1 text-lg leading-none text-gold-bright">
                          <span className="text-[0.55rem] text-gold">◆</span>{item.power}
                        </span>
                      )}
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-400">
                      <span className="flex items-center gap-1.5"><ElementMark element={item.element} />{item.type}{item.element ? ` · ${item.element}` : ""}</span>
                      {item.ammo && (
                        <span
                          title={`Munición ${AMMO_LABELS[item.ammo].toLowerCase()}`}
                          className="display border px-1.5 text-[0.7rem] leading-4"
                          style={{ borderColor: AMMO_COLORS[item.ammo], color: AMMO_COLORS[item.ammo] }}
                        >
                          {AMMO_LABELS[item.ammo]}
                        </span>
                      )}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-500">
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
    <p className="mt-1.5 flex flex-wrap gap-1.5">
      {now.map((c) => (
        <span
          key={c.type}
          title={`${CHAMPION_LABELS[c.type]}: ${c.via.map((v) => VIA_LABELS[v]).join(", ")}`}
          className="display border px-1.5 text-xs leading-5"
          style={{ borderColor: CHAMPION_COLORS[c.type], color: "#fff", background: `color-mix(in srgb, ${CHAMPION_COLORS[c.type]} 30%, #0a0f1d)`, boxShadow: `0 0 10px -3px ${CHAMPION_COLORS[c.type]}` }}
        >
          {CHAMPION_LABELS[c.type]}
        </span>
      ))}
      {potential.map((p) => (
        <span
          key={p.type}
          title={`Lo haría activando la ventaja de artefacto «${p.perk}»`}
          className="display border border-dashed px-1.5 text-xs leading-5"
          style={{ borderColor: `color-mix(in srgb, ${CHAMPION_COLORS[p.type]} 65%, transparent)`, color: CHAMPION_COLORS[p.type] }}
        >
          {CHAMPION_LABELS[p.type]}?
        </span>
      ))}
    </p>
  );
}
