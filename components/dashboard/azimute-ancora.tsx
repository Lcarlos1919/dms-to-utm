"use client"

import { useMemo, useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Crosshair, Database, Keyboard, Loader2, Map as MapIcon, MapPin, Search } from "lucide-react"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { dmsToDeg, num } from "@/lib/vertix-core/angulos"
import { montarPoligonal, posicionar } from "@/lib/vertix-core/montagem"
import { lonLatParaUtm } from "@/lib/vertix-core/utm"
import type { AzimuteDados } from "@/lib/azimute/tipos"

const AncoraMapa = dynamic(() => import("./azimute-ancora-mapa").then((m) => m.AncoraMapa), {
  ssr: false,
  loading: () => (
    <div className="flex h-[460px] w-full items-center justify-center rounded-lg bg-zinc-900" role="status">
      <MapIcon className="size-8 text-zinc-500" aria-hidden="true" />
      <span className="sr-only">Carregando mapa</span>
    </div>
  ),
})

type Modo = "base" | "manual" | "mapa"
const FUSOS = [18, 19, 20, 21, 22, 23, 24, 25]
const campo = "h-9 bg-zinc-900 border-zinc-700 text-zinc-100 text-sm"
const rotulo = "text-xs text-zinc-400"
const f2 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const f3 = (n: number) => n.toLocaleString("pt-BR", { minimumFractionDigits: 3, maximumFractionDigits: 3 })

/** "8.876.543,21", "8876543.21" ou "8876543,21" -> número. */
function lerCoordenada(t: string): number | undefined {
  const s = t.trim().replace(/\s/g, "")
  if (!s) return undefined
  const v = /,\d+$/.test(s) ? Number(s.replace(/\./g, "").replace(",", ".")) : /^\d{1,3}(\.\d{3})+$/.test(s) ? Number(s.replace(/\./g, "")) : Number(s)
  return Number.isFinite(v) ? v : undefined
}

/** "-10,123456", "10°12'13,4\" S" ou "62 40 12.3 W" -> graus decimais (negativo a S/W). */
function lerGrau(t: string): number | undefined {
  const s = t.trim().toUpperCase()
  if (!s) return undefined
  const neg = s.startsWith("-") || /[SWO]\s*$/.test(s)
  const dms = /(\d{1,3})\s*[°º\s]\s*(\d{1,2})\s*['′’\s]\s*(\d{1,2}(?:[.,]\d+)?)/.exec(s)
  const v = dms ? dmsToDeg(dms[1], dms[2], dms[3]) : num(s.replace(/^-/, "").replace(/[NSEWLO°\s]/g, ""))
  return Number.isFinite(v) ? (neg ? -Math.abs(v) : v) : undefined
}

export function AzimuteAncora({ projectId, dados, pronto }: { projectId: string; dados: AzimuteDados; pronto: boolean }) {
  const router = useRouter()
  const segs = dados.segmentos
  const nomes = useMemo(() => segs.map((s) => s.de), [segs])
  const pol = useMemo(() => (segs.length >= 3 ? montarPoligonal(segs) : null), [segs])
  const candidatas = dados.candidatas ?? []
  const coord = dados.coordenadaMemorial

  const [modo, setModo] = useState<Modo>(candidatas.length ? "base" : coord ? "manual" : "mapa")
  const [fuso, setFuso] = useState(dados.base?.fuso ?? dados.fuso)
  const [hemisferio, setHemisferio] = useState<"S" | "N">(dados.base?.hemisferio ?? dados.hemisferio)
  const [vertice, setVertice] = useState(
    coord?.vertice && nomes.includes(coord.vertice) ? coord.vertice : dados.cabecalho.inicio && nomes.includes(dados.cabecalho.inicio) ? dados.cabecalho.inicio : nomes[0] ?? "",
  )
  const [candidataIdx, setCandidataIdx] = useState(0)
  const [tipoCoord, setTipoCoord] = useState<"utm" | "geo">(coord?.lon !== undefined && coord.este === undefined ? "geo" : "utm")
  const [esteTexto, setEsteTexto] = useState(coord?.este !== undefined ? f3(coord.este) : "")
  const [norteTexto, setNorteTexto] = useState(coord?.norte !== undefined ? f3(coord.norte) : "")
  const [latTexto, setLatTexto] = useState(coord?.lat !== undefined ? String(coord.lat).replace(".", ",") : "")
  const [lonTexto, setLonTexto] = useState(coord?.lon !== undefined ? String(coord.lon).replace(".", ",") : "")
  const [clique, setClique] = useState<{ este: number; norte: number } | null>(null)
  const [busca, setBusca] = useState({ lote: dados.cabecalho.lote ?? "", gleba: dados.cabecalho.gleba ?? "", nomeGleba: dados.cabecalho.nomeGleba ?? "" })
  const [ocupado, setOcupado] = useState<null | "buscar" | "confirmar">(null)
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null)

  // Proposta atual (vértice + coordenada UTM), conforme o modo.
  const proposta = useMemo(() => {
    if (modo === "base") {
      const c = candidatas[candidataIdx]
      return c ? { vertice: c.vertice, este: c.este, norte: c.norte } : null
    }
    if (modo === "mapa") return clique && vertice ? { vertice, ...clique } : null
    if (!vertice) return null
    if (tipoCoord === "utm") {
      const este = lerCoordenada(esteTexto), norte = lerCoordenada(norteTexto)
      return este !== undefined && norte !== undefined && este >= 100_000 && este <= 900_000 && norte >= 0 && norte <= 10_000_000 ? { vertice, este, norte } : null
    }
    const lat = lerGrau(latTexto), lon = lerGrau(lonTexto)
    if (lat === undefined || lon === undefined || Math.abs(lat) > 90 || Math.abs(lon) > 180) return null
    const u = lonLatParaUtm(lon, lat, fuso)
    return { vertice, este: u.E, norte: u.N }
  }, [modo, candidatas, candidataIdx, clique, vertice, tipoCoord, esteTexto, norteTexto, latTexto, lonTexto, fuso])

  const preview = useMemo(() => {
    if (!pol || !proposta) return null
    try {
      return posicionar(pol, proposta.vertice, proposta.este, proposta.norte).map((v) => ({ nome: v.nome, este: v.x, norte: v.y }))
    } catch {
      return null
    }
  }, [pol, proposta])

  function aoClicar(lat: number, lon: number) {
    if (modo !== "mapa") setModo("mapa")
    const f = Math.floor((lon + 180) / 6) + 1
    const fusoUsado = f >= 18 && f <= 25 ? f : fuso
    if (fusoUsado !== fuso) setFuso(fusoUsado)
    setHemisferio(lat < 0 ? "S" : "N")
    const u = lonLatParaUtm(lon, lat, fusoUsado)
    setClique({ este: u.E, norte: u.N })
  }

  async function buscarBase() {
    if (!busca.lote.trim()) {
      setMensagem({ tipo: "erro", texto: "Informe o número do lote." })
      return
    }
    setOcupado("buscar")
    setMensagem(null)
    try {
      const r = await fetch(`/api/projetos/${projectId}/azimute/ancora`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(busca),
      })
      const json = (await r.json().catch(() => null)) as { ok?: boolean; encontrado?: boolean; motivo?: string; erro?: { mensagem?: string } } | null
      if (!r.ok || !json?.ok) throw new Error(json?.erro?.mensagem ?? "Não foi possível consultar a base.")
      setMensagem({ tipo: json.encontrado ? "ok" : "erro", texto: json.encontrado ? `Lote encontrado. ${json.motivo ?? ""}` : json.motivo ?? "Lote não encontrado." })
      router.refresh()
    } catch (e) {
      setMensagem({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao consultar a base." })
    } finally {
      setOcupado(null)
    }
  }

  async function confirmar() {
    if (!proposta) return
    setOcupado("confirmar")
    setMensagem(null)
    try {
      const r = await fetch(`/api/projetos/${projectId}/azimute/ancora`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          fonte: modo === "base" ? "base_fundiaria" : modo === "mapa" ? "mapa" : "manual",
          vertice: proposta.vertice,
          este: proposta.este,
          norte: proposta.norte,
          fuso,
          hemisferio,
        }),
      })
      const json = (await r.json().catch(() => null)) as { ok?: boolean; mensagem?: string; erro?: { mensagem?: string } } | null
      if (!r.ok || !json?.ok) throw new Error(json?.erro?.mensagem ?? "Não foi possível posicionar o memorial.")
      router.replace(`/dashboard/projeto/${projectId}`)
      router.refresh()
    } catch (e) {
      setMensagem({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao posicionar." })
      setOcupado(null)
    }
  }

  const seletorVertice = (
    <label className="space-y-1">
      <span className={rotulo}>Vértice que fica neste ponto</span>
      <select className={`${campo} w-full rounded-md border px-2`} value={vertice} onChange={(e) => setVertice(e.target.value)}>
        {nomes.map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  )
  const seletorFuso = (
    <div className="grid grid-cols-2 gap-2">
      <label className="space-y-1">
        <span className={rotulo}>Fuso UTM</span>
        <select className={`${campo} w-full rounded-md border px-2`} value={fuso} onChange={(e) => setFuso(Number(e.target.value))}>
          {FUSOS.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
      </label>
      <label className="space-y-1">
        <span className={rotulo}>Hemisfério</span>
        <select className={`${campo} w-full rounded-md border px-2`} value={hemisferio} onChange={(e) => setHemisferio(e.target.value === "N" ? "N" : "S")}>
          <option value="S">S</option>
          <option value="N">N</option>
        </select>
      </label>
    </div>
  )

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)]">
      <div className="space-y-6">
        <DashboardCard>
          <div className="space-y-3 p-5">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="font-display text-lg font-semibold text-zinc-100">Ponto de partida</h2>
              <Badge variant="outline">Etapa final</Badge>
            </div>
            <p className="text-sm text-zinc-400">
              A tabela foi conferida, mas o Vertix não conseguiu posicionar o lote sozinho. Escolha onde fica um dos vértices:
              o resto da poligonal é calculado a partir dele.
            </p>
            {dados.pendencia && <p role="status" className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">{dados.pendencia}</p>}
            {pol && (
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className={rotulo}>Segmentos</dt><dd className="text-zinc-100">{segs.length}</dd></div>
                <div><dt className={rotulo}>Perímetro</dt><dd className="text-zinc-100">{f2(pol.perimetroM)} m</dd></div>
                <div><dt className={rotulo}>Área</dt><dd className="text-zinc-100">{(pol.areaM2 / 10000).toLocaleString("pt-BR", { maximumFractionDigits: 4 })} ha</dd></div>
                <div><dt className={rotulo}>Fechamento</dt><dd className="text-zinc-100">{f2(pol.fechamentoLinearM)} m</dd></div>
              </dl>
            )}
            <Link href={`/dashboard/projeto/${projectId}?etapa=revisao`} className="inline-block text-sm text-lime-400 hover:underline">
              Revisar a tabela de segmentos
            </Link>
          </div>
        </DashboardCard>

        <DashboardCard>
          <div className="p-5">
            <Tabs value={modo} onValueChange={(v) => setModo(v as Modo)}>
              <TabsList className="grid w-full grid-cols-3">
                <TabsTrigger value="base"><Database className="mr-1 size-4" aria-hidden="true" />Base</TabsTrigger>
                <TabsTrigger value="manual"><Keyboard className="mr-1 size-4" aria-hidden="true" />Digitar</TabsTrigger>
                <TabsTrigger value="mapa"><Crosshair className="mr-1 size-4" aria-hidden="true" />Mapa</TabsTrigger>
              </TabsList>

              <TabsContent value="base" className="space-y-4 pt-4">
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                  <label className="space-y-1"><span className={rotulo}>Lote</span><Input className={campo} value={busca.lote} maxLength={40} onChange={(e) => setBusca({ ...busca, lote: e.target.value })} /></label>
                  <label className="space-y-1"><span className={rotulo}>Gleba</span><Input className={campo} value={busca.gleba} maxLength={40} onChange={(e) => setBusca({ ...busca, gleba: e.target.value })} /></label>
                  <label className="col-span-2 space-y-1 sm:col-span-1"><span className={rotulo}>Nome da gleba</span><Input className={campo} value={busca.nomeGleba} maxLength={120} onChange={(e) => setBusca({ ...busca, nomeGleba: e.target.value })} /></label>
                </div>
                <Button variant="outline" size="sm" onClick={buscarBase} disabled={ocupado !== null}>
                  {ocupado === "buscar" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Search aria-hidden="true" />}
                  Buscar na base fundiária
                </Button>
                {dados.base ? (
                  <div className="space-y-2 text-sm">
                    <p className="text-zinc-300">
                      Lote <strong>{dados.base.lote}</strong> · gleba {dados.base.gleba || "—"} · {dados.base.nomeGleba}
                      {dados.base.areaOficialHa !== undefined && <> · {dados.base.areaOficialHa.toLocaleString("pt-BR")} ha na base</>}
                      <span className="text-zinc-500"> ({dados.base.fonte === "banco" ? "base no Supabase" : "GeoPortal SEDAM"})</span>
                    </p>
                    {dados.base.avisos.length > 0 && <ul className="list-disc pl-5 text-xs text-amber-200">{dados.base.avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>}
                    {candidatas.length ? (
                      <fieldset className="space-y-2">
                        <legend className={rotulo}>Posições possíveis (melhor primeiro)</legend>
                        {candidatas.map((c, i) => (
                          <label key={i} className={`flex cursor-pointer items-start gap-2 rounded-lg border p-2 ${i === candidataIdx ? "border-lime-500 bg-lime-500/10" : "border-zinc-800"}`}>
                            <input type="radio" name="candidata" className="mt-1" checked={i === candidataIdx} onChange={() => { setCandidataIdx(i); setModo("base") }} />
                            <span className="text-zinc-300">
                              Posição {i + 1}: {c.vertice} num canto do lote · {c.sobreDivisa}/{c.total} vértices na divisa · {c.dentro}/{c.total} dentro
                              <span className="text-zinc-500"> · pontuação {c.pontuacao}</span>
                            </span>
                          </label>
                        ))}
                      </fieldset>
                    ) : (
                      <p className="text-zinc-500">Nenhuma posição em que a poligonal se encaixe no lote. Use “Digitar” ou “Mapa”.</p>
                    )}
                  </div>
                ) : (
                  <p className="text-sm text-zinc-500">Nenhum lote carregado. Confira lote, gleba e nome e busque de novo.</p>
                )}
              </TabsContent>

              <TabsContent value="manual" className="space-y-4 pt-4">
                {seletorVertice}
                <div className="flex gap-2 text-sm">
                  <Button size="sm" variant={tipoCoord === "utm" ? "default" : "outline"} onClick={() => setTipoCoord("utm")}>UTM (E/N)</Button>
                  <Button size="sm" variant={tipoCoord === "geo" ? "default" : "outline"} onClick={() => setTipoCoord("geo")}>Latitude/Longitude</Button>
                </div>
                {tipoCoord === "utm" ? (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1"><span className={rotulo}>Este (E) em metros</span><Input className={campo} inputMode="decimal" placeholder="512.345,678" value={esteTexto} onChange={(e) => setEsteTexto(e.target.value)} /></label>
                    <label className="space-y-1"><span className={rotulo}>Norte (N) em metros</span><Input className={campo} inputMode="decimal" placeholder="8.876.543,210" value={norteTexto} onChange={(e) => setNorteTexto(e.target.value)} /></label>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <label className="space-y-1"><span className={rotulo}>Latitude</span><Input className={campo} placeholder={`-10,123456 ou 10°07'24,4" S`} value={latTexto} onChange={(e) => setLatTexto(e.target.value)} /></label>
                    <label className="space-y-1"><span className={rotulo}>Longitude</span><Input className={campo} placeholder={`-62,654321 ou 62°39'15,6" W`} value={lonTexto} onChange={(e) => setLonTexto(e.target.value)} /></label>
                  </div>
                )}
                {seletorFuso}
                <p className="text-xs text-zinc-500">Datum SIRGAS 2000. {coord ? "Valores preenchidos a partir do memorial: confira." : ""}</p>
              </TabsContent>

              <TabsContent value="mapa" className="space-y-4 pt-4">
                {seletorVertice}
                <p className="text-sm text-zinc-400">
                  <MapPin className="mr-1 inline size-4 text-red-400" aria-hidden="true" />
                  Clique no mapa onde fica o vértice escolhido. A poligonal acompanha o clique; ajuste até encaixar na imagem de satélite.
                </p>
                {clique && <p className="text-xs text-zinc-500">E {f3(clique.este)} · N {f3(clique.norte)} · fuso {fuso}{hemisferio}</p>}
              </TabsContent>
            </Tabs>

            <div className="mt-5 space-y-2 border-t border-zinc-800 pt-4">
              {mensagem && <p role="alert" className={mensagem.tipo === "erro" ? "text-sm text-red-400" : "text-sm text-emerald-400"}>{mensagem.texto}</p>}
              <div className="flex flex-wrap gap-2">
                <Button onClick={confirmar} disabled={!proposta || ocupado !== null}>
                  {ocupado === "confirmar" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                  Confirmar e gerar memorial pronto
                </Button>
                {pronto && (
                  <Button variant="ghost" onClick={() => { router.replace(`/dashboard/projeto/${projectId}`); router.refresh() }} disabled={ocupado !== null}>
                    Voltar ao projeto pronto
                  </Button>
                )}
              </div>
              {!proposta && <p className="text-xs text-zinc-500">Escolha uma posição da base, digite uma coordenada válida ou clique no mapa.</p>}
            </div>
          </div>
        </DashboardCard>
      </div>

      <DashboardCard>
        <div className="space-y-2 p-5">
          <h2 className="font-display text-lg font-semibold text-zinc-100">Pré-visualização</h2>
          <AncoraMapa
            fuso={fuso}
            hemisferio={hemisferio}
            lote={dados.base ? { anel: dados.base.anel, fuso: dados.base.fuso, hemisferio: dados.base.hemisferio } : null}
            poligonal={preview}
            verticeAncora={proposta?.vertice ?? null}
            onClique={aoClicar}
          />
          <p className="text-xs text-zinc-500">
            Verde: poligonal do memorial na posição proposta (vértice de partida em vermelho). Laranja tracejado: lote da base fundiária.
            Clicar no mapa usa o modo “Mapa”.
          </p>
        </div>
      </DashboardCard>
    </div>
  )
}
