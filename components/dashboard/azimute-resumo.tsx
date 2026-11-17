import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { Badge } from "@/components/ui/badge"
import type { AzimuteDados } from "@/lib/azimute/tipos"

const ORIGEM: Record<string, string> = {
  memorial: "pela coordenada informada no memorial",
  base_fundiaria: "pelo encaixe no lote da base fundiária",
  manual: "pela coordenada digitada",
  mapa: "pelo ponto marcado no mapa",
}

/** Cartão do memorial por azimute já pronto: de onde veio o posicionamento e atalhos para refazer. */
export function AzimuteResumo({ projectId, dados }: { projectId: string; dados: AzimuteDados }) {
  const a = dados.ancora
  return (
    <DashboardCard>
      <div className="flex flex-col gap-3 p-5 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 size-5 shrink-0 text-emerald-400" aria-hidden="true" />
          <div className="space-y-1 text-sm">
            <p className="font-medium text-zinc-100">
              Memorial pronto <Badge variant="outline" className="ml-1">{a?.automatica ? "Automático" : "Posicionado por você"}</Badge>
            </p>
            {a && (
              <p className="text-zinc-400">
                Vértice {a.vertice} posicionado {ORIGEM[a.fonte] ?? a.fonte} · fuso {dados.fuso}{dados.hemisferio} · {dados.segmentos.length} segmentos.
                {a.detalhe ? ` ${a.detalhe}` : ""}
              </p>
            )}
            <p className="text-xs text-zinc-500">O erro de fechamento do memorial foi distribuído proporcionalmente às distâncias (método de Bowditch).</p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap gap-3 text-sm">
          <Link href={`/dashboard/projeto/${projectId}?etapa=ancora`} className="text-lime-400 hover:underline">Mudar ponto de partida</Link>
          <Link href={`/dashboard/projeto/${projectId}?etapa=revisao`} className="text-lime-400 hover:underline">Revisar tabela</Link>
        </div>
      </div>
    </DashboardCard>
  )
}
