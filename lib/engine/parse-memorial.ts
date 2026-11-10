import "server-only"

import { extractText, getDocumentProxy } from "unpdf"

export type Confidence = "high" | "medium" | "low"

export type ParsedVertex = {
  label: string
  latitudeDms?: string
  longitudeDms?: string
  azimuthDms?: string
  distanceM?: number
  confidence: Confidence
}

export type MemorialParseResult = {
  ok: true
  vertices: ParsedVertex[]
  datum?: string
  utmZone?: number
  warnings: string[]
} | {
  ok: false
  code: "PDF_SEM_TEXTO" | "VERTICES_NAO_ENCONTRADOS"
  error: string
  warnings: string[]
}

const NUMBER = "(?:\\d{1,3}(?:[.,]\\d+)?)"
const DMS = new RegExp(`(?:[NSLOEW])?\\s*${NUMBER}\\s*[°º]\\s*${NUMBER}\\s*[']?\\s*${NUMBER}\\s*[\\\\\\\"]?\\s*[NSLOEW]?`, "i")
const VERTEX_LINE = /(?:v(?:értice|ertice)?|ponto|pt)\s*[-#: ]?\s*([A-Z0-9._-]+)/i
const DISTANCE = /(?:dist(?:ância|ancia)?|comprimento|dist\.)\s*[:=]?\s*(\d+(?:[.,]\d+)?)\s*m?/i
const AZIMUTH = /(?:azimute|azimute)\s*[:=]?\s*([^;|]+)/i

function number(value: string) {
  const parsed = Number(value.replace(/\./g, "").replace(",", "."))
  return Number.isFinite(parsed) ? parsed : undefined
}

function normalizeLine(line: string) {
  return line.replace(/\s+/g, " ").trim()
}

export function parseMemorialText(text: string): MemorialParseResult {
  const warnings: string[] = []
  const lines = text.split(/\r?\n/).map(normalizeLine).filter(Boolean)
  if (!lines.length || text.replace(/\s/g, "").length < 20) {
    return { ok: false, code: "PDF_SEM_TEXTO", error: "O PDF não contém texto extraível.", warnings }
  }

  const datum = lines.find((line) => /SIRGAS\s*2000|datum/i.test(line))?.match(/SIRGAS\s*2000|WGS\s*84/i)?.[0]
  const zoneMatch = lines.join(" ").match(/(?:zona|fuso)\s*(?:utm)?\s*[:=]?\s*(\d{1,2})/i)
  const utmZone = zoneMatch ? Number(zoneMatch[1]) : undefined
  const vertices: ParsedVertex[] = []

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const vertexMatch = line.match(VERTEX_LINE)
    if (!vertexMatch) continue
    const next = lines[index + 1] ?? ""
    const combined = `${line} ${next}`
    const dms = combined.match(new RegExp(`${DMS.source}[^0-9NSLOEW]+${DMS.source}`, "i"))
    const distance = combined.match(DISTANCE)
    const azimuth = combined.match(AZIMUTH)
    const firstPair = dms?.[0]?.match(new RegExp(DMS.source, "ig")) ?? []
    vertices.push({
      label: vertexMatch[1],
      latitudeDms: firstPair[0],
      longitudeDms: firstPair[1],
      azimuthDms: azimuth?.[1]?.trim(),
      distanceM: distance ? number(distance[1]) : undefined,
      confidence: firstPair.length >= 2 && distance ? "high" : firstPair.length >= 2 ? "medium" : "low",
    })
  }

  if (!vertices.length) {
    return { ok: false, code: "VERTICES_NAO_ENCONTRADOS", error: "Nenhum vértice foi identificado no memorial.", warnings }
  }
  if (vertices.some((vertex) => vertex.confidence === "low")) warnings.push("Alguns vértices precisam de revisão manual.")
  if (!datum) warnings.push("Datum não identificado.")
  if (!utmZone) warnings.push("Fuso UTM não identificado.")
  return { ok: true, vertices, datum, utmZone, warnings }
}

export async function parseMemorialPdf(input: ArrayBuffer | Uint8Array): Promise<MemorialParseResult> {
  const pdf = await getDocumentProxy(new Uint8Array(input))
  const { text } = await extractText(pdf, { mergePages: true })
  return parseMemorialText(text)
}

export const memorialParseCodes = {
  PDF_SEM_TEXTO: "PDF_SEM_TEXTO",
  VERTICES_NAO_ENCONTRADOS: "VERTICES_NAO_ENCONTRADOS",
} as const

export function formatDms(value: string | undefined) {
  return value?.replace(/\s+/g, " ").trim() ?? ""
}

export function parseDistance(value: string) {
  return number(value)
}

export function parseDmsPair(value: string) {
  return value.match(new RegExp(DMS.source, "ig")) ?? []
}

export function hasDms(value: string) {
  return DMS.test(value)
}

export function parseAzimuth(value: string) {
  return value.match(AZIMUTH)?.[1]?.trim()
}

export function parseVertexLabel(value: string) {
  return value.match(VERTEX_LINE)?.[1]
}

export function parseNumber(value: string) {
  return number(value)
}

export function normalizeMemorialLine(value: string) {
  return normalizeLine(value)
}

export function parseDatum(value: string) {
  return value.match(/SIRGAS\s*2000|WGS\s*84/i)?.[0]
}

export function parseUtmZone(value: string) {
  const match = value.match(/(?:zona|fuso)\s*(?:utm)?\s*[:=]?\s*(\d{1,2})/i)
  return match ? Number(match[1]) : undefined
}

export function isPdfWithoutText(result: MemorialParseResult) {
  return !result.ok && result.code === "PDF_SEM_TEXTO"
}

export function isLowConfidence(vertex: ParsedVertex) {
  return vertex.confidence === "low"
}

export function vertexCount(result: MemorialParseResult) {
  return result.ok ? result.vertices.length : 0
}

export function parseMemorialLines(lines: string[]) {
  return parseMemorialText(lines.join("\\n"))
}

export function getParseWarnings(result: MemorialParseResult) {
  return result.warnings
}

export function getParseError(result: MemorialParseResult) {
  return result.ok ? undefined : result.error
}

export function getParseCode(result: MemorialParseResult) {
  return result.ok ? undefined : result.code
}

export function isParsedMemorial(result: MemorialParseResult): result is Extract<MemorialParseResult, { ok: true }> {
  return result.ok
}

export function isParseFailure(result: MemorialParseResult): result is Extract<MemorialParseResult, { ok: false }> {
  return !result.ok
}

export function getVertexLabels(result: MemorialParseResult) {
  return result.ok ? result.vertices.map((vertex) => vertex.label) : []
}

export function getConfidenceSummary(result: MemorialParseResult) {
  if (!result.ok) return { high: 0, medium: 0, low: 0 }
  return result.vertices.reduce((summary, vertex) => ({ ...summary, [vertex.confidence]: summary[vertex.confidence] + 1 }), { high: 0, medium: 0, low: 0 })
}

export function isSupportedDatum(value: string | undefined) {
  return Boolean(value && /SIRGAS\s*2000|WGS\s*84/i.test(value))
}

export function clampConfidence(value: Confidence): Confidence {
  return value === "high" || value === "medium" || value === "low" ? value : "low"
}

export function toParseResult(result: MemorialParseResult) {
  return result
}

export const parseMemorial = parseMemorialText
export const parsePdfMemorial = parseMemorialPdf

export default parseMemorialText
