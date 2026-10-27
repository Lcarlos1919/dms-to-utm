"use client"

import { useMemo, useState, useTransition } from "react"
import dynamic from "next/dynamic"
import { Map as MapIcon, Plus, Save, Trash2 } from "lucide-react"
import { saveProjectVertices } from "@/app/dashboard/novo/actions"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { ExportButton } from "@/components/dashboard/export-button"
import { displayDatum } from "@/lib/project-status"
import { resolveKmlCrs } from "@/lib/export/kml-availability"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { recalcularGeometria, type Vertice } from "@/lib/topocad"
import { formatArea, formatLength } from "@/lib/format"

export type Vertex = Vertice

const ProjectMap = dynamic(
  () => import("./project-map").then((module) => module.ProjectMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-[420px] w-full items-center justify-center rounded-lg bg-zinc-900" role="status">
        <MapIcon className="size-8 text-zinc-500" aria-hidden="true" />
        <span className="sr-only">Carregando mapa dos vértices</span>
      </div>
    ),
  },
)

function computeMetrics(vertices: Vertex[]) {
  return vertices.length < 3 ? null : recalcularGeometria(vertices).geometria
}

function projectCrs(utmZone: string | null, utmHemisphere: string | null) {
  const match = utmZone?.trim().match(/^(\d{1,2})\s*([NS])?$/i)
  const zone = match ? Number(match[1]) : Number.NaN
  if (!Number.isInteger(zone) || zone < 1 || zone > 60) return null

  const explicitHemisphere = utmHemisphere?.trim().toUpperCase()
  if (explicitHemisphere && explicitHemisphere !== "S" && explicitHemisphere !== "N") return null
  const zoneHemisphere = match?.[2]?.toUpperCase() as "S" | "N" | undefined
  if (explicitHemisphere && zoneHemisphere && explicitHemisphere !== zoneHemisphere) return null
  const hemisphere = (explicitHemisphere as "S" | "N" | undefined) ?? zoneHemisphere
  if (hemisphere !== "S" && hemisphere !== "N") return null

  return {
    hemisphere,
    epsg: hemisphere === "S" ? 31960 + zone : 31954 + zone,
  }
}

export function ProjectView({
  projectId,
  initialVertices,
  initialZone,
  initialHemisphere,
  initialDatum,
  initialClosed = null,
  initialClosureErrorM = null,
  canExport = true,
}: {
  projectId: string
  initialVertices: Vertex[]
  initialZone: string | null
  initialHemisphere: string | null
  initialDatum: string | null
  initialClosed?: boolean | null
  initialClosureErrorM?: number | null
  canExport?: boolean
}) {
  const [vertices, setVertices] = useState(initialVertices)
  const [exportError, setExportError] = useState<string | null>(null)
  const datum = displayDatum(initialDatum)
  const crs = useMemo(() => projectCrs(initialZone, initialHemisphere), [initialZone, initialHemisphere])
  const kmlCrs = useMemo(
    () => resolveKmlCrs(initialDatum, initialZone, initialHemisphere),
    [initialDatum, initialZone, initialHemisphere],
  )
  const [message, setMessage] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const metrics = useMemo(() => computeMetrics(vertices), [vertices])

  function save() {
    setMessage(null)
    startTransition(async () => {
      const result = await saveProjectVertices({ projectId, vertices })
      setMessage(result.ok ? "Vértices salvos." : result.error)
    })
  }

  function addVertex() {
    setVertices((current) => {
      const code = `MANUAL-${current.length + 1}`
      const next = current.map((vertex, index) => ({
        ...vertex,
        vante: index === current.length - 1 ? code : vertex.vante,
        editado: true,
      }))

      return [
        ...next,
        {
          seq: current.length + 1,
          codigo: code,
          lonDms: "",
          latDms: "",
          lon: 0,
          lat: 0,
          altitude: null,
          vante: current[0]?.codigo ?? code,
          azimuteDms: "",
          distancia: 0,
          confrontacao: "",
          este: 0,
          norte: 0,
          editado: true,
        },
      ]
    })
  }

  function removeVertex(index: number) {
    setVertices((current) => {
      const remaining = current.filter((_, currentIndex) => currentIndex !== index)
      return remaining.map((vertex, sequence) => ({
        ...vertex,
        seq: sequence + 1,
        vante: remaining[sequence + 1]?.codigo ?? remaining[0]?.codigo ?? vertex.vante,
        editado: true,
      }))
    })
  }

  function updateVertex(index: number, field: "este" | "norte", value: string) {
    const normalized = value.trim().replace(",", ".")
    if (!normalized) return
    const parsed = Number(normalized)
    if (!Number.isFinite(parsed)) return

    setVertices((current) =>
      current.map((vertex, currentIndex) =>
        currentIndex === index ? { ...vertex, [field]: parsed, editado: true } : vertex,
      ),
    )
  }

  const isClosed = metrics ? metrics.poligonoFechado : initialClosed
  const distanceDivergence = metrics ? metrics.divergenciaMaxDistanciaM : initialClosureErrorM

  const metricsCards = [
    { label: "Área", value: metrics ? formatArea(metrics.areaM2) : "—" },
    { label: "Perímetro na grade", value: metrics ? formatLength(metrics.perimetroGradeM) : "—" },
    { label: "Perímetro do memorial", value: metrics ? formatLength(metrics.perimetroMemorialM) : "—" },
    { label: "Polígono", value: isClosed === null ? "—" : isClosed ? "Fechado" : "Aberto" },
    {
      label: isClosed === false ? "Erro de fechamento" : "Divergência de distância",
      value: distanceDivergence === null || distanceDivergence === undefined ? "—" : formatLength(distanceDivergence),
    },
  ]

  return (
    <Tabs defaultValue="dados" className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <TabsList className="bg-zinc-900">
          <TabsTrigger value="dados">Dados</TabsTrigger>
          <TabsTrigger value="mapa">Mapa</TabsTrigger>
        </TabsList>
        <div className="flex flex-wrap items-center gap-2">
          <ExportButton projectId={projectId} format="xlsx" disabled={!canExport} onError={setExportError} />
          <ExportButton projectId={projectId} format="dxf" disabled={!canExport} onError={setExportError} />
          <ExportButton
            projectId={projectId}
            format="kml"
            disabled={!canExport || !kmlCrs.ok}
            disabledReason={canExport && !kmlCrs.ok ? kmlCrs.message : undefined}
            onError={setExportError}
          />
        </div>
      </div>
      {exportError && (
        <p role="alert" className="text-sm text-amber-400">
          {exportError}
        </p>
      )}

      <TabsContent value="dados" className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_240px]">
        <DashboardCard>
          <div className="w-full overflow-x-auto">
            {vertices.length === 0 ? (
              <p className="p-10 text-center text-sm text-zinc-500">
                Os vértices aparecerão aqui assim que o memorial for processado.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-zinc-800 hover:bg-transparent">
                    <TableHead className="text-zinc-500">Vértice</TableHead>
                    <TableHead className="text-zinc-500">E (m)</TableHead>
                    <TableHead className="text-zinc-500">N (m)</TableHead>
                    <TableHead className="text-zinc-500">Azimute</TableHead>
                    <TableHead className="text-zinc-500">Distância</TableHead>
                    <TableHead className="sr-only">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {vertices.map((vertex, index) => (
                    <TableRow key={`${vertex.codigo}-${index}`} className="border-zinc-800/60">
                      <TableCell className="font-mono text-zinc-200">{vertex.codigo}</TableCell>
                      {(["este", "norte"] as const).map((field) => (
                        <TableCell key={field}>
                          <input
                            type="text"
                            inputMode="decimal"
                            defaultValue={vertex[field]}
                            onBlur={(event) => updateVertex(index, field, event.target.value)}
                            aria-label={`${field === "este" ? "E" : "N"} do vértice ${vertex.codigo}`}
                            className="w-32 rounded-md border border-zinc-800 bg-zinc-900 px-2 py-1 font-mono text-sm text-zinc-100"
                          />
                        </TableCell>
                      ))}
                      <TableCell className="font-mono text-zinc-400">{vertex.azimuteDms || "—"}</TableCell>
                      <TableCell className="text-zinc-400">{formatLength(vertex.distancia)}</TableCell>
                      <TableCell>
                        <button
                          type="button"
                          onClick={() => removeVertex(index)}
                          className="rounded-md p-2 text-zinc-500 hover:bg-zinc-800 hover:text-red-400"
                          aria-label={`Remover vértice ${vertex.codigo}`}
                        >
                          <Trash2 className="h-4 w-4" aria-hidden="true" />
                        </button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-zinc-800/60 p-4">
              <button
                type="button"
                onClick={addVertex}
                className="inline-flex min-h-10 items-center gap-2 rounded-md border border-zinc-800 px-3 text-sm text-zinc-300 hover:bg-zinc-900"
              >
                <Plus className="h-4 w-4" aria-hidden="true" /> Adicionar vértice
              </button>
              <div className="flex items-center gap-3">
                {message && <span role="status" className="text-sm text-zinc-400">{message}</span>}
                <button
                  type="button"
                  onClick={save}
                  disabled={isPending}
                  className="inline-flex min-h-10 items-center gap-2 rounded-md bg-zinc-100 px-4 text-sm font-medium text-zinc-900 hover:bg-white disabled:opacity-60"
                >
                  <Save className="h-4 w-4" aria-hidden="true" /> {isPending ? "Salvando..." : "Salvar alterações"}
                </button>
              </div>
            </div>
          </div>
        </DashboardCard>

        <DashboardCard className="h-fit">
          <aside className="flex flex-col gap-4 p-5">
            <div>
              <h2 className="text-sm font-medium text-zinc-300">Parâmetros selecionados</h2>
              <p className="mt-1 text-xs leading-relaxed text-zinc-500">
                Extraídos do memorial; quando ausentes, o fuso é inferido pelas coordenadas.
              </p>
            </div>
            <dl className="flex flex-col gap-4 text-sm">
              <div>
                <dt className="text-zinc-500">Fuso UTM</dt>
                <dd className="mt-1 font-medium text-zinc-200">{initialZone ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Hemisfério</dt>
                <dd className="mt-1 font-medium text-zinc-200">{crs?.hemisphere ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-zinc-500">Datum</dt>
                <dd className="mt-1 font-medium text-zinc-200">
                  {datum}
                </dd>
              </div>
              <div>
                <dt className="text-zinc-500">EPSG</dt>
                <dd className="mt-1 font-medium text-zinc-200">{crs?.epsg ?? "—"}</dd>
              </div>
            </dl>
          </aside>
        </DashboardCard>
      </TabsContent>

      <TabsContent value="mapa" className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {metricsCards.map((card) => (
            <DashboardCard key={card.label} className="h-full">
              <div className="p-5">
                <p className="text-sm text-zinc-500">{card.label}</p>
                <p className="mt-1 font-display text-lg font-semibold text-zinc-100">{card.value}</p>
              </div>
            </DashboardCard>
          ))}
        </div>
        <DashboardCard>
          <div className="flex min-h-[320px] items-center justify-center p-6">
            {vertices.length > 0 ? (
              <ProjectMap
                vertices={vertices}
                utmZone={initialZone}
                hemisphere={crs?.hemisphere ?? null}
                datum={datum}
              />
            ) : (
              <div className="text-center">
                <MapIcon className="mx-auto size-8 text-zinc-600" aria-hidden="true" />
                <p className="mt-3 text-sm text-zinc-500">O mapa aparecerá quando o memorial tiver vértices convertidos.</p>
              </div>
            )}
          </div>
        </DashboardCard>
      </TabsContent>
    </Tabs>
  )
}
