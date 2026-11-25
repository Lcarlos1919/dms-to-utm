// Tabela de perímetro "LADOS / AZIMUTES / COMPRIMENTOS" (memorial em tabela, comum nos memoriais do INCRA/CEER).
// Trabalha sobre o texto já normalizado (uma linha). Lê os marcos (M-1343), os azimutes em graus/minutos/segundos
// e as distâncias em metros, e confere o resultado: fechamento do polígono, soma contra o PER e área contra a área do cabeçalho.
import { norm360 } from "./angulos"

export interface SegmentoTabela {
  de: string
  para: string
  azimute: number          // graus decimais (0..360)
  azimuteTexto: string     // como apareceu no OCR
  tipo: "azimute"
  distancia: number        // metros
}

export interface Conferencia {
  valido: boolean
  segmentos: number
  erroFechamentoM: number
  somaM: number
  perimetroM?: number
  areaCalcHa: number
  areaHa?: number
  problemas: string[]
}

export interface TabelaLida {
  ok: boolean
  segmentos: SegmentoTabela[]
  motivo?: string
}

const RE_INICIO = /DADOS\s+DO\s+PER[ÍI]METRO|LADOS\s+AZIMUTES/i
const RE_FIM = /CONFERE|VISTO\b|PLANTEL|RESPONS[ÁA]VEL/i
// Marco: M-1343, V-12 etc. (o "L-25" da coluna OBSERVAÇÕES é lado, não marco, e fica de fora).
const RE_MARCO = /\b([MVP])\s?-\s?(\d{1,6})\b/gi
// Azimute em graus, minutos e segundos. O grau pode vir sem o símbolo ("90 29'42\"").
const RE_AZIMUTE = /(\d{1,3})\s*[°º˚]?\s*(\d{1,2})\s*['′’´]\s*(\d{1,2}(?:[.,]\d+)?)/g
// Distância em metros no formato brasileiro: 250,16 / 2.060,77 / 2,062,35 (OCR com separador duplo).
const RE_DISTANCIA = /\b\d{1,4}(?:[.,]\d{3})*,\d{2,3}\b/g

/** "2,062,35" -> 2062.35; "2.060,77" -> 2060.77; "250,16" -> 250.16 */
export function numeroDistancia(bruto: string): number {
  const ultima = bruto.lastIndexOf(",")
  const inteiro = bruto.slice(0, ultima).replace(/[.,]/g, "")
  const decimal = bruto.slice(ultima + 1)
  return Number(`${inteiro}.${decimal}`)
}

function azimuteDeDms(graus: number, minutos: number, segundos: number): number {
  return graus + minutos / 60 + segundos / 3600
}

/** Lê a tabela de perímetro do texto. Devolve ok=false com o motivo quando não há região ou a contagem não bate. */
export function lerTabelaPerimetro(texto: string): TabelaLida {
  const inicio = RE_INICIO.exec(texto)
  if (!inicio) return { ok: false, segmentos: [] }
  const apos = texto.slice(inicio.index)
  const fim = RE_FIM.exec(apos.slice(40))
  const regiao = fim ? apos.slice(0, 40 + fim.index) : apos

  type Token = { pos: number; tipo: "marco" | "azimute" | "distancia"; valor: string | number; original: string }
  const tokens: Token[] = []
  for (const m of regiao.matchAll(RE_MARCO)) {
    tokens.push({ pos: m.index ?? 0, tipo: "marco", valor: `${m[1].toUpperCase()}-${Number(m[2])}`, original: m[0] })
  }
  for (const m of regiao.matchAll(RE_AZIMUTE)) {
    const graus = Number(m[1]), minutos = Number(m[2]), segundos = Number(m[3].replace(",", "."))
    if (minutos >= 60 || segundos >= 60 || graus > 360) continue
    tokens.push({ pos: m.index ?? 0, tipo: "azimute", valor: norm360(azimuteDeDms(graus, minutos, segundos)), original: m[0].trim() })
  }
  for (const m of regiao.matchAll(RE_DISTANCIA)) {
    const d = numeroDistancia(m[0])
    if (d > 0) tokens.push({ pos: m.index ?? 0, tipo: "distancia", valor: d, original: m[0] })
  }
  tokens.sort((a, b) => a.pos - b.pos)

  // Marcos consecutivos repetidos (M-1341 aparece no fim de um lado e no início do seguinte) contam uma vez.
  const marcos: string[] = []
  const azimutes: { valor: number; original: string }[] = []
  const distancias: number[] = []
  for (const t of tokens) {
    if (t.tipo === "marco") {
      if (marcos[marcos.length - 1] !== t.valor) marcos.push(t.valor as string)
    } else if (t.tipo === "azimute") {
      azimutes.push({ valor: t.valor as number, original: t.original })
    } else {
      distancias.push(t.valor as number)
    }
  }

  if (!azimutes.length && !distancias.length) return { ok: false, segmentos: [] }
  if (azimutes.length !== distancias.length) {
    return {
      ok: false,
      segmentos: [],
      motivo: `Tabela de perímetro com ${azimutes.length} azimutes e ${distancias.length} distâncias: não bate. Confira as linhas no documento original.`,
    }
  }
  if (marcos.length !== azimutes.length + 1) {
    return {
      ok: false,
      segmentos: [],
      motivo: `Tabela de perímetro com ${marcos.length} marcos para ${azimutes.length} lados: não bate. Confira os nomes dos marcos.`,
    }
  }

  const segmentos: SegmentoTabela[] = azimutes.map((a, i) => ({
    de: marcos[i],
    para: marcos[i + 1],
    azimute: a.valor,
    azimuteTexto: a.original,
    tipo: "azimute",
    distancia: distancias[i],
  }))
  return { ok: true, segmentos }
}

const RAD = Math.PI / 180

/** Confere a poligonal: fechamento, soma contra o PER e área contra a área do cabeçalho. */
export function conferirPoligonal(
  segmentos: { azimute: number; distancia: number }[],
  cabecalho: { perimetroM?: number; areaHa?: number },
): Conferencia {
  let x = 0, y = 0, soma = 0
  const vertices: { x: number; y: number }[] = [{ x, y }]
  for (const s of segmentos) {
    x += s.distancia * Math.sin(s.azimute * RAD)
    y += s.distancia * Math.cos(s.azimute * RAD)
    soma += s.distancia
    vertices.push({ x, y })
  }
  let duplo = 0
  for (let i = 0; i < vertices.length - 1; i++) {
    duplo += vertices[i].x * vertices[i + 1].y - vertices[i + 1].x * vertices[i].y
  }
  const areaCalcHa = Math.abs(duplo) / 2 / 10_000
  const erroFechamentoM = Math.hypot(x, y)

  const problemas: string[] = []
  if (segmentos.length < 3) problemas.push("menos de 3 lados")
  const tolFech = Math.max(0.5, soma / 5000)
  if (erroFechamentoM > tolFech) problemas.push(`não fecha: erro de ${erroFechamentoM.toFixed(2)} m (tolerância ${tolFech.toFixed(2)} m)`)
  if (cabecalho.perimetroM) {
    const tolPer = Math.max(0.5, cabecalho.perimetroM * 0.001)
    if (Math.abs(soma - cabecalho.perimetroM) > tolPer) {
      problemas.push(`soma dos lados ${soma.toFixed(2)} m difere do PER ${cabecalho.perimetroM.toFixed(2)} m`)
    }
  }
  if (cabecalho.areaHa) {
    const tolArea = Math.max(0.001, cabecalho.areaHa * 0.02)
    if (Math.abs(areaCalcHa - cabecalho.areaHa) > tolArea) {
      problemas.push(`área calculada ${areaCalcHa.toFixed(4)} ha difere da área do cabeçalho ${cabecalho.areaHa.toFixed(4)} ha`)
    }
  }

  return {
    valido: problemas.length === 0,
    segmentos: segmentos.length,
    erroFechamentoM,
    somaM: soma,
    perimetroM: cabecalho.perimetroM,
    areaCalcHa,
    areaHa: cabecalho.areaHa,
    problemas,
  }
}
