import "server-only"

import { createAdminClient } from "@/lib/supabase/server"
import { MAX_PDF_SIZE } from "@/lib/pdf-validation"
import { lerCoordenadaInicial, lerMemorial } from "@/lib/vertix-core/memorial"
import { lerRodapePlanta } from "@/lib/vertix-core/planta"
import { corrigirDistancias, textoCorrecao } from "@/lib/vertix-core/correcao"
import { ErroPdf, lerPaginasComOcr } from "@/lib/ocr/paginas"
import { geminiConfigurado, transcreverPaginasComGemini } from "@/lib/ocr/gemini"
import { FUSO_PADRAO, type AzimuteDados } from "@/lib/azimute/tipos"

const MAX_PAGINAS = 30

export class ErroLeitura extends Error {
  constructor(
    public codigo: string,
    mensagem: string,
    public status = 400,
  ) {
    super(mensagem)
  }
}

/**
 * Texto de todas as páginas, na ordem de leitura. Páginas digitalizadas passam pelo OCR.
 * Roda só no servidor.
 */
async function textoDoPdf(bytes: Uint8Array): Promise<{ texto: string; avisos: string[] }> {
  if (bytes.byteLength > MAX_PDF_SIZE) throw new ErroLeitura("PDF_MUITO_GRANDE", "O PDF excede o tamanho máximo permitido.")
  try {
    const leitura = await lerPaginasComOcr(bytes, { maxPaginas: MAX_PAGINAS })
    return { texto: leitura.texto, avisos: leitura.avisos }
  } catch (e) {
    if (e instanceof ErroPdf) throw new ErroLeitura(e.codigo, e.message)
    throw e
  }
}

async function baixar(path: string): Promise<Uint8Array> {
  const { data, error } = await createAdminClient().storage.from("memoriais").download(path)
  if (error || !data) throw new ErroLeitura("ARQUIVO_AUSENTE", "Não foi possível carregar o arquivo do projeto.", 404)
  return new Uint8Array(await data.arrayBuffer())
}

export interface ResultadoLeitura {
  dados: AzimuteDados
  status: "lido" | "erro_leitura"
}

/**
 * Filtro de verificação com a segunda API: relê o memorial inteiro com o Gemini e só aceita a leitura
 * se a poligonal dela fecha (fechamento, PER e área). Nunca troca uma leitura válida por outra não validada.
 */
async function conferirComSegundaLeitura(
  bytes: Uint8Array,
  atual: ReturnType<typeof lerMemorial> | null,
  avisos: string[],
): Promise<ReturnType<typeof lerMemorial> | null> {
  const precisa = !atual || atual.segmentos.length === 0 || (atual.conferencia !== undefined && !atual.conferencia.valido)
  if (!precisa || !geminiConfigurado()) return atual
  try {
    const { getDocumentProxy } = await import("unpdf")
    const pdf = await getDocumentProxy(bytes.slice())
    const paginas = Array.from({ length: Math.min(pdf.numPages, MAX_PAGINAS) }, (_, i) => i + 1)
    const transcritas = await transcreverPaginasComGemini(bytes, paginas)
    const texto = paginas.map((n) => transcritas.get(n) ?? "").join("\n")
    const segunda = lerMemorial(texto)
    if (segunda.conferencia?.valido) {
      avisos.push("Tabela do perímetro conferida pela segunda leitura (Gemini): a poligonal fecha com o PER e a área. Confira com o documento original.")
      return segunda
    }
    avisos.push(`A segunda leitura (Gemini) também não fechou a poligonal${segunda.conferencia ? `: ${segunda.conferencia.problemas.join("; ")}` : ""}. Revise a tabela.`)
    return atual
  } catch {
    avisos.push("Não foi possível fazer a segunda leitura (Gemini) da tabela do perímetro.")
    return atual
  }
}

/**
 * Lê memorial e planta do projeto e monta o JSON de azimute_dados.
 * Não guarda o texto dos PDFs nem o nome do proprietário.
 */
export async function lerDocumentosDoProjeto(memorialPath: string, plantaPath: string | null): Promise<ResultadoLeitura> {
  const avisos: string[] = []
  const memorialBytes = await baixar(memorialPath)
  let memorialTexto = ""
  try {
    const leitura = await textoDoPdf(memorialBytes)
    memorialTexto = leitura.texto
    avisos.push(...leitura.avisos)
  } catch (e) {
    if (e instanceof ErroLeitura && e.codigo === "PDF_MUITO_GRANDE") throw e
    avisos.push("Não foi possível ler o texto do memorial.")
  }
  if (!memorialTexto.trim()) avisos.push("O PDF do memorial parece ser uma imagem (sem texto). Preencha a tabela manualmente.")

  let planta: AzimuteDados["planta"] = {}
  if (plantaPath) {
    try {
      const plantaLida = await textoDoPdf(await baixar(plantaPath))
      avisos.push(...plantaLida.avisos.map((a) => `Planta: ${a}`))
      const rodape = lerRodapePlanta(plantaLida.texto)
      planta = {
        lote: rodape.lote,
        gleba: rodape.gleba,
        areaHa: rodape.areaHa,
        perimetroM: rodape.perimetroM,
      }
      if (!rodape.areaHa && !rodape.perimetroM) avisos.push("Não foi possível ler área e perímetro no rodapé da planta; confira visualmente.")
    } catch {
      avisos.push("Não foi possível ler o texto da planta; confira visualmente.")
    }
  }

  const memorial = await conferirComSegundaLeitura(memorialBytes, memorialTexto.trim() ? lerMemorial(memorialTexto) : null, avisos)
  if (memorial) avisos.push(...memorial.avisos)
  let segmentos = (memorial?.segmentos ?? []).map((s) => ({
    de: s.de,
    para: s.para,
    azimute: s.azimute,
    azimuteTexto: s.azimuteTexto,
    tipo: s.tipo,
    distancia: s.distancia,
    ...(s.confrontante ? { confrontante: s.confrontante } : {}),
  }))

  // Distância que contradiz as coordenadas escritas no memorial: corrige só quando o perímetro declarado confirma.
  const corr = corrigirDistancias(segmentos, memorial?.coordenadas, memorial?.perimetroM)
  segmentos = corr.segs
  for (const c of corr.correcoes) avisos.push(textoCorrecao(c))
  for (const suspeita of corr.suspeitas) avisos.push(suspeita)

  // Coordenada de partida e fuso declarados no próprio memorial (quando existem).
  const coord = memorialTexto.trim() ? lerCoordenadaInicial(memorialTexto, memorial?.inicio) : undefined
  const fusoTexto = coord?.fuso && coord.fuso >= 18 && coord.fuso <= 25 ? coord.fuso : undefined
  let fuso = fusoTexto ?? FUSO_PADRAO
  if (!fusoTexto && coord?.lon !== undefined) {
    const f = Math.floor((coord.lon + 180) / 6) + 1
    if (f >= 18 && f <= 25) fuso = f
  }
  const fusoDeclarado = Boolean(fusoTexto) || coord?.lon !== undefined

  const dados: AzimuteDados = {
    versao: 1,
    cabecalho: {
      lote: memorial?.lote,
      gleba: memorial?.gleba,
      nomeGleba: memorial?.nomeGleba,
      municipio: memorial?.municipio,
      uf: memorial?.uf,
      areaHa: memorial?.areaHa,
      perimetroM: memorial?.perimetroM,
      inicio: memorial?.inicio,
    },
    planta,
    fuso,
    hemisferio: coord?.hemisferio ?? (coord?.lat !== undefined && coord.lat > 0 ? "N" : "S"),
    datum: "SIRGAS 2000",
    segmentos,
    avisosLeitura: avisos.slice(0, 50),
    lidoEm: new Date().toISOString(),
    revisadoEm: null,
    fusoDeclarado,
    ...(coord ? { coordenadaMemorial: coord } : {}),
    base: null,
    candidatas: [],
    ancora: null,
    pendencia: null,
  }
  return { dados, status: segmentos.length ? "lido" : "erro_leitura" }
}
