import Link from "next/link"

export default function AdminNotFound() {
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <p className="font-display text-6xl font-bold text-zinc-700">404</p>
      <h1 className="font-display text-2xl font-semibold text-zinc-100">Registro não encontrado</h1>
      <p className="max-w-sm text-zinc-500">O usuário ou recurso administrativo não existe.</p>
      <Link href="/admin" className="rounded-full bg-zinc-100 px-5 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-200">
        Voltar ao painel
      </Link>
    </main>
  )
}
