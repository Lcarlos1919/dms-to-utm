"use client"

import { useEffect, useRef, useState, type FormEvent } from "react"
import { MessageCircle, X, Send } from "lucide-react"

type Mensagem = { id: number; autor: "usuario" | "suporte"; mensagem: string; created_at: string }

const hora = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" })

/** Chat de suporte: abre no canto da tela e atualiza enquanto estiver aberto. */
export function SuporteChat() {
  const [aberto, setAberto] = useState(false)
  const [mensagens, setMensagens] = useState<Mensagem[]>([])
  const [texto, setTexto] = useState("")
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState<string | null>(null)
  const fimRef = useRef<HTMLDivElement>(null)

  async function carregar() {
    try {
      const r = await fetch("/api/suporte", { cache: "no-store" })
      if (!r.ok) throw new Error()
      const corpo = (await r.json()) as { mensagens: Mensagem[] }
      setMensagens(corpo.mensagens)
    } catch {
      setErro("Não foi possível carregar as mensagens agora.")
    }
  }

  useEffect(() => {
    if (!aberto) return
    carregar()
    const timer = setInterval(carregar, 20_000)
    return () => clearInterval(timer)
  }, [aberto])

  useEffect(() => {
    fimRef.current?.scrollIntoView({ block: "end" })
  }, [mensagens, aberto])

  async function enviar(e: FormEvent) {
    e.preventDefault()
    const conteudo = texto.trim()
    if (!conteudo || enviando) return
    setEnviando(true)
    setErro(null)
    try {
      const r = await fetch("/api/suporte", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensagem: conteudo }) })
      const corpo = (await r.json().catch(() => ({}))) as { mensagem?: Mensagem; erro?: { mensagem?: string } }
      if (!r.ok || !corpo.mensagem) throw new Error(corpo.erro?.mensagem ?? "Não foi possível enviar. Tente novamente.")
      setMensagens((atual) => [...atual, corpo.mensagem as Mensagem])
      setTexto("")
    } catch (err) {
      setErro(err instanceof Error ? err.message : "Não foi possível enviar. Tente novamente.")
    } finally {
      setEnviando(false)
    }
  }

  return (
    <>
      {!aberto && (
        <button
          type="button"
          onClick={() => setAberto(true)}
          className="fixed bottom-5 right-5 z-40 inline-flex items-center gap-2 rounded-full bg-zinc-100 px-4 py-2.5 text-sm font-medium text-zinc-900 shadow-lg transition-colors hover:bg-zinc-200"
        >
          <MessageCircle className="h-4 w-4" aria-hidden="true" />
          Suporte
        </button>
      )}

      {aberto && (
        <section
          aria-label="Chat de suporte"
          className="fixed bottom-0 right-0 z-40 flex h-[80vh] w-full flex-col border border-zinc-800 bg-zinc-950 shadow-2xl sm:bottom-5 sm:right-5 sm:h-[480px] sm:w-[360px] sm:rounded-2xl"
        >
          <header className="flex items-center justify-between border-b border-zinc-800 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-zinc-100">Suporte Vertix</p>
              <p className="text-xs text-zinc-500">Respondemos por aqui.</p>
            </div>
            <button type="button" onClick={() => setAberto(false)} aria-label="Fechar suporte" className="rounded-lg p-2 text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100">
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {mensagens.length === 0 && <p className="text-sm text-zinc-500">Escreva sua dúvida ou o problema que aconteceu.</p>}
            {mensagens.map((m) => (
              <div key={m.id} className={m.autor === "usuario" ? "ml-8 text-right" : "mr-8"}>
                <p
                  className={
                    "inline-block whitespace-pre-wrap rounded-2xl px-3 py-2 text-left text-sm " +
                    (m.autor === "usuario" ? "bg-zinc-100 text-zinc-900" : "bg-zinc-900 text-zinc-100")
                  }
                >
                  {m.mensagem}
                </p>
                <p className="mt-1 text-[10px] text-zinc-600">{m.autor === "suporte" ? "Equipe · " : ""}{hora(m.created_at)}</p>
              </div>
            ))}
            <div ref={fimRef} />
          </div>

          {erro && <p role="alert" className="px-4 pb-1 text-xs text-red-400">{erro}</p>}
          <form onSubmit={enviar} className="flex items-end gap-2 border-t border-zinc-800 p-3">
            <label className="sr-only" htmlFor="suporte-texto">Mensagem para o suporte</label>
            <textarea
              id="suporte-texto"
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              maxLength={2000}
              rows={2}
              placeholder="Digite sua mensagem"
              className="min-h-[44px] flex-1 resize-none rounded-xl border border-zinc-800 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-700"
            />
            <button
              type="submit"
              disabled={enviando || !texto.trim()}
              aria-label="Enviar mensagem"
              className="rounded-xl bg-zinc-100 p-2.5 text-zinc-900 transition-colors hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" aria-hidden="true" />
            </button>
          </form>
        </section>
      )}
    </>
  )
}
