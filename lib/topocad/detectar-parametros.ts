import type { Aviso, CodigoErro, ErroMotor } from "./tipos"

export interface ParametrosArquivo {
  fusoDeclarado?: number
  hemisferioDeclarado?: "S" | "N"
}

export type ResultadoDeteccaoParametros =
  | { ok: true; parametros: ParametrosArquivo; avisos: Aviso[] }
  | { ok: false; erro: ErroMotor; avisos: Aviso[] }

type DatumDetectado = "SIRGAS 2000" | "WGS 84" | "SAD69" | "Córrego Alegre"
type ReferenciaProjetada = { datum: DatumDetectado; fuso: number; hemisferio: "S" | "N" }

function normalizarCabecalho(texto: string) {
  return texto
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[‐‑‒–—]/g, "-")
    .toUpperCase()
}

function detectarDatums(textoNormalizado: string): DatumDetectado[] {
  const detectores: [RegExp, DatumDetectado][] = [
    [/\bSIRGAS\s*2000\b/, "SIRGAS 2000"],
    [/\bWGS\s*[- ]?84\b/, "WGS 84"],
    [/\bSAD\s*[- ]?69\b/, "SAD69"],
    [/\bCORREGO\s+ALEGRE\b/, "Córrego Alegre"],
  ]
  return detectores.filter(([regex]) => regex.test(textoNormalizado)).map(([, datum]) => datum)
}

function detectarDatum(textoNormalizado: string): DatumDetectado | undefined {
  return detectarDatums(textoNormalizado)[0]
}

function referenciaDoEpsg(epsg: number): ReferenciaProjetada | undefined {
  if (epsg >= 31978 && epsg <= 31987) {
    return { datum: "SIRGAS 2000", fuso: epsg - 31960, hemisferio: "S" }
  }
  if (epsg >= 32701 && epsg <= 32760) {
    return { datum: "WGS 84", fuso: epsg - 32700, hemisferio: "S" }
  }
  if (epsg >= 32601 && epsg <= 32660) {
    return { datum: "WGS 84", fuso: epsg - 32600, hemisferio: "N" }
  }
  return undefined
}

function datumDoEpsg(epsg: number): DatumDetectado | undefined {
  if (epsg === 4674) return "SIRGAS 2000"
  if (epsg === 4326) return "WGS 84"
  return referenciaDoEpsg(epsg)?.datum
}

function localizarFusos(textoNormalizado: string) {
  const linhas = textoNormalizado.split(/\r?\n/)
  const padroes = [
    /\b(?:FUSO|ZONA)\s*(?:UTM\s*)?[:=]?\s*(\d{1,2})\s*(?:°\s*)?(NORTE|SUL|N|S)?\b/,
    /\bUTM\s*(?:ZONA|ZONE)?\s*[:=]?\s*(\d{1,2})\s*(?:°\s*)?(NORTE|SUL|N|S)?\b/,
  ]
  const encontrados: { fuso: number; hemisferio?: "S" | "N" }[] = []
  const vistos = new Set<string>()

  for (const linha of linhas) {
    for (const padrao of padroes) {
      const padraoGlobal = new RegExp(padrao.source, "g")
      for (const match of linha.matchAll(padraoGlobal)) {
        const sufixo = match[2]
        const referencia = {
          fuso: Number(match[1]),
          hemisferio: sufixo ? (/^(?:S|SUL)$/.test(sufixo) ? "S" : "N") as "S" | "N" : undefined,
        }
        const chave = `${referencia.fuso}:${referencia.hemisferio ?? ""}`
        if (!vistos.has(chave)) {
          vistos.add(chave)
          encontrados.push(referencia)
        }
      }
    }
  }

  return encontrados
}

function localizarFuso(textoNormalizado: string) {
  return localizarFusos(textoNormalizado)[0]
}

function falha(codigo: CodigoErro, mensagem: string, avisos: Aviso[] = []): ResultadoDeteccaoParametros {
  return { ok: false, erro: { codigo, mensagem }, avisos }
}

/** Lê datum, zona UTM e EPSG declarados no conteúdo textual do arquivo. */
export function detectarParametrosMemorial(texto: string): ResultadoDeteccaoParametros {
  const normalizado = normalizarCabecalho(texto)
  const avisos: Aviso[] = []
  const datumsDeclarados = detectarDatums(normalizado)
  if (datumsDeclarados.length > 1) {
    return falha(
      "PARAMETROS_INCOMPATIVEIS",
      `O arquivo declara mais de um datum (${datumsDeclarados.join(", ")}). Confira os metadados antes de converter.`,
    )
  }
  const datumDeclarado = datumsDeclarados[0]

  const epsgs = Array.from(new Set(
    (normalizado.match(/\bEPSG\s*[:=]?\s*\d{4,5}\b/g) ?? []).map((referencia) =>
      Number(referencia.match(/\d{4,5}/)?.[0]),
    ),
  ))
  const referenciasEpsg = epsgs.map((epsg) => ({ epsg, datum: datumDoEpsg(epsg), referencia: referenciaDoEpsg(epsg) }))
  const epsgNaoSuportado = referenciasEpsg.find((referencia) => !referencia.datum)?.epsg
  if (epsgNaoSuportado !== undefined) {
    return falha(
      "CRS_NAO_SUPORTADO",
      `O arquivo declara EPSG:${epsgNaoSuportado}, que ainda não é suportado. Envie coordenadas em SIRGAS 2000 ou um memorial SIGEF com coordenadas geográficas.`,
    )
  }

  const datumsEpsg = Array.from(new Set(referenciasEpsg.flatMap((referencia) => referencia.datum ? [referencia.datum] : [])))
  if (datumsEpsg.length > 1) {
    return falha(
      "PARAMETROS_INCOMPATIVEIS",
      `Os EPSGs declarados pertencem a datums diferentes (${datumsEpsg.join(", ")}). Confira os metadados antes de converter.`,
    )
  }

  const referenciasProjetadas = referenciasEpsg.flatMap((referencia) => referencia.referencia ? [referencia.referencia] : [])
  const projecoesUnicas = new Set(referenciasProjetadas.map(({ datum, fuso, hemisferio }) => `${datum}:${fuso}:${hemisferio}`))
  if (projecoesUnicas.size > 1) {
    return falha(
      "PARAMETROS_INCOMPATIVEIS",
      "O arquivo declara mais de um EPSG projetado. Confira qual sistema UTM deve ser usado antes de converter.",
    )
  }
  const referenciaEpsg = referenciasProjetadas[0]
  const epsgIdentificado = referenciasEpsg.find((referencia) => referencia.referencia)?.epsg ?? referenciasEpsg[0]?.epsg
  const datumEpsg = datumsEpsg[0]

  const referenciasTexto = localizarFusos(normalizado)
  const fusosTexto = Array.from(new Set(referenciasTexto.map((referencia) => referencia.fuso)))
  const hemisferiosTexto = Array.from(new Set(referenciasTexto.flatMap((referencia) => referencia.hemisferio ? [referencia.hemisferio] : [])))
  if (fusosTexto.length > 1 || hemisferiosTexto.length > 1) {
    return falha(
      "PARAMETROS_INCOMPATIVEIS",
      `O memorial declara parâmetros UTM conflitantes (${referenciasTexto.map(({ fuso, hemisferio }) => `${fuso}${hemisferio ?? ""}`).join(", ")}). Não foi selecionado um fuso automaticamente.`,
    )
  }
  const fusoTexto = fusosTexto.length > 0
    ? { fuso: fusosTexto[0]!, hemisferio: hemisferiosTexto[0] }
    : undefined

  if (datumEpsg && datumDeclarado && datumEpsg !== datumDeclarado) {
    return falha(
      "PARAMETROS_INCOMPATIVEIS",
      `O datum declarado (${datumDeclarado}) não corresponde ao EPSG:${epsgIdentificado}. Confira os parâmetros do memorial antes de converter.`,
    )
  }

  if (fusoTexto && referenciaEpsg && fusoTexto.fuso !== referenciaEpsg.fuso) {
    return falha(
      "PARAMETROS_INCOMPATIVEIS",
      `O fuso ${fusoTexto.fuso} indicado no texto não corresponde ao EPSG:${epsgIdentificado} (fuso ${referenciaEpsg.fuso}). Confira os parâmetros do memorial.`,
    )
  }
  if (fusoTexto?.hemisferio && referenciaEpsg && fusoTexto.hemisferio !== referenciaEpsg.hemisferio) {
    return falha(
      "PARAMETROS_INCOMPATIVEIS",
      `O hemisfério indicado no texto não corresponde ao EPSG:${epsgIdentificado}. Confira os parâmetros do memorial.`,
    )
  }

  if (datumDeclarado && datumDeclarado !== "SIRGAS 2000") {
    return falha(
      "DATUM_NAO_SUPORTADO",
      `O arquivo declara ${datumDeclarado}. A conversão precisa de uma transformação geodésica validada para SIRGAS 2000; este arquivo não foi convertido para evitar deslocamento dos vértices.`,
    )
  }

  if (datumEpsg && datumEpsg !== "SIRGAS 2000") {
    return falha(
      "DATUM_NAO_SUPORTADO",
      `O EPSG:${epsgIdentificado} usa o datum ${datumEpsg}. A conversão precisa de uma transformação geodésica validada para SIRGAS 2000.`,
    )
  }

  const referencia = referenciaEpsg ?? fusoTexto
  if (!datumDeclarado && !datumEpsg) {
    avisos.push({
      codigo: "DATUM_NAO_IDENTIFICADO",
      mensagem: "O datum não aparece no memorial; foi adotado SIRGAS 2000, padrão do fluxo SIGEF.",
    })
  }

  return {
    ok: true,
    parametros: {
      fusoDeclarado: referencia?.fuso,
      hemisferioDeclarado: referencia?.hemisferio,
    },
    avisos,
  }
}

export function erroParametros(error: ErroMotor, avisos: Aviso[] = []): ResultadoDeteccaoParametros {
  return { ok: false, erro: error, avisos }
}

export function erroDatumNaoSuportado(mensagem: string): ResultadoDeteccaoParametros {
  return falha("DATUM_NAO_SUPORTADO", mensagem)
}

export const parametrosDetectadosComSucesso = (
  resultado: ResultadoDeteccaoParametros,
): resultado is Extract<ResultadoDeteccaoParametros, { ok: true }> => resultado.ok

export const codigoErroParametros = (codigo: string): codigo is CodigoErro =>
  ["PDF_SEM_TEXTO", "NENHUM_VERTICE", "FUSO_NAO_SUPORTADO", "DATUM_NAO_SUPORTADO", "CRS_NAO_SUPORTADO", "PARAMETROS_INCOMPATIVEIS", "COORDENADA_INVALIDA"].includes(codigo)

export const avisoDatumNaoIdentificado = (avisos: Aviso[]) =>
  avisos.some((aviso) => aviso.codigo === "DATUM_NAO_IDENTIFICADO")

export const tipoDatumDetectado = (texto: string) => detectarDatum(normalizarCabecalho(texto))

export const parametroZonaDetectada = (texto: string) => localizarFuso(normalizarCabecalho(texto))

export const parametroEpsgDetectado = (texto: string) => {
  const match = normalizarCabecalho(texto).match(/\bEPSG\s*[:=]?\s*(\d{4,5})\b/)
  return match ? Number(match[1]) : undefined
}

export const projecaoDoEpsg = referenciaDoEpsg

export const PARAMETROS_SIGEF_PADRAO = { datum: "SIRGAS 2000" as const }

export const CODIGOS_ERRO_PARAMETROS: CodigoErro[] = [
  "PDF_SEM_TEXTO",
  "NENHUM_VERTICE",
  "FUSO_NAO_SUPORTADO",
  "DATUM_NAO_SUPORTADO",
  "CRS_NAO_SUPORTADO",
  "PARAMETROS_INCOMPATIVEIS",
  "COORDENADA_INVALIDA",
]

export const AVISOS_PARAMETROS: Aviso["codigo"][] = ["DATUM_NAO_IDENTIFICADO", "FUSO_DECLARADO_DIFERENTE"]

export const normalizarTextoParametros = normalizarCabecalho

export function formatarReferenciaDetectada(parametros: ParametrosArquivo) {
  const fuso = parametros.fusoDeclarado
  const hemisferio = parametros.hemisferioDeclarado
  return fuso && hemisferio ? `${fuso}${hemisferio}` : undefined
}

export function criarErroParametro(codigo: CodigoErro, mensagem: string): ErroMotor {
  return { codigo, mensagem }
}

export function converterErroParametro(resultado: ResultadoDeteccaoParametros): ErroMotor | undefined {
  return resultado.ok ? undefined : resultado.erro
}

export function avisosParametro(resultado: ResultadoDeteccaoParametros) {
  return resultado.avisos
}

export function parametrosArquivoValidos(resultado: ResultadoDeteccaoParametros) {
  return resultado.ok
}

export function inferirHemisferioPorFuso(valor: string | number): "S" | "N" | undefined {
  const match = String(valor).trim().match(/^(\d{1,2})\s*([NS])$/i)
  return match ? match[2]!.toUpperCase() as "S" | "N" : undefined
}

export function inferirZonaPorFuso(valor: string | number): number | undefined {
  const match = String(valor).trim().match(/^(\d{1,2})\s*[NS]$/i)
  return match ? Number(match[1]) : undefined
}

export function zonaDentroDoIntervalo(fuso: number, minimo = 1, maximo = 60) {
  return Number.isInteger(fuso) && fuso >= minimo && fuso <= maximo
}

export function hemisferioValido(valor: unknown): valor is "S" | "N" {
  return valor === "S" || valor === "N"
}

export function datumSuportado(datum: string | undefined) {
  return !datum || datum === "SIRGAS 2000"
}

export function epsgSugerido(fuso: number, hemisferio: "S" | "N") {
  return hemisferio === "S" ? 31960 + fuso : 31954 + fuso
}

export function detectarZonaPorEpsg(epsg: number) {
  return referenciaDoEpsg(epsg)
}

export function normalizarDatum(datum: string) {
  const normalizado = normalizarCabecalho(datum)
  return detectarDatum(normalizado)
}

export function obterParametrosDaDeteccao(resultado: ResultadoDeteccaoParametros) {
  return resultado.ok ? resultado.parametros : undefined
}

export function mensagemErroParametros(resultado: ResultadoDeteccaoParametros) {
  return resultado.ok ? undefined : resultado.erro.mensagem
}

export function fusoExplicitoNoTexto(texto: string) {
  return localizarFuso(normalizarCabecalho(texto))?.fuso
}

export function hemisferioExplicitoNoTexto(texto: string) {
  return localizarFuso(normalizarCabecalho(texto))?.hemisferio
}

export function epsgExplicitoNoTexto(texto: string) {
  return parametroEpsgDetectado(texto)
}

export function arquivoUsaSIRGAS2000(texto: string) {
  return detectarDatum(normalizarCabecalho(texto)) === "SIRGAS 2000"
}

export function referenciaGeograficaSIRGAS2000(epsg: number) {
  return epsg === 4674
}

export function ehEpsgSIRGASProjetado(epsg: number) {
  return epsg >= 31978 && epsg <= 31987
}

export function ehEpsgWgs84(epsg: number) {
  return epsg === 4326 || (epsg >= 32601 && epsg <= 32660) || (epsg >= 32701 && epsg <= 32760)
}

export function ehDatumNaoSuportado(datum: string | undefined) {
  return Boolean(datum && datum !== "SIRGAS 2000")
}

export function resultadoParametroFalhou(resultado: ResultadoDeteccaoParametros) {
  return !resultado.ok
}

export function textoReferenciaAparentaUTM(texto: string) {
  return /\b(?:UTM|FUSO|ZONA)\b/i.test(normalizarCabecalho(texto))
}

export function detectarMetadadosMemorial(texto: string) {
  const resultado = detectarParametrosMemorial(texto)
  return resultado.ok ? resultado.parametros : undefined
}

export function erroDeParametro(resultado: ResultadoDeteccaoParametros) {
  return resultado.ok ? undefined : resultado.erro.codigo
}

export function avisoFusoDiferente(fusoDeclarado: number, fusoCalculado: number): Aviso {
  return {
    codigo: "FUSO_DECLARADO_DIFERENTE",
    mensagem: `O memorial declara o fuso ${fusoDeclarado}; pela posição dos vértices seria ${fusoCalculado}. Foi respeitado o fuso declarado no arquivo.`,
  }
}

export function errorDeParametro(codigo: CodigoErro, mensagem: string): ErroMotor {
  return { codigo, mensagem }
}

export function parametrosDoEpsg(epsg: number) {
  return referenciaDoEpsg(epsg)
}

export const DATUM_GEOREFERENCIADO_PADRAO = "SIRGAS 2000"

export function detectarDatumTexto(texto: string) {
  return detectarDatum(normalizarCabecalho(texto))
}

export function detectarZonaTexto(texto: string) {
  return localizarFuso(normalizarCabecalho(texto))
}

export function normalizarNumeroEpsg(texto: string) {
  return parametroEpsgDetectado(texto)
}

export function inferirCrsDoMemorial(texto: string) {
  return detectarParametrosMemorial(texto)
}

export function datumCodigoSuportado(datum: string | undefined) {
  return !datum || normalizarDatum(datum) === "SIRGAS 2000"
}

export function detectarSinalHemisferio(texto: string) {
  return localizarFuso(normalizarCabecalho(texto))?.hemisferio
}

export function validarParametrosDaReferencia(texto: string) {
  const resultado = detectarParametrosMemorial(texto)
  return resultado.ok ? { valido: true as const, ...resultado.parametros } : { valido: false as const, erro: resultado.erro }
}

export function parametrosAutomaticos(texto: string) {
  return detectarParametrosMemorial(texto)
}

export function referencialDetectado(texto: string) {
  return detectarDatum(normalizarCabecalho(texto)) ?? "SIRGAS 2000"
}

export function isSIRGAS2000(datum: string | undefined) {
  return !datum || normalizarDatum(datum) === "SIRGAS 2000"
}
