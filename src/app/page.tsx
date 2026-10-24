const ERRORS: Record<string, string> = {
  denied: "Cancelaste el inicio de sesión en Bungie.",
  state: "No se pudo validar la solicitud de login (state inválido). Inténtalo de nuevo.",
  token: "Bungie no entregó los tokens. Revisa BUNGIE_CLIENT_ID / BUNGIE_CLIENT_SECRET.",
  expired: "Tu sesión expiró. Inicia sesión de nuevo.",
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  return (
    <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-6 p-6 text-center">
      <h1 className="text-3xl font-bold">Gestor de inventario Destiny 2</h1>
      {error && (
        <p className="rounded border border-red-500 bg-red-950/40 p-3 text-sm text-red-300">
          {ERRORS[error] ?? "Ocurrió un error al iniciar sesión."}
        </p>
      )}
      {/* Enlace normal (no <Link>) para evitar prefetch de una ruta que redirige */}
      <a
        href="/api/auth/login"
        className="rounded bg-blue-600 px-5 py-2 font-medium text-white hover:bg-blue-500"
      >
        Iniciar sesión con Bungie
      </a>
    </main>
  );
}
