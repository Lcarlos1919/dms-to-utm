"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, CheckCircle2, Loader2, MapPin, RefreshCw, XCircle } from "lucide-react"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import type { Localizacao } from "@/lib/azimute/tipos"

type Candidata = Localizacao["candidatas"][number]

const rotuloFonte = { banco: "base fundiária (Supabase)", geoportal: "GeoPortal da SEDAM (ao vivo)" } as const

const confiancaInfo: Record<Candidata["confianca"], { rotulo: string; classe: string }> = {
  sigef_confirmada: { rotulo: "Confirmada pelo SIGEF", classe: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300" },
  sigef_divisa: { rotulo: "Divisa no SIGEF", classe: "border-sky-500/40 bg-sky-500/10 text-sky-300" },
  siglo: { rotulo: "Só SIGLO (±1–2 m)", classe: "border-zinc-600 bg-zinc-800 text-zinc-300" },
}

const fmt = (n: number, casas = 1) => n.toLocaleString("pt-BR", { maximumFractionDigits: casas })

export function AzimuteLocalizacao({ projectId, inicial }: { projectId: string; inicial: Localizacao | null }) {
  const router = useRouter()
  const [loc, setLoc] = useState<Localizacao | null>(inicial)
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState<string | null>(null)

  async function localizar() {
    setOcupado(true)
    setErro(null)
    try {
      const resposta = await fetch(`/api/projetos/${projectId}/azimute/localizar`, { method: "POST" })
      const json = (await resposta.json().catch(() => null)) as { ok?: boolean; localizacao?: Localizacao; erro?: { mensagem?: string } } | null
      if (!resposta.ok || !json?.ok || !json.localizacao) throw new Error(json?.erro?.mensagem ?? "Não foi possível localizar o lote.")
      setLoc(json.localizacao)
      router.refresh()
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Não foi possível localizar o lote.")
    } finally {
      setOcupado(false)
    }
  }

  return (
    <DashboardCard>
      <div className="space-y-5 p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <MapPin className="h-5 w-5 text-zinc-400" aria-hidden="true" />
            <h2 className="font-display text-lg font-semibold text-zinc-100">Localizar na base fundiária</h2>
            <Badge variant="outline">Etapa 2</Badge>
          </div>
          <Button onClick={localizar} disabled={ocupado} variant={loc ? "outline" : "default"}>
            {ocupado ? <Loader2 className="animate-spin" aria-hidden="true" /> : loc ? <RefreshCw aria-hidden="true" /> : null}
            {ocupado ? "Procurando…" : loc ? "Localizar de novo" : "Localizar lote"}
          </Button>
        </div>

        {!loc && (
          <p className="text-sm text-zinc-400">
            O Vertix procura o lote na base SIGLO (a cópia no banco e o GeoPortal ao vivo, usando a que casar melhor), testa onde a poligonal do memorial se encaixa e refina com as parcelas certificadas do SIGEF. Você confirma a posição antes de gerar qualquer arquivo.
          </p>
        )}
        {erro && (
          <p role="alert" className="text-sm text-red-400">
            {erro}
          </p>
        )}

        {loc && loc.estado !== "encontrado" && (
          <div role="alert" className="flex items-start gap-3 rounded-2xl bg-amber-500/10 p-4">
            <XCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" aria-hidden="true" />
            <div className="space-y-1 text-sm">
              <p className="font-medium text-zinc-100">{loc.estado === "sem_fontes" ? "As fontes de dados não responderam" : "Lote não encontrado na base"}</p>
              <p className="text-zinc-400">{loc.motivo}</p>
              {loc.avisos.map((a) => (
                <p key={a} className="text-zinc-500">
                  {a}
                </p>
              ))}
              <p className="pt-1 text-zinc-500">Tente de novo em instantes ou confira lote, gleba e nome da gleba na tabela acima.</p>
            </div>
          </div>
        )}

        {loc && loc.estado === "encontrado" && loc.lote && (
          <div className="space-y-5">
            <dl className="grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <dt className="text-zinc-500">Lote na base</dt>
                <dd className="text-zinc-100">
                  {loc.lote.lote} · gleba {loc.lote.gleba || "—"}
                </dd>
                <dd className="text-zinc-400">{loc.lote.nomeGleba}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Fonte usada</dt>
                <dd className="text-zinc-100">{loc.fonte ? rotuloFonte[loc.fonte] : "—"}</dd>
                {loc.lote.baseData && <dd className="text-zinc-400">base de {loc.lote.baseData}</dd>}
              </div>
              <div>
                <dt className="text-zinc-500">Área oficial do lote</dt>
                <dd className="text-zinc-100">{loc.lote.areaOficialHa != null ? `${fmt(loc.lote.areaOficialHa, 2)} ha` : "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">SIGEF</dt>
                <dd className="text-zinc-100">
                  {!loc.sigef.ok ? "indisponível" : loc.sigef.parcelas ? `${loc.sigef.parcelas} parcela(s) perto` : "sem parcela perto"}
                </dd>
              </div>
            </dl>
            <p className="text-sm text-zinc-500">{loc.motivo}</p>

            {loc.avisos.length > 0 && (
              <ul className="space-y-1.5">
                {loc.avisos.map((a) => (
                  <li key={a} className="flex items-start gap-2 text-sm text-zinc-300">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
                    <span>{a}</span>
                  </li>
                ))}
              </ul>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-left text-sm">
                <thead className="text-xs text-zinc-500">
                  <tr>
                    <th className="py-2 pr-3 font-medium">#</th>
                    <th className="py-2 pr-3 font-medium">Âncora</th>
                    <th className="py-2 pr-3 font-medium">Vértices dentro do lote</th>
                    <th className="py-2 pr-3 font-medium">Na divisa</th>
                    <th className="py-2 pr-3 font-medium">Azimutes casados</th>
                    <th className="py-2 pr-3 font-medium">Confiança</th>
                  </tr>
                </thead>
                <tbody>
                  {loc.candidatas.map((c, i) => {
                    const info = confiancaInfo[c.confianca]
                    return (
                      <tr key={`${c.verticeMemorial}-${c.indiceLote}`} className="border-t border-zinc-800 text-zinc-200">
                        <td className="py-2.5 pr-3">
                          {i === 0 ? (
                            <span className="inline-flex items-center gap-1 text-emerald-300">
                              <CheckCircle2 className="h-4 w-4" aria-hidden="true" />1
                            </span>
                          ) : (
                            i + 1
                          )}
                        </td>
                        <td className="py-2.5 pr-3">
                          {c.verticeMemorial} <span className="text-zinc-500">→ vértice {c.indiceLote + 1} do lote</span>
                        </td>
                        <td className="py-2.5 pr-3">
                          {c.dentro} de {c.total}
                        </td>
                        <td className="py-2.5 pr-3">{c.sobreDivisa}</td>
                        <td className="py-2.5 pr-3">{c.azimutesCasados}</td>
                        <td className="py-2.5 pr-3">
                          <span className={`inline-flex rounded-md border px-2 py-0.5 text-xs ${info.classe}`}>{info.rotulo}</span>
                          {c.sigef.nivel === "confirmada" && c.sigef.residuoM != null && (
                            <span className="ml-2 text-xs text-zinc-500">resíduo {fmt(c.sigef.residuoM * 100, 0)} cm</span>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>

            <p className="text-xs text-zinc-500">
              A posição 1 é a recomendada, mas nada é definitivo: o mapa para conferir e confirmar a posição vem na próxima etapa. Localizado em {new Date(loc.localizadoEm).toLocaleString("pt-BR")}.
            </p>
          </div>
        )}
      </div>
    </DashboardCard>
  )
}
