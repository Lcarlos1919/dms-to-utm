import "server-only"

import { createAdminClient } from "@/lib/supabase/server"
import { MAX_PDF_SIZE } from "@/lib/pdf-validation"
import { lerCoordenadaInicial, lerMemorial, type MemorialLido } from "@/lib/vertix-core/memorial"
import { lerRodapePlanta } from "@/lib/vertix-core/planta"
import { memorialDaTranscricao, numeroTranscrito, textoDaCoordenada } from "@/lib/vertix-core/transcricao"
import { LeituraVisaoIndisponivel, transcreverMemorial, transcreverRodapePlanta } from "@/lib/azimute/ler-imagem"
import { FUSO_PADRAO, type AzimuteDados } from "@/lib/azimute/tipos"

const MAX_PAGINAS = 30
/** Abaixo disso o PDF é tratado como imagem (escaneado): só carimbos ou números soltos. */
const MIN_TEXTO_UTIL = 40
const temTexto = (t: string) => t.replace(/\s+/g, "").length >= MIN_TEXTO_UTIL

export class ErroLeitura extends Error {
  constructor(
    public codigo: string,
    mensagem: string,
    public status = 400,
  ) {
    super(mensagem)
  }
}

/** Texto de todas as páginas, na ordem de leitura. Roda só no servidor. */
async function textoDoPdf(bytes: Uint8Array): Promise<string> {
  if (bytes.byteLength > MAX_PDF_SIZE) throw new ErroLeitura("PDF_MUITO_GRANDE", "O PDF excede o tamanho máximo permitido.")
  const { getDocumentProxy, extractText } = await import("unpdf")
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>
  try {
    pdf = await getDocumentProxy(bytes)
  } catch {
    throw new ErroLeitura("PDF_INVALIDO", "Não foi possível abrir o PDF.")
  }
  if (pdf.numPages > MAX_PAGINAS) throw new ErroLeitura("PDF_MUITO_GRANDE", `O PDF tem mais de ${MAX_PAGINAS} páginas.`)
  const { text } = await extractText(pdf, { mergePages: true })
  return text
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
 * Lê memorial e planta do projeto e monta o JSON de azimute_dados.
 * Não guarda o texto dos PDFs nem o nome do proprietário.
 */
export async function lerDocumentosDoProjeto(memorialPath: string, plantaPath: string | null): Promise<ResultadoLeitura> {
  const avisos: string[] = []
  const memorialBytes = await baixar(memorialPath)
  let memorialTexto = ""
  try {
    memorialTexto = await textoDoPdf(memorialBytes)
  } catch (e) {
    if (e instanceof ErroLeitura && e.codigo === "PDF_MUITO_GRANDE") throw e
    avisos.push("Não foi possível ler o texto do memorial.")
  }
  // PDF escaneado (sem texto): lê por visão. Se a leitura não estiver disponível, a tabela fica para preencher.
  let memorial: MemorialLido | null = temTexto(memorialTexto) ? lerMemorial(memorialTexto) : null
  let textoCoordenada = memorial ? memorialTexto : ""
  let escaneado = false
  if (!memorial || memorial.segmentos.length < 3) {
    try {
      const tr = await transcreverMemorial(memorialBytes)
      const lido = memorialDaTranscricao(tr)
      if (lido.segmentos.length >= 3 || !memorial) {
        memorial = lido
        textoCoordenada = textoDaCoordenada(tr) ?? ""
        escaneado = true
        avisos.push("Memorial lido como imagem (PDF escaneado). Confira a tabela com o documento antes de seguir.")
      }
    } catch (e) {
      if (!memorial) {
        avisos.push(
          e instanceof LeituraVisaoIndisponivel
            ? "O PDF do memorial é uma imagem (sem texto) e a leitura de PDFs escaneados não está ativada. Preencha a tabela manualmente."
            : "O PDF do memorial é uma imagem (sem texto) e a leitura automática falhou. Tente de novo ou preencha a tabela manualmente.",
        )
      }
      console.error("[azimute] leitura por visão do memorial falhou:", e instanceof Error ? e.message : e)
    }
  }

  let planta: AzimuteDados["planta"] = {}
  if (plantaPath) {
    try {
      const plantaBytes = await baixar(plantaPath)
      const plantaTexto = await textoDoPdf(plantaBytes).catch(() => "")
      const rodape = lerRodapePlanta(plantaTexto)
      if (!rodape.areaHa && !rodape.perimetroM && (escaneado || !temTexto(plantaTexto))) {
        try {
          const r = await transcreverRodapePlanta(plantaBytes)
          rodape.lote = r.lote?.replace(/^lote\s*/i, "").trim().toUpperCase() || rodape.lote
          rodape.gleba = r.gleba?.replace(/^(gleba|gl)\s*-?\s*/i, "").trim().toUpperCase() || rodape.gleba
          rodape.areaHa = numeroTranscrito(r.areaHa)
          rodape.perimetroM = numeroTranscrito(r.perimetroM)
        } catch (e) {
          console.error("[azimute] leitura por visão da planta falhou:", e instanceof Error ? e.message : e)
        }
      }
      planta = {
        lote: rodape.lote,
        gleba: rodape.gleba,
        areaHa: rodape.areaHa,
        perimetroM: rodape.perimetroM,
      }
      if (!rodape.areaHa && !rodape.perimetroM) avisos.push("Não foi possível ler área e perímetro no rodapé da planta; confira visualmente.")
    } catch {
      avisos.push("Não foi possível ler a planta; confira visualmente.")
    }
  }

  if (memorial) avisos.push(...memorial.avisos)
  const segmentos = (memorial?.segmentos ?? []).map((s) => ({
    de: s.de,
    para: s.para,
    azimute: s.azimute,
    azimuteTexto: s.azimuteTexto,
    tipo: s.tipo,
    distancia: s.distancia,
    ...(s.confrontante ? { confrontante: s.confrontante } : {}),
  }))

  // Coordenada de partida e fuso declarados no próprio memorial (quando existem).
  const coord = textoCoordenada.trim() ? lerCoordenadaInicial(textoCoordenada, memorial?.inicio) : undefined
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
