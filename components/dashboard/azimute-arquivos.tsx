"use client"

import { useEffect, useState } from "react"
import { Download, Loader2 } from "lucide-react"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { Button } from "@/components/ui/button"

interface Resumo {
  georreferenciado: boolean
  pendencias: string[]
  disponiveis: { kml: boolean; dxf: boolean; xlsx: boolean }
}

const FORMATOS = [
  { id: "kml", rotulo: "KML" },
  { id: "dxf", rotulo: "DXF" },
  { id: "xlsx", rotulo: "XLSX" },
] as const

/** Arquivos prontos para baixar e o que falta corrigir. Refaz o resumo quando a posição muda (chave). */
export function AzimuteArquivos({ projectId, chave }: { projectId: string; chave: string }) {
  const [resumo, setResumo] = useState<Resumo | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    let vivo = true
    setErro(null)
    fetch(`/api/projetos/${projectId}/azimute/arquivos?formato=resumo`, { cache: "no-store" })
      .then(async (r) => {
        const corpo = await r.json()
        if (!r.ok) throw new Error(corpo?.erro?.mensagem ?? "Não foi possível montar os arquivos.")
        if (vivo) setResumo(corpo as Resumo)
      })
      .catch((e: unknown) => {
        if (vivo) setErro(e instanceof Error ? e.message : "Não foi possível montar os arquivos.")
      })
    return () => {
      vivo = false
    }
  }, [projectId, chave])

  return (
    <DashboardCard title="Arquivos">
      <div className="space-y-5">
        <p className="text-sm text-zinc-400">
          Arquivo gerado automaticamente a partir do memorial e da base fundiária. Revise antes de usar em processo, registro ou
          levantamento oficial.
        </p>

        {!resumo && !erro && (
          <p className="flex items-center gap-2 text-sm text-zinc-500">
            <Loader2 className="size-4 animate-spin" aria-hidden="true" /> Montando arquivos…
          </p>
        )}
        {erro && <p className="text-sm text-zinc-300">{erro}</p>}

        {resumo && (
          <>
            <div className="flex flex-wrap gap-2">
              {FORMATOS.map((f) => (
                <Button
                  key={f.id}
                  variant="outline"
                  disabled={!resumo.disponiveis[f.id]}
                  asChild={resumo.disponiveis[f.id]}
                >
                  {resumo.disponiveis[f.id] ? (
                    <a href={`/api/projetos/${projectId}/azimute/arquivos?formato=${f.id}`} download>
                      <Download className="size-4" aria-hidden="true" /> Baixar {f.rotulo}
                    </a>
                  ) : (
                    <span>
                      <Download className="size-4" aria-hidden="true" /> {f.rotulo} indisponível
                    </span>
                  )}
                </Button>
              ))}
            </div>

            {resumo.pendencias.length > 0 && (
              <div>
                <h3 className="mb-2 text-sm font-medium text-zinc-200">Pendências</h3>
                <ul className="list-disc space-y-1.5 pl-5 text-sm text-zinc-400">
                  {resumo.pendencias.map((p, i) => (
                    <li key={i}>{p}</li>
                  ))}
                </ul>
              </div>
            )}
          </>
        )}
      </div>
    </DashboardCard>
  )
}
