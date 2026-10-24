// Piezas visuales compartidas por las pantallas de inventario. Componentes de presentación (sin lógica).

import { elementColor } from "@/lib/ui/theme";

/** Rombo del color del elemento: la marca que usa el juego junto al daño del arma. */
export function ElementMark({ element }: { element?: string }) {
  if (!element) return null;
  const color = elementColor(element);
  return <span aria-hidden className="inline-block h-2 w-2 shrink-0 rotate-45" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />;
}

/** Ícono del ítem con el marco del color de su rareza (hereda `--rar` de `.item-card`). */
export function ItemIcon({ icon, size }: { icon: string | null; size: number }) {
  return (
    <span className="icon-frame relative block shrink-0" style={{ width: size, height: size }}>
      {icon ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={icon} alt="" width={size} height={size} loading="lazy" className="block h-full w-full" />
      ) : null}
    </span>
  );
}

/** Nivel de poder, como en el juego: rombo dorado y cifra grande. */
export function Power({ value, className = "text-lg" }: { value: number | null; className?: string }) {
  if (value === null) return null;
  return (
    <span className={`display flex items-center gap-1 leading-none text-gold-bright ${className}`}>
      <span className="text-[0.55em] text-gold">◆</span>
      {value}
    </span>
  );
}

export function LockIcon({ locked, className = "h-4 w-4" }: { locked: boolean; className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="5" y="11" width="14" height="10" rx="1.5" fill={locked ? "currentColor" : "none"} fillOpacity={locked ? 0.25 : 0} />
      <path d={locked ? "M8 11V8a4 4 0 0 1 8 0v3" : "M8 11V8a4 4 0 0 1 7.5-1.9"} />
    </svg>
  );
}

/** Barras de stats al estilo del juego: nombre, barra y valor. */
export function StatBars({ stats, max }: { stats: { name: string; value: number }[]; max: number }) {
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 sm:grid-cols-2">
      {stats.map((s) => (
        <div key={s.name} className="flex items-center gap-2 text-[0.7rem]">
          <dt className="w-[6.4rem] shrink-0 truncate text-zinc-400" title={s.name}>{s.name}</dt>
          <span className="meter !h-[5px] flex-1" aria-hidden="true">
            <span style={{ width: `${Math.min(100, Math.max(2, (s.value / max) * 100))}%`, background: "linear-gradient(90deg, #7e6a30, var(--gold))", boxShadow: "none" }} />
          </span>
          <dd className="w-6 shrink-0 text-right font-mono text-zinc-200">{s.value}</dd>
        </div>
      ))}
    </dl>
  );
}
