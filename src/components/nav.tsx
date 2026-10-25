"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Emblem } from "./emblem";

const LINKS = [
  { href: "/vault", label: "Alijo", match: (p: string) => p === "/vault" },
  { href: "/gear", label: "Equipar", match: (p: string) => p === "/gear" },
  { href: "/loadouts", label: "Loadouts", match: (p: string) => p === "/loadouts" },
  { href: "/cleanup", label: "Limpieza", match: (p: string) => p === "/cleanup" },
  { href: "/cleanup/profile", label: "Perfil de uso", match: (p: string) => p === "/cleanup/profile" },
] as const;

function NavBar() {
  const pathname = usePathname();
  const sim = useSearchParams().get("sim") === "1";

  // La portada (login) no lleva navegación.
  if (pathname === "/") return null;

  return (
    <nav aria-label="Principal" className="sticky top-0 z-30 border-b border-white/5 bg-zinc-950/70 backdrop-blur-md">
      {/* Filo dorado bajo la barra */}
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-px bg-gradient-to-r from-transparent via-gold/50 to-transparent" />
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-1 gap-y-1 px-4 py-2">
        <a href="/vault" className="mr-5 flex items-center gap-2.5 text-gold">
          <Emblem className="h-8 w-8 drop-shadow-[0_0_8px_rgba(230,195,106,0.55)]" />
          <span className="display text-xl font-bold leading-none tracking-[0.16em] text-white">
            Vault <span className="text-gold">Keeper</span>
          </span>
        </a>

        {LINKS.map((link) => {
          const active = link.match(pathname);
          return (
            <a
              key={link.href}
              // En simulación se conserva el modo al moverse entre pantallas.
              href={sim && link.href === "/cleanup" ? `${link.href}?sim=1` : link.href}
              aria-current={active ? "page" : undefined}
              className={`display relative px-3.5 py-2 text-[0.95rem] transition-colors ${
                active ? "text-gold-bright" : "text-zinc-400 hover:text-white"
              }`}
            >
              {link.label}
              <span
                className={`absolute inset-x-3 -bottom-px h-0.5 transition-opacity ${
                  active ? "bg-gold opacity-100 shadow-[0_0_10px_var(--gold)]" : "bg-white/40 opacity-0"
                }`}
              />
            </a>
          );
        })}

        <span className="ml-auto flex items-center gap-3">
          {sim && (
            <span className="display border border-yellow-500/60 bg-yellow-500/10 px-2 py-0.5 text-xs text-yellow-300">
              Simulación
            </span>
          )}
          <form action="/api/auth/logout" method="post">
            <button className="display px-3 py-2 text-sm text-zinc-400 transition-colors hover:text-white">
              Cerrar sesión
            </button>
          </form>
        </span>
      </div>
    </nav>
  );
}

export function Nav() {
  // useSearchParams exige un límite de Suspense.
  return (
    <Suspense fallback={null}>
      <NavBar />
    </Suspense>
  );
}
