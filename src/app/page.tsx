import { Emblem } from "@/components/emblem";

const ERRORS: Record<string, string> = {
  denied: "Cancelaste el inicio de sesión en Bungie.",
  state: "No se pudo validar la solicitud de login (state inválido). Inténtalo de nuevo.",
  token: "Bungie no entregó los tokens. Revisa BUNGIE_CLIENT_ID / BUNGIE_CLIENT_SECRET.",
  expired: "Tu sesión expiró. Inicia sesión de nuevo.",
};

const FEATURES = [
  { title: "Alijo", text: "Todo lo que guardas, con perks, stats y filtros." },
  { title: "Equipar", text: "Filtra por Barrera, Imparable o Sobrecarga y equipa en un clic." },
  { title: "Limpieza", text: "Reglas claras para decidir qué conservar y qué desmantelar." },
] as const;

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden px-6 py-16 text-center">
      {/* Emblema grande girando despacio detrás del título */}
      <Emblem
        spin
        className="pointer-events-none absolute left-1/2 top-1/2 h-[46rem] w-[46rem] -translate-x-1/2 -translate-y-[56%] text-gold opacity-[0.11]"
      />
      <div className="pointer-events-none absolute left-1/2 top-1/2 h-72 w-72 -translate-x-1/2 -translate-y-[60%] rounded-full bg-gold/10 blur-3xl" />

      <div className="rise relative z-10 flex max-w-3xl flex-col items-center">
        <Emblem className="mb-6 h-20 w-20 text-gold drop-shadow-[0_0_18px_rgba(230,195,106,0.7)]" />

        <p className="eyebrow mb-3 !text-gold">Destiny 2 · Gestor personal de inventario</p>
        <h1 className="display bg-gradient-to-b from-white via-zinc-100 to-gold bg-clip-text text-6xl font-bold leading-none tracking-[0.12em] text-transparent sm:text-8xl">
          Vault Keeper
        </h1>
        <div className="my-6 flex items-center gap-3">
          <span className="h-px w-16 bg-gradient-to-r from-transparent to-gold" />
          <span className="h-2 w-2 rotate-45 bg-gold shadow-[0_0_12px_var(--gold)]" />
          <span className="h-px w-16 bg-gradient-to-l from-transparent to-gold" />
        </div>
        <p className="max-w-xl text-lg text-zinc-300">
          Tu alijo, tus personajes y tus armas, bajo control. Prepárate para cualquier actividad sin perder tiempo
          rebuscando en el inventario.
        </p>

        {error && (
          <p className="mt-6 border border-red-500/60 bg-red-950/50 px-4 py-3 text-sm text-red-200" role="alert">
            {ERRORS[error] ?? "Ocurrió un error al iniciar sesión."}
          </p>
        )}

        {/* Enlace normal (no <Link>) para evitar prefetch de una ruta que redirige */}
        <a href="/api/auth/login" className="btn btn-gold mt-9 !px-8 !py-3.5 !text-lg">
          Iniciar sesión con Bungie
        </a>
        <p className="mt-4 max-w-md text-xs text-zinc-500">
          La app no desmantela nada: lee tu cuenta y, solo cuando tú lo pides, mueve, bloquea o equipa. Tus claves se
          quedan en el servidor.
        </p>

        <ul className="mt-14 grid w-full gap-4 text-left sm:grid-cols-3">
          {FEATURES.map((f) => (
            <li key={f.title} className="panel p-4">
              <p className="display text-lg text-white">{f.title}</p>
              <p className="mt-1 text-sm text-zinc-400">{f.text}</p>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}
