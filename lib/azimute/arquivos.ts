// D5: gera KML, DXF e XLSX a partir do memorial por azimute e da posição escolhida.
// Não bloqueia nada: entrega o que for possível e lista objetivamente o que falta ou está errado.
import { buildKml } from "@/lib/export/kml"
import { gerarDxf, gerarXlsx, type Crs, type Vertice } from "@/lib/topocad"
import { calcularPoligonal } from "@/lib/vertix-core/poligonal"
import { lonLatParaUtm } from "@/lib/vertix-core/utm"
import { relatorioPoligonal, conferirCoordenadas, validarSegmentos } from "@/lib/vertix-core/revisao"
import type { Segmento } from "@/lib/vertix-core/memorial"
import type { AzimuteDados } from "./tipos"

export interface VerticeArquivo {
  codigo: string
  este: number
  norte: number
  lon: number | null
  lat: number | null
}

export interface ArquivosAzimute {
  /** Vértices usados nos arquivos (vazio quando a tabela tem erro). */
  vertices: VerticeArquivo[]
  /** true quando há posição geográfica (lote localizado e posição escolhida). */
  georreferenciado: boolean
  /** O que falta ou está errado, em frases objetivas para o usuário corrigir ou analisar. */
  pendencias: string[]
  /** Informações que não exigem correção (ex.: base indisponível naquele momento, forma simplificada). */
  avisos: string[]
  kml: string | null
  dxf: string | null
  xlsx: Uint8Array | null
}

const sanitizar = (nome: string) =>
  nome.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9-_]+/gi, "-").replace(/^-|-$/g, "") || "vertix"

/** EPSG do SIRGAS 2000 / UTM zona S do fuso = 31960 + fuso (ex.: fuso 20 → 31980). */
const epsgSirgasSul = (fuso: number) => 31960 + fuso

export function montarArquivos(dados: AzimuteDados, nomeProjeto: string, statusTabela: string = dados.revisadoEm ? "revisado" : "lido"): ArquivosAzimute {
  const pendencias: string[] = []
  const avisos: string[] = []
  const vazio = (): ArquivosAzimute => ({ vertices: [], georreferenciado: false, pendencias, avisos, kml: null, dxf: null, xlsx: null })

  const segs: Segmento[] = dados.segmentos.map((s) => ({ ...s }))
  const problemas = validarSegmentos(segs)
  if (problemas.length) {
    for (const p of problemas) pendencias.push(`Tabela, linha ${p.linha}: ${p.msg}`)
    return vazio()
  }

  const { fuso, hemisferio, cabecalho, localizacao } = dados
  if (statusTabela !== "revisado") pendencias.push("Tabela de segmentos ainda não confirmada.")
  const pol = calcularPoligonal(segs)

  // 1) Posição: a confirmada pelo usuário, senão a primeira candidata.
  let vertices: VerticeArquivo[]
  let georreferenciado = false
  const cand = localizacao?.estado === "encontrado" ? localizacao.candidatas : []
  if (cand.length) {
    const indice = localizacao?.confirmada?.indice ?? 0
    const escolhida = cand[Math.min(indice, cand.length - 1)]!
    if (escolhida.vertices.length !== pol.vertices.length) {
      pendencias.push(`A posição escolhida tem ${escolhida.vertices.length} vértices e o memorial tem ${pol.vertices.length}.`)
    }
    vertices = escolhida.vertices.map((v) => {
      const u = lonLatParaUtm(v.lon, v.lat, fuso)
      return { codigo: v.nome, este: u.E, norte: u.N, lon: v.lon, lat: v.lat }
    })
    georreferenciado = true
  } else {
    pendencias.push(
      localizacao?.estado === "nao_encontrado" || localizacao?.estado === "sem_fontes"
        ? `Lote não localizado: ${localizacao.motivo}`
        : "Lote ainda não localizado na base fundiária. Use 'Localizar lote'.",
    )
    vertices = pol.vertices.map((v) => ({ codigo: v.nome, este: v.x, norte: v.y, lon: null, lat: null }))
  }

  // 2) Pendências do cálculo: tudo que não estiver ok, com o texto do próprio relatório.
  const rel = relatorioPoligonal(segs, { areaHa: cabecalho.areaHa, perimetroM: cabecalho.perimetroM })
  for (const c of rel.checks) if (c.status === "atencao" || c.status === "erro") pendencias.push(`${c.rotulo}: ${c.detalhe}`)
  for (const c of conferirCoordenadas(segs, dados.coordenadas, fuso)) if (c.status !== "ok") pendencias.push(`${c.rotulo}: ${c.detalhe}`)
  // Avisos da localização: só os que apontam divergência ou lote errado viram pendência; o resto é informação.
  const ERRO_LOCALIZACAO = /diverge|não concordam|Confira se é o lote certo|sem geometria|menos de 3 vértices|Não foi possível posicionar/i
  for (const a of localizacao?.avisos ?? []) (ERRO_LOCALIZACAO.test(a) ? pendencias : avisos).push(a)

  // 3) Arquivos.
  const base = sanitizar(nomeProjeto)
  const areaHa = pol.areaHa
  const perimetroM = pol.perimetro

  let kml: string | null = null
  if (georreferenciado) {
    try {
      kml = buildKml({
        vertices: vertices.map((v) => ({ name: v.codigo, easting: v.este, northing: v.norte })),
        datum: "SIRGAS 2000",
        zone: fuso,
        hemisphere: hemisferio,
        metadata: { propertyName: nomeProjeto, owner: "", municipality: cabecalho.municipio ?? "", areaHa, perimeterM: perimetroM },
      })
    } catch (e) {
      pendencias.push(`KML não gerado: ${e instanceof Error ? e.message : "erro desconhecido"}`)
    }
  }

  const dxf = gerarDxf(vertices.map((v) => ({ codigo: v.codigo, este: v.este, norte: v.norte })))

  const crs: Crs = {
    datum: "SIRGAS 2000",
    fuso,
    hemisferio,
    epsg: epsgSirgasSul(fuso),
    nome: `SIRGAS 2000 / UTM zona ${fuso}${hemisferio}`,
  }
  const linhasV: Vertice[] = vertices.map((v, i) => ({
    seq: i + 1,
    codigo: v.codigo,
    lonDms: "",
    latDms: "",
    lon: v.lon ?? 0,
    lat: v.lat ?? 0,
    altitude: null,
    vante: "",
    azimuteDms: "",
    distancia: segs[i]?.distancia ?? 0,
    confrontacao: segs[i]?.confrontante ?? "",
    este: v.este,
    norte: v.norte,
    editado: false,
  }))
  const extras: [string, string | number][] = [
    ["Projeto", nomeProjeto],
    ["Área (m²)", Math.round(areaHa * 10000 * 100) / 100],
    ["Perímetro (m)", Math.round(perimetroM * 100) / 100],
    ["Posição geográfica", georreferenciado ? "Sim" : "Não definida (longitude e latitude zeradas)"],
  ]
  const xlsx = gerarXlsx(linhasV, crs, extras)

  return {
    vertices,
    georreferenciado,
    pendencias: [...new Set(pendencias)],
    avisos: [...new Set(avisos)],
    kml,
    dxf,
    xlsx,
  }
}

export const nomeArquivosAzimute = (nomeProjeto: string, ext: "kml" | "dxf" | "xlsx") => `${sanitizar(nomeProjeto)}.${ext}`
