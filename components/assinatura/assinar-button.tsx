"use client"

import { useState } from "react"

/** Leva o usuário ao pagamento da Cakto (o servidor cria o link com o token da conta). */
export function AssinarButton({ label = "Assinar o Pro" }: { label?: string }) {
  const [pending, setPending] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function assinar() {
    setPending(true)
    setErro(null)
    try {
      const resposta = await fetch("/api/assinatura/checkout", { method: "POST" })
      const corpo = (await resposta.json().catch(() => ({}))) as { url?: string; erro?: { mensagem?: string } }
      if (!resposta.ok || !corpo.url) throw new Error(corpo.erro?.mensagem ?? "Não foi possível iniciar o pagamento.")
      window.location.href = corpo.url
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível iniciar o pagamento.")
      setPending(false)
    }
  }

  return (
    <div className="space-y-1">
      <button
        type="button"
        onClick={assinar}
        disabled={pending}
        className="inline-flex items-center rounded-full bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:cursor-wait disabled:opacity-60"
      >
        {pending ? "Abrindo pagamento…" : label}
      </button>
      {erro && <p role="alert" className="text-xs text-red-400">{erro}</p>}
    </div>
  )
}
