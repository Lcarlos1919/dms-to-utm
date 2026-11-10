export function Forbidden() {
  return (
    <section className="flex min-h-[40vh] items-center justify-center text-center">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">403</p>
        <h1 className="mt-3 text-2xl font-semibold text-zinc-100">Acesso não autorizado</h1>
        <p className="mt-2 max-w-md text-sm text-zinc-400">Você não possui a permissão necessária para acessar esta área.</p>
      </div>
    </section>
  )
}
