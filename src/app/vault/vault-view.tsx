"use client";

import { useMemo, useState, useTransition } from "react";
import { ElementMark, ItemIcon, LockIcon, Power, StatBars } from "@/components/item-bits";
import type { NormalizedItem } from "@/lib/inventory/types";
import { TIER_LABELS } from "@/lib/ui/theme";
import { setItemLockAction } from "./actions";

const KINDS = [
  { value: "all", label: "Todo" },
  { value: "weapon", label: "Armas" },
  { value: "armor", label: "Armaduras" },
  { value: "other", label: "Otros" },
] as const;

const CLASS_LABELS = { titan: "Titán", hunter: "Cazador", warlock: "Hechicero" } as const;

export function VaultView({ items }: { items: NormalizedItem[] }) {
  const [kind, setKind] = useState<(typeof KINDS)[number]["value"]>("all");
  const [type, setType] = useState("");
  const [query, setQuery] = useState("");

  const types = useMemo(
    () =>
      [...new Set(items.filter((i) => kind === "all" || i.kind === kind).map((i) => i.type))].sort(
        (a, b) => a.localeCompare(b, "es"),
      ),
    [items, kind],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLocaleLowerCase("es");
    return items
      .filter((i) => kind === "all" || i.kind === kind)
      .filter((i) => !type || i.type === type)
      .filter((i) => !q || i.name.toLocaleLowerCase("es").includes(q))
      .sort((a, b) => (b.power ?? -1) - (a.power ?? -1) || a.name.localeCompare(b.name, "es"));
  }, [items, kind, type, query]);

  return (
    <main className="rise mx-auto w-full max-w-7xl p-4 pb-16">
      <header className="mb-5 flex flex-wrap items-end gap-x-4 gap-y-3">
        <div className="mr-auto">
          <p className="eyebrow mb-1.5">Todo lo que guardas</p>
          <h1 className="page-title">
            Alijo
            <span className="display text-base font-medium text-zinc-400">
              {visible.length} de {items.length}
            </span>
          </h1>
        </div>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre…"
          className="field w-60"
        />
        <select value={type} onChange={(e) => setType(e.target.value)} className="field" aria-label="Tipo">
          <option value="">Todos los tipos</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </header>

      <div className="mb-6 flex flex-wrap gap-2">
        {KINDS.map((k) => (
          <button
            key={k.value}
            aria-pressed={kind === k.value}
            onClick={() => {
              setKind(k.value);
              setType("");
            }}
            className="chip"
          >
            {k.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="panel-quiet p-6 text-zinc-400">No hay ítems que coincidan.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {visible.map((item) => (
            <ItemCard key={item.id} item={item} />
          ))}
        </ul>
      )}
    </main>
  );
}

/** Candado de un solo ítem: sirve también para probar el bloqueo antes de usarlo en masa. */
function LockButton({ item }: { item: NormalizedItem }) {
  const [locked, setLocked] = useState(item.locked);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  function toggle() {
    const next = !locked;
    setMessage(null);
    startTransition(async () => {
      const result = await setItemLockAction({ id: item.id, hash: item.hash, name: item.name }, next);
      if (result.ok) {
        setLocked(result.locked);
        setMessage({
          ok: true,
          text: result.via === "detour" ? "Hecho (se movió al personaje y volvió)." : "Hecho.",
        });
      } else {
        setMessage({ ok: false, text: result.error.message });
      }
    });
  }

  return (
    <span className="relative">
      <button
        onClick={toggle}
        disabled={pending}
        title={locked ? "Quitar candado" : "Poner candado"}
        aria-label={`${locked ? "Quitar candado a" : "Poner candado a"} ${item.name}`}
        aria-pressed={locked}
        className={`grid h-7 w-7 place-items-center border transition-colors disabled:opacity-50 ${
          locked
            ? "border-gold/70 bg-gold/15 text-gold-bright shadow-[0_0_12px_-3px_var(--gold)]"
            : "border-white/15 text-zinc-500 hover:border-white/40 hover:text-zinc-200"
        }`}
      >
        {pending ? <span className="text-xs">…</span> : <LockIcon locked={locked} />}
      </button>
      {message && (
        <span
          role="status"
          className={`absolute right-0 top-full z-10 mt-1.5 w-60 border p-2 text-xs ${
            message.ok ? "border-green-500/60 bg-zinc-950 text-green-300" : "border-red-500/60 bg-zinc-950 text-red-300"
          }`}
        >
          {message.text}
        </span>
      )}
    </span>
  );
}

function ItemCard({ item }: { item: NormalizedItem }) {
  const armor = item.kind === "armor";
  return (
    <li className="item-card p-3.5 pl-4" data-tier={item.tier}>
      <div className="flex gap-3.5">
        <ItemIcon icon={item.icon} size={64} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="item-name display line-clamp-2 text-lg leading-tight text-white" title={item.name}>
              {item.name}
              {item.quantity > 1 && <span className="text-zinc-400"> ×{item.quantity}</span>}
            </h2>
            <span className="flex shrink-0 items-center gap-2.5">
              <Power value={item.power} />
              {item.id !== String(item.hash) && <LockButton item={item} />}
            </span>
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-zinc-400">
            <ElementMark element={item.element} />
            <span>{item.type}</span>
            <span className="text-zinc-600">·</span>
            <span>{TIER_LABELS[item.tier]}</span>
            {item.gearTier !== undefined && item.gearTier > 0 && <><span className="text-zinc-600">·</span><span>nivel {item.gearTier}</span></>}
            {item.classType && <><span className="text-zinc-600">·</span><span>{CLASS_LABELS[item.classType]}</span></>}
          </p>

          {item.perks.length > 0 && (
            <p className="mt-2 flex flex-wrap gap-1">
              {item.perks.map((p, i) => (
                <span key={`${p.name}-${i}`} className="border border-white/10 bg-white/5 px-1.5 py-0.5 text-[0.7rem] text-zinc-300">
                  {p.name}
                </span>
              ))}
            </p>
          )}
        </div>
      </div>

      {item.stats.length > 0 && (
        <div className="mt-3 border-t border-white/8 pt-2.5">
          <StatBars stats={item.stats} max={armor ? 40 : 100} />
          {item.armorTotal !== undefined && (
            <p className="display mt-2 flex items-center justify-between border-t border-white/8 pt-2 text-sm text-zinc-300">
              Total
              <span className="text-lg text-white">{item.armorTotal}</span>
            </p>
          )}
        </div>
      )}
    </li>
  );
}
