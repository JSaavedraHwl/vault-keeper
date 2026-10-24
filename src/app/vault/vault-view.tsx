"use client";

import { useMemo, useState } from "react";
import type { ItemTier, NormalizedItem } from "@/lib/inventory/types";

const TIER_STYLES: Record<ItemTier, string> = {
  common: "border-zinc-500",
  uncommon: "border-green-600",
  rare: "border-blue-500",
  legendary: "border-purple-500",
  exotic: "border-yellow-400",
};

const TIER_LABELS: Record<ItemTier, string> = {
  common: "Común",
  uncommon: "Poco común",
  rare: "Raro",
  legendary: "Legendario",
  exotic: "Exótico",
};

const KINDS = [
  { value: "all", label: "Todo" },
  { value: "weapon", label: "Armas" },
  { value: "armor", label: "Armaduras" },
  { value: "other", label: "Otros" },
] as const;

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
    <main className="mx-auto max-w-7xl p-4">
      <header className="mb-4 flex flex-wrap items-center gap-3">
        <h1 className="mr-auto text-2xl font-bold">
          Alijo <span className="text-sm font-normal text-zinc-400">({visible.length} de {items.length})</span>
        </h1>
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nombre…"
          className="w-56 rounded border border-zinc-600 bg-zinc-900 px-3 py-1.5 text-sm"
        />
        <select
          value={type}
          onChange={(e) => setType(e.target.value)}
          className="rounded border border-zinc-600 bg-zinc-900 px-2 py-1.5 text-sm"
        >
          <option value="">Todos los tipos</option>
          {types.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        <a href="/cleanup" className="rounded bg-blue-600 px-3 py-1.5 text-sm text-white hover:bg-blue-500">
          Limpieza
        </a>
        <form action="/api/auth/logout" method="post">
          <button className="rounded bg-zinc-700 px-3 py-1.5 text-sm hover:bg-zinc-600">Cerrar sesión</button>
        </form>
      </header>

      <div className="mb-4 flex gap-2">
        {KINDS.map((k) => (
          <button
            key={k.value}
            onClick={() => {
              setKind(k.value);
              setType("");
            }}
            className={`rounded px-3 py-1 text-sm ${
              kind === k.value ? "bg-blue-600 text-white" : "bg-zinc-800 hover:bg-zinc-700"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {visible.length === 0 ? (
        <p className="text-zinc-400">No hay ítems que coincidan.</p>
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

function ItemCard({ item }: { item: NormalizedItem }) {
  return (
    <li className={`flex gap-3 rounded border-l-4 bg-zinc-900 p-3 ${TIER_STYLES[item.tier]}`}>
      {item.icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.icon} alt="" width={56} height={56} loading="lazy" className="h-14 w-14 shrink-0 rounded" />
      ) : (
        <div className="h-14 w-14 shrink-0 rounded bg-zinc-800" />
      )}
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="truncate font-semibold">
            {item.name}
            {item.quantity > 1 && <span className="text-zinc-400"> ×{item.quantity}</span>}
          </h2>
          {item.power !== null && <span className="font-mono text-yellow-300">{item.power}</span>}
        </div>
        <p className="text-xs text-zinc-400">
          {item.type} · {TIER_LABELS[item.tier]}
          {item.classType && ` · ${item.classType}`}
        </p>

        {item.perks.length > 0 && (
          <p className="mt-1 text-xs text-zinc-300">{item.perks.map((p) => p.name).join(" · ")}</p>
        )}

        {item.stats.length > 0 && (
          <dl className="mt-2 grid grid-cols-2 gap-x-3 text-xs text-zinc-400">
            {item.stats.map((s) => (
              <div key={s.name} className="flex justify-between">
                <dt className="truncate">{s.name}</dt>
                <dd className="font-mono text-zinc-200">{s.value}</dd>
              </div>
            ))}
            {item.armorTotal !== undefined && (
              <div className="col-span-2 mt-1 flex justify-between border-t border-zinc-700 pt-1 font-semibold text-zinc-200">
                <dt>Total</dt>
                <dd className="font-mono">{item.armorTotal}</dd>
              </div>
            )}
          </dl>
        )}
      </div>
    </li>
  );
}
