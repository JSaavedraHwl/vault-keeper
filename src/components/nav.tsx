"use client";

import { Suspense } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const LINKS = [
  { href: "/vault", label: "Alijo", match: (p: string) => p === "/vault" },
  { href: "/gear", label: "Equipar", match: (p: string) => p === "/gear" },
  { href: "/cleanup", label: "Limpieza", match: (p: string) => p === "/cleanup" },
  { href: "/cleanup/profile", label: "Perfil de uso", match: (p: string) => p === "/cleanup/profile" },
] as const;

function NavBar() {
  const pathname = usePathname();
  const sim = useSearchParams().get("sim") === "1";

  // La portada (login) no lleva navegación.
  if (pathname === "/") return null;

  return (
    <nav aria-label="Principal" className="border-b border-zinc-800 bg-zinc-950">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-1 gap-y-2 px-4 py-2">
        <a href="/vault" className="mr-4 font-semibold text-zinc-100">
          Vault Keeper
        </a>

        {LINKS.map((link) => {
          const active = link.match(pathname);
          return (
            <a
              key={link.href}
              // En simulación se conserva el modo al moverse entre pantallas.
              href={sim && link.href === "/cleanup" ? `${link.href}?sim=1` : link.href}
              aria-current={active ? "page" : undefined}
              className={`rounded px-3 py-1.5 text-sm ${
                active ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              }`}
            >
              {link.label}
            </a>
          );
        })}

        <span className="ml-auto flex items-center gap-3">
          {sim && (
            <span className="rounded border border-yellow-500 px-2 py-0.5 text-xs text-yellow-300">Simulación</span>
          )}
          <form action="/api/auth/logout" method="post">
            <button className="rounded px-3 py-1.5 text-sm text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100">
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
