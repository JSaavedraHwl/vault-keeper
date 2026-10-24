export function ErrorPanel({ title, message }: { title: string; message: string }) {
  return (
    <main className="mx-auto max-w-xl p-6">
      <div className="rounded border border-red-500 bg-red-950/40 p-4">
        <h1 className="text-lg font-semibold text-red-300">{title}</h1>
        <p className="mt-2 text-sm text-red-200">{message}</p>
        <div className="mt-4 flex gap-3 text-sm">
          <a href="/vault" className="rounded bg-zinc-700 px-3 py-1.5 hover:bg-zinc-600">
            Reintentar
          </a>
          <a href="/api/auth/login" className="rounded bg-blue-600 px-3 py-1.5 hover:bg-blue-500">
            Iniciar sesión de nuevo
          </a>
        </div>
      </div>
    </main>
  );
}
