"use client"

import { useState, type FormEvent } from "react"
import { useRouter } from "next/navigation"

/** Equipe responde a conta pelo chat de suporte. */
export function SuporteResposta({ userId }: { userId: string }) {
  const router = useRouter()
  const [texto, setTexto] = useState("")
  const [pending, setPending] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function responder(e: FormEvent) {
    e.preventDefault()
    const conteudo = texto.trim()
    if (!conteudo) return
    setPending(true)
    setErro(null)
    try {
      const r = await fetch("/api/admin/suporte", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ userId, mensagem: conteudo }) })
      if (!r.ok) throw new Error("Não foi possível enviar a resposta.")
      setTexto("")
      router.refresh()
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar a resposta.")
    } finally {
      setPending(false)
    }
  }

  return (
    <form onSubmit={responder} className="mt-3 flex items-end gap-2">
      <label className="sr-only" htmlFor={`resposta-${userId}`}>Responder</label>
      <textarea
        id={`resposta-${userId}`}
        value={texto}
        onChange={(e) => setTexto(e.target.value)}
        maxLength={2000}
        rows={2}
        placeholder="Escreva a resposta"
        className="min-h-[44px] flex-1 resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-700"
      />
      <button type="submit" disabled={pending || !texto.trim()} className="rounded-xl bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 disabled:opacity-50">
        {pending ? "Enviando…" : "Responder"}
      </button>
      {erro && <p role="alert" className="text-xs text-red-400">{erro}</p>}
    </form>
  )
}
