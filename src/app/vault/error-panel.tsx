export function ErrorPanel({ title, message }: { title: string; message: string }) {
  return (
    <main className="rise mx-auto w-full max-w-xl p-6">
      <div className="panel !border-red-500/60 p-5">
        <h1 className="display text-2xl text-red-300">{title}</h1>
        <p className="mt-2 text-sm text-red-200">{message}</p>
        <div className="mt-4 flex gap-3 text-sm">
          <a href="/vault" className="btn btn-sm">
            Reintentar
          </a>
          <a href="/api/auth/login" className="btn btn-gold btn-sm">
            Iniciar sesión de nuevo
          </a>
        </div>
      </div>
    </main>
  );
}
