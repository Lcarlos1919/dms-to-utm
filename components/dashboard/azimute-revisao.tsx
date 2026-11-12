"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, Loader2, MinusCircle, Plus, RefreshCw, Save, Trash2, XCircle } from "lucide-react"
import { DashboardCard } from "@/components/dashboard/dashboard-card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs"
import { num } from "@/lib/vertix-core/angulos"
import type { Segmento } from "@/lib/vertix-core/memorial"
import { conferirIdentificacao, lerAnguloLivre, relatorioPoligonal, textoAzimute, validarSegmentos, type Check } from "@/lib/vertix-core/revisao"
import { FUSO_PADRAO, type AzimuteDados, type AzimuteStatus } from "@/lib/azimute/tipos"

interface Linha {
  id: string
  de: string
  para: string
  anguloTexto: string
  azimute: number | null
  tipo: "azimute" | "rumo"
  distanciaTexto: string
  confrontante: string
}

const FUSOS = [18, 19, 20, 21, 22, 23, 24, 25]
const campo = "h-8 bg-zinc-900 border-zinc-700 text-zinc-100 text-sm"
const rotulo = "text-xs text-zinc-400"
let contador = 0
const novoId = () => `l${Date.now()}-${contador++}`

const fmtNum = (n: number | undefined) => (n === undefined || !Number.isFinite(n) ? "" : n.toLocaleString("pt-BR", { maximumFractionDigits: 4 }))
const lerNumero = (t: string) => {
  const s = t.trim()
  if (!s) return undefined
  const v = num(s)
  return Number.isFinite(v) && v > 0 ? v : undefined
}

function deSegmento(s: AzimuteDados["segmentos"][number]): Linha {
  return { id: novoId(), de: s.de, para: s.para, anguloTexto: s.tipo === "azimute" ? textoAzimute(s.azimute) : s.azimuteTexto, azimute: s.azimute, tipo: s.tipo, distanciaTexto: fmtNum(s.distancia), confrontante: s.confrontante ?? "" }
}

function paraSegmento(l: Linha): Segmento {
  return {
    de: l.de.trim(),
    para: l.para.trim(),
    azimute: l.azimute ?? Number.NaN,
    azimuteTexto: l.anguloTexto,
    tipo: l.tipo,
    distancia: lerNumero(l.distanciaTexto) ?? Number.NaN,
    ...(l.confrontante.trim() ? { confrontante: l.confrontante.trim() } : {}),
  }
}

const statusRotulo: Record<AzimuteStatus, string> = {
  pendente: "Aguardando leitura",
  lido: "Lido — revise a tabela",
  revisado: "Tabela confirmada",
  erro_leitura: "Leitura incompleta",
}

function IconeCheck({ status }: { status: Check["status"] }) {
  if (status === "ok") return <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" aria-hidden="true" />
  if (status === "atencao") return <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" aria-hidden="true" />
  if (status === "erro") return <XCircle className="h-4 w-4 shrink-0 text-red-400" aria-hidden="true" />
  return <MinusCircle className="h-4 w-4 shrink-0 text-zinc-500" aria-hidden="true" />
}

export function AzimuteRevisao({
  projectId,
  initialStatus,
  initialDados,
  memorialUrl,
  plantaUrl,
}: {
  projectId: string
  initialStatus: AzimuteStatus
  initialDados: AzimuteDados | null
  memorialUrl: string | null
  plantaUrl: string | null
}) {
  const router = useRouter()
  const [status, setStatus] = useState<AzimuteStatus>(initialStatus)
  const [planta, setPlanta] = useState<AzimuteDados["planta"]>(initialDados?.planta ?? {})
  const [avisos, setAvisos] = useState<string[]>(initialDados?.avisosLeitura ?? [])
  const [linhas, setLinhas] = useState<Linha[]>(() => (initialDados?.segmentos ?? []).map(deSegmento))
  const [lote, setLote] = useState(initialDados?.cabecalho.lote ?? "")
  const [gleba, setGleba] = useState(initialDados?.cabecalho.gleba ?? "")
  const [nomeGleba, setNomeGleba] = useState(initialDados?.cabecalho.nomeGleba ?? "")
  const [municipio, setMunicipio] = useState(initialDados?.cabecalho.municipio ?? "")
  const [uf, setUf] = useState(initialDados?.cabecalho.uf ?? "")
  const [areaTexto, setAreaTexto] = useState(fmtNum(initialDados?.cabecalho.areaHa))
  const [perimetroTexto, setPerimetroTexto] = useState(fmtNum(initialDados?.cabecalho.perimetroM))
  const [fuso, setFuso] = useState(initialDados?.fuso ?? FUSO_PADRAO)
  const [hemisferio, setHemisferio] = useState<"S" | "N">(initialDados?.hemisferio ?? "S")
  const [conferi, setConferi] = useState(false)
  const [ocupado, setOcupado] = useState<null | "ler" | "salvar" | "confirmar">(null)
  const [mensagem, setMensagem] = useState<{ tipo: "ok" | "erro"; texto: string } | null>(null)

  const lido = status !== "pendente"
  const segmentos = useMemo(() => linhas.map(paraSegmento), [linhas])
  const problemas = useMemo(() => validarSegmentos(segmentos), [segmentos])
  const areaDeclarada = lerNumero(areaTexto)
  const perimetroDeclarado = lerNumero(perimetroTexto)
  const relatorio = useMemo(
    () => relatorioPoligonal(segmentos, { areaHa: areaDeclarada, perimetroM: perimetroDeclarado }, planta),
    [segmentos, areaDeclarada, perimetroDeclarado, planta],
  )
  const identificacao = useMemo(() => conferirIdentificacao({ lote, gleba }, planta), [lote, gleba, planta])
  const podeConfirmar = problemas.length === 0 && relatorio.calculavel && relatorio.situacao !== "erro" && conferi && ocupado === null
  const valoresValidos = linhas.every((l) => l.azimute !== null && lerNumero(l.distanciaTexto) !== undefined)

  function aplicarDados(dados: AzimuteDados, novoStatus: AzimuteStatus) {
    setStatus(novoStatus)
    setPlanta(dados.planta)
    setAvisos(dados.avisosLeitura)
    setLinhas(dados.segmentos.map(deSegmento))
    setLote(dados.cabecalho.lote ?? "")
    setGleba(dados.cabecalho.gleba ?? "")
    setNomeGleba(dados.cabecalho.nomeGleba ?? "")
    setMunicipio(dados.cabecalho.municipio ?? "")
    setUf(dados.cabecalho.uf ?? "")
    setAreaTexto(fmtNum(dados.cabecalho.areaHa))
    setPerimetroTexto(fmtNum(dados.cabecalho.perimetroM))
    setFuso(dados.fuso)
    setHemisferio(dados.hemisferio)
    setConferi(false)
  }

  async function chamar(metodo: "POST" | "PUT", corpo?: unknown) {
    const resposta = await fetch(`/api/projetos/${projectId}/azimute`, {
      method: metodo,
      headers: corpo ? { "Content-Type": "application/json" } : undefined,
      body: corpo ? JSON.stringify(corpo) : undefined,
    })
    const json = (await resposta.json().catch(() => null)) as { ok?: boolean; status?: AzimuteStatus; dados?: AzimuteDados; erro?: { mensagem?: string } } | null
    if (!resposta.ok || !json?.ok || !json.dados || !json.status) {
      throw new Error(json?.erro?.mensagem ?? "Não foi possível concluir a operação. Tente novamente.")
    }
    return { dados: json.dados, status: json.status }
  }

  async function ler() {
    if (lido && !window.confirm("Ler novamente descarta as suas edições. Continuar?")) return
    setOcupado("ler")
    setMensagem(null)
    try {
      const r = await chamar("POST")
      aplicarDados(r.dados, r.status)
      setMensagem({ tipo: "ok", texto: r.status === "lido" ? "Documentos lidos. Revise a tabela." : "A leitura ficou incompleta. Complete a tabela manualmente." })
      router.refresh()
    } catch (e) {
      setMensagem({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao ler os documentos." })
    } finally {
      setOcupado(null)
    }
  }

  async function salvar(confirmar: boolean) {
    if (!valoresValidos) {
      setMensagem({ tipo: "erro", texto: "Corrija os valores inválidos da tabela antes de salvar." })
      return
    }
    setOcupado(confirmar ? "confirmar" : "salvar")
    setMensagem(null)
    try {
      const r = await chamar("PUT", {
        cabecalho: {
          lote: lote.trim() || undefined,
          gleba: gleba.trim() || undefined,
          nomeGleba: nomeGleba.trim() || undefined,
          municipio: municipio.trim() || undefined,
          uf: uf.trim().toUpperCase() || undefined,
          areaHa: areaDeclarada,
          perimetroM: perimetroDeclarado,
          inicio: linhas[0]?.de.trim() || undefined,
        },
        fuso,
        hemisferio,
        segmentos: segmentos.map((s) => ({ ...s })),
        confirmar,
      })
      setStatus(r.status)
      if (confirmar) setConferi(false)
      setMensagem({ tipo: "ok", texto: confirmar ? "Tabela confirmada. Próxima etapa: localizar o lote na base fundiária (logo abaixo)." : "Rascunho salvo." })
      router.refresh()
    } catch (e) {
      setMensagem({ tipo: "erro", texto: e instanceof Error ? e.message : "Erro ao salvar." })
    } finally {
      setOcupado(null)
    }
  }

  function atualizar(id: string, parcial: Partial<Linha>) {
    setLinhas((atual) => atual.map((l) => (l.id === id ? { ...l, ...parcial } : l)))
  }
  function digitarAngulo(id: string, texto: string) {
    const lido = lerAnguloLivre(texto)
    atualizar(id, { anguloTexto: texto, azimute: lido?.azimute ?? null, tipo: lido?.tipo ?? "azimute" })
  }
  function normalizarAngulo(l: Linha) {
    if (l.azimute !== null && l.tipo === "azimute") atualizar(l.id, { anguloTexto: textoAzimute(l.azimute) })
  }
  function inserirAbaixo(indice: number) {
    setLinhas((atual) => {
      const anterior = atual[indice]
      const nova: Linha = { id: novoId(), de: anterior?.para ?? "", para: "", anguloTexto: "", azimute: null, tipo: "azimute", distanciaTexto: "", confrontante: "" }
      return [...atual.slice(0, indice + 1), nova, ...atual.slice(indice + 1)]
    })
  }
  function adicionar() {
    setLinhas((atual) => {
      const ultima = atual[atual.length - 1]
      return [...atual, { id: novoId(), de: ultima?.para ?? "", para: "", anguloTexto: "", azimute: null, tipo: "azimute", distanciaTexto: "", confrontante: "" }]
    })
  }
  function mover(indice: number, delta: -1 | 1) {
    setLinhas((atual) => {
      const alvo = indice + delta
      if (alvo < 0 || alvo >= atual.length) return atual
      const copia = [...atual]
      ;[copia[indice], copia[alvo]] = [copia[alvo], copia[indice]]
      return copia
    })
  }

  const problemasPorLinha = (indice: number) => problemas.filter((p) => p.linha === indice && p.campo !== "geral").map((p) => p.msg)
  const problemasGerais = problemas.filter((p) => p.campo === "geral").map((p) => p.msg)

  if (!lido) {
    return (
      <DashboardCard>
        <div className="space-y-4 p-6">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-semibold text-zinc-100">Ler memorial e planta</h2>
            <Badge variant="outline">Azimute</Badge>
          </div>
          <p className="text-sm text-zinc-400">
            O Vertix vai ler o texto do memorial e o rodapé da planta e montar a tabela de azimutes e distâncias para você revisar. Nada é gravado além da tabela e do cabeçalho.
          </p>
          {mensagem && (
            <p role="alert" className={mensagem.tipo === "erro" ? "text-sm text-red-400" : "text-sm text-emerald-400"}>
              {mensagem.texto}
            </p>
          )}
          <Button onClick={ler} disabled={ocupado !== null}>
            {ocupado === "ler" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
            {ocupado === "ler" ? "Lendo documentos…" : "Ler documentos"}
          </Button>
        </div>
      </DashboardCard>
    )
  }

  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <div className="space-y-6">
        <DashboardCard>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <h2 className="font-display text-lg font-semibold text-zinc-100">Identificação</h2>
                <Badge variant="outline">Azimute</Badge>
              </div>
              <Badge variant={status === "revisado" ? "default" : "outline"}>{statusRotulo[status]}</Badge>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <label className="space-y-1"><span className={rotulo}>Lote</span><Input className={campo} value={lote} onChange={(e) => setLote(e.target.value)} maxLength={40} /></label>
              <label className="space-y-1"><span className={rotulo}>Gleba</span><Input className={campo} value={gleba} onChange={(e) => setGleba(e.target.value)} maxLength={40} /></label>
              <label className="space-y-1 col-span-2 sm:col-span-1"><span className={rotulo}>Nome da gleba</span><Input className={campo} value={nomeGleba} onChange={(e) => setNomeGleba(e.target.value)} maxLength={120} /></label>
              <label className="space-y-1 col-span-2 sm:col-span-1"><span className={rotulo}>Município</span><Input className={campo} value={municipio} onChange={(e) => setMunicipio(e.target.value)} maxLength={120} /></label>
              <label className="space-y-1"><span className={rotulo}>UF</span><Input className={campo} value={uf} onChange={(e) => setUf(e.target.value)} maxLength={2} /></label>
              <label className="space-y-1"><span className={rotulo}>Datum</span><Input className={campo} value="SIRGAS 2000" readOnly /></label>
              <label className="space-y-1"><span className={rotulo}>Área declarada (ha)</span><Input className={campo} inputMode="decimal" value={areaTexto} onChange={(e) => setAreaTexto(e.target.value)} /></label>
              <label className="space-y-1"><span className={rotulo}>Perímetro declarado (m)</span><Input className={campo} inputMode="decimal" value={perimetroTexto} onChange={(e) => setPerimetroTexto(e.target.value)} /></label>
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
            </div>
          </div>
        </DashboardCard>

        <DashboardCard>
          <div className="space-y-4 p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-lg font-semibold text-zinc-100">Tabela de segmentos</h2>
              <Button variant="outline" size="sm" onClick={ler} disabled={ocupado !== null}>
                {ocupado === "ler" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <RefreshCw aria-hidden="true" />}
                Ler novamente
              </Button>
            </div>
            {avisos.length > 0 && (
              <div role="status" className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-200">
                <ul className="list-disc space-y-1 pl-5">{avisos.map((a, i) => <li key={i}>{a}</li>)}</ul>
              </div>
            )}
            {problemasGerais.length > 0 && <p className="text-sm text-red-400">{problemasGerais.join(" ")}</p>}
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="text-left text-xs text-zinc-500">
                    <th className="w-8 pb-2">#</th><th className="pb-2 pr-2">De</th><th className="pb-2 pr-2">Para</th>
                    <th className="pb-2 pr-2">Azimute ou rumo</th><th className="pb-2 pr-2">Distância (m)</th><th className="pb-2 pr-2">Confrontante</th><th className="pb-2" />
                  </tr>
                </thead>
                <tbody>
                  {linhas.map((l, i) => {
                    const erros = problemasPorLinha(i)
                    const anguloInvalido = l.anguloTexto.trim() !== "" && l.azimute === null
                    return (
                      <tr key={l.id} className="align-top">
                        <td className="py-1 pr-1 text-zinc-500">{i + 1}</td>
                        <td className="py-1 pr-2"><Input className={campo} value={l.de} onChange={(e) => atualizar(l.id, { de: e.target.value.toUpperCase() })} aria-label={`Segmento ${i + 1}: de`} maxLength={24} /></td>
                        <td className="py-1 pr-2"><Input className={campo} value={l.para} onChange={(e) => atualizar(l.id, { para: e.target.value.toUpperCase() })} aria-label={`Segmento ${i + 1}: para`} maxLength={24} /></td>
                        <td className="py-1 pr-2">
                          <Input
                            className={`${campo} ${anguloInvalido ? "border-red-500" : ""}`}
                            value={l.anguloTexto}
                            onChange={(e) => digitarAngulo(l.id, e.target.value)}
                            onBlur={() => normalizarAngulo(l)}
                            aria-label={`Segmento ${i + 1}: azimute ou rumo`}
                            aria-invalid={anguloInvalido}
                            maxLength={40}
                          />
                          {anguloInvalido && <p className="mt-1 text-xs text-red-400">{'Formato inválido. Ex.: 92°33\'41,91" · N 45°10\'20" E'}</p>}
                        </td>
                        <td className="py-1 pr-2"><Input className={campo} inputMode="decimal" value={l.distanciaTexto} onChange={(e) => atualizar(l.id, { distanciaTexto: e.target.value })} aria-label={`Segmento ${i + 1}: distância`} /></td>
                        <td className="py-1 pr-2"><Input className={campo} value={l.confrontante} onChange={(e) => atualizar(l.id, { confrontante: e.target.value })} aria-label={`Segmento ${i + 1}: confrontante`} maxLength={200} /></td>
                        <td className="whitespace-nowrap py-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => mover(i, -1)} disabled={i === 0} aria-label="Subir"><ArrowUp aria-hidden="true" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => mover(i, 1)} disabled={i === linhas.length - 1} aria-label="Descer"><ArrowDown aria-hidden="true" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => inserirAbaixo(i)} aria-label="Inserir abaixo"><Plus aria-hidden="true" /></Button>
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => setLinhas((a) => a.filter((x) => x.id !== l.id))} aria-label="Excluir segmento"><Trash2 aria-hidden="true" /></Button>
                          {erros.map((m, k) => <p key={k} className="mt-1 text-xs text-red-400">{m}</p>)}
                        </td>
                      </tr>
                    )
                  })}
                  {linhas.length === 0 && (
                    <tr><td colSpan={7} className="py-6 text-center text-zinc-500">Nenhum segmento. Use “Adicionar segmento”.</td></tr>
                  )}
                </tbody>
              </table>
            </div>
            <Button variant="outline" size="sm" onClick={adicionar}><Plus aria-hidden="true" />Adicionar segmento</Button>
          </div>
        </DashboardCard>

        <DashboardCard>
          <div className="space-y-3 p-5">
            <label className="flex items-start gap-2 text-sm text-zinc-300">
              <input type="checkbox" className="mt-1" checked={conferi} onChange={(e) => setConferi(e.target.checked)} />
              <span>Conferi a tabela com a planta.</span>
            </label>
            {mensagem && (
              <p role="alert" className={mensagem.tipo === "erro" ? "text-sm text-red-400" : "text-sm text-emerald-400"}>{mensagem.texto}</p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => salvar(false)} disabled={ocupado !== null}>
                {ocupado === "salvar" ? <Loader2 className="animate-spin" aria-hidden="true" /> : <Save aria-hidden="true" />}
                Salvar rascunho
              </Button>
              <Button onClick={() => salvar(true)} disabled={!podeConfirmar}>
                {ocupado === "confirmar" ? <Loader2 className="animate-spin" aria-hidden="true" /> : null}
                Confirmar tabela
              </Button>
            </div>
            {!podeConfirmar && (
              <p className="text-xs text-zinc-500">Para confirmar: sem problemas na tabela, relatório sem erro e a caixa “Conferi” marcada.</p>
            )}
          </div>
        </DashboardCard>
      </div>

      <div className="space-y-6">
        <DashboardCard>
          <div className="space-y-3 p-5">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-zinc-100">Relatório de validação</h2>
              <Badge variant={relatorio.situacao === "erro" ? "destructive" : "outline"}>
                {relatorio.situacao === "ok" ? "Tudo certo" : relatorio.situacao === "atencao" ? "Atenção" : "Corrigir"}
              </Badge>
            </div>
            {relatorio.calculavel && (
              <dl className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                <div><dt className={rotulo}>Perímetro</dt><dd className="text-zinc-100">{relatorio.perimetroM.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m</dd></div>
                <div><dt className={rotulo}>Fechamento</dt><dd className="text-zinc-100">{relatorio.fechamentoM.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} m</dd></div>
                <div><dt className={rotulo}>Precisão</dt><dd className="text-zinc-100">1:{Math.round(relatorio.precisao).toLocaleString("pt-BR")}</dd></div>
                <div><dt className={rotulo}>Área</dt><dd className="text-zinc-100">{relatorio.areaHa.toLocaleString("pt-BR", { minimumFractionDigits: 4, maximumFractionDigits: 4 })} ha</dd></div>
              </dl>
            )}
            <ul className="space-y-2">
              {[...relatorio.checks, ...identificacao].map((c) => (
                <li key={c.id} className="flex items-start gap-2 text-sm">
                  <IconeCheck status={c.status} />
                  <span><span className="font-medium text-zinc-200">{c.rotulo}.</span> <span className="text-zinc-400">{c.detalhe}</span></span>
                </li>
              ))}
            </ul>
          </div>
        </DashboardCard>

        <DashboardCard>
          <div className="p-5">
            <Tabs defaultValue="planta">
              <TabsList>
                <TabsTrigger value="planta">Planta</TabsTrigger>
                <TabsTrigger value="memorial">Memorial</TabsTrigger>
              </TabsList>
              <TabsContent value="planta">
                {plantaUrl ? <iframe title="Planta do lote" src={plantaUrl} className="mt-3 h-[640px] w-full rounded-lg bg-white" /> : <p className="mt-3 text-sm text-zinc-500">Planta indisponível.</p>}
              </TabsContent>
              <TabsContent value="memorial">
                {memorialUrl ? <iframe title="Memorial descritivo" src={memorialUrl} className="mt-3 h-[640px] w-full rounded-lg bg-white" /> : <p className="mt-3 text-sm text-zinc-500">Memorial indisponível.</p>}
              </TabsContent>
            </Tabs>
            <p className="mt-2 text-xs text-zinc-500">A tabela de lados da planta é um desenho: confira os azimutes e as distâncias visualmente.</p>
          </div>
        </DashboardCard>
      </div>
    </div>
  )
}
