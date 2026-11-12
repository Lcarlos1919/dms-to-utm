import "server-only"

import { createAdminClient } from "@/lib/supabase/server"
import { MAX_PDF_SIZE } from "@/lib/pdf-validation"
import { lerMemorial } from "@/lib/vertix-core/memorial"
import { lerRodapePlanta } from "@/lib/vertix-core/planta"
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
  if (!memorialTexto.trim()) avisos.push("O PDF do memorial parece ser uma imagem (sem texto). Preencha a tabela manualmente.")

  let planta: AzimuteDados["planta"] = {}
  if (plantaPath) {
    try {
      const plantaTexto = await textoDoPdf(await baixar(plantaPath))
      const rodape = lerRodapePlanta(plantaTexto)
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

  const memorial = memorialTexto.trim() ? lerMemorial(memorialTexto) : null
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
    fuso: FUSO_PADRAO,
    hemisferio: "S",
    datum: "SIRGAS 2000",
    segmentos,
    avisosLeitura: avisos.slice(0, 50),
    lidoEm: new Date().toISOString(),
    revisadoEm: null,
  }
  return { dados, status: segmentos.length ? "lido" : "erro_leitura" }
}
