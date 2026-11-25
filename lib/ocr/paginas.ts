import "server-only"

import type { ItemTexto } from "@/lib/topocad/tipos"
import { reconstruirLinhas } from "@/lib/topocad/texto"
import { analisarPaginasComOcr, ErroOcr, ocrConfigurado } from "@/lib/ocr/azure-document-intelligence"
import { ErroGemini, geminiConfigurado, transcreverPaginasComGemini } from "@/lib/ocr/gemini"
import { analisarPaginasComVision, ErroVision, visionConfigurado } from "@/lib/ocr/google-vision"

/** Página com menos caracteres que isso é tratada como digitalizada (imagem). */
const MIN_CARACTERES_PAGINA = 15

export class ErroPdf extends Error {
  constructor(
    public codigo: "PDF_INVALIDO" | "PDF_MUITO_GRANDE",
    mensagem: string,
  ) {
    super(mensagem)
  }
}

export interface LeituraPaginas {
  /** Texto corrido do PDF inteiro (páginas com texto nativo; OCR onde foi preciso). */
  texto: string
  /** Itens com posição por página, no mesmo formato do pdf.js. */
  itens: ItemTexto[][]
  /** Páginas (1-based) que vieram do OCR com texto (Azure ou Gemini). */
  paginasOcr: number[]
  avisos: string[]
}

function temTexto(pagina: string): boolean {
  return pagina.replace(/\s+/g, "").length >= MIN_CARACTERES_PAGINA
}

function listar(paginas: number[]): string {
  return paginas.length === 1 ? `na página ${paginas[0]}` : `nas páginas ${paginas.join(", ")}`
}

/**
 * Texto transcrito pelo Gemini não tem posição. Cada linha vira um item com a mesma coluna
 * e uma linha de altura, para o agrupamento por linha continuar valendo.
 */
function itensDeTexto(texto: string): ItemTexto[] {
  return texto
    .split("\n")
    .map((linha) => linha.trim())
    .filter(Boolean)
    .map((linha, i) => ({ texto: linha, x: 0, y: 2000 - i * 12 }))
}

/**
 * Lê o PDF usando o texto nativo; só manda para o OCR as páginas sem texto.
 * Ordem: Azure Document Intelligence; o que ele não ler vai para o Gemini (segunda via).
 * Nunca derruba a leitura por causa do OCR: na falha, mantém o que o PDF já tinha e avisa.
 */
export async function lerPaginasComOcr(bytes: Uint8Array, opcoes: { maxPaginas: number }): Promise<LeituraPaginas> {
  const { getDocumentProxy, extractText, extractTextItems } = await import("unpdf")
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>
  try {
    // O pdf.js transfere o buffer ao worker e o desanexa: sem essa cópia, `bytes` fica com 0 bytes
    // e o Azure e o Gemini recebem um PDF vazio (era a causa real do InvalidRequest).
    pdf = await getDocumentProxy(bytes.slice())
  } catch {
    throw new ErroPdf("PDF_INVALIDO", "Não foi possível abrir o PDF.")
  }
  if (pdf.numPages > opcoes.maxPaginas) throw new ErroPdf("PDF_MUITO_GRANDE", `O PDF tem mais de ${opcoes.maxPaginas} páginas.`)

  const porPagina = (await extractText(pdf, { mergePages: false })).text as string[]
  const extraido = await extractTextItems(pdf)
  const itens: ItemTexto[][] = extraido.items.map((linha) => linha.map((i) => ({ texto: i.str, x: i.x, y: i.y })))
  const textos = [...porPagina]
  while (textos.length < itens.length) textos.push("")

  const semTexto = textos.map((t, i) => (temTexto(t) ? 0 : i + 1)).filter((n) => n > 0)

  if (semTexto.length === 0) {
    const { text } = await extractText(pdf, { mergePages: true })
    return { texto: text as string, itens, paginasOcr: [], avisos: [] }
  }

  if (!ocrConfigurado() && !visionConfigurado() && !geminiConfigurado()) {
    return {
      texto: textos.join("\n"),
      itens,
      paginasOcr: [],
      avisos: [`Não há texto ${listar(semTexto)} (digitalizada). O OCR não está configurado neste ambiente, então confira esta parte no documento original.`],
    }
  }

  const avisos: string[] = []
  const lidas: number[] = []
  let motivoAzure: string | null = null

  if (ocrConfigurado()) {
    try {
      const resultado = await analisarPaginasComOcr(bytes, semTexto)
      for (const numero of semTexto) {
        const itensOcr = resultado.get(numero) ?? []
        if (itensOcr.length) {
          itens[numero - 1] = itensOcr
          textos[numero - 1] = reconstruirLinhas(itensOcr, 4).join("\n")
          lidas.push(numero)
        }
      }
    } catch (erro) {
      motivoAzure = erro instanceof ErroOcr ? erro.message : "Falha inesperada no OCR."
    }
  }

  const lidasVision: number[] = []
  let motivoVision: string | null = null
  let restantes = semTexto.filter((n) => !lidas.includes(n))
  if (restantes.length && visionConfigurado()) {
    try {
      const resultado = await analisarPaginasComVision(bytes, restantes)
      for (const numero of restantes) {
        const itensVision = resultado.get(numero) ?? []
        if (itensVision.length) {
          itens[numero - 1] = itensVision
          textos[numero - 1] = reconstruirLinhas(itensVision, 4).join("\n")
          lidasVision.push(numero)
        }
      }
    } catch (erro) {
      motivoVision = erro instanceof ErroVision ? erro.message : "Falha inesperada na Cloud Vision."
    }
    restantes = restantes.filter((n) => !lidasVision.includes(n))
  }

  let lidasGemini: number[] = []
  let motivoGemini: string | null = null
  if (restantes.length && geminiConfigurado()) {
    try {
      const transcritas = await transcreverPaginasComGemini(bytes, restantes)
      for (const numero of restantes) {
        const texto = transcritas.get(numero)
        if (texto) {
          itens[numero - 1] = itensDeTexto(texto)
          textos[numero - 1] = texto
          lidasGemini.push(numero)
        }
      }
    } catch (erro) {
      motivoGemini = erro instanceof ErroGemini ? erro.message : "Falha inesperada na segunda via."
    }
  }

  if (lidas.length) {
    avisos.push(`Texto ${listar(lidas)} foi reconhecido por OCR (digitalizada). Confira os números com o documento original.`)
  }
  if (lidasVision.length) {
    avisos.push(`Texto ${listar(lidasVision)} foi reconhecido pela Cloud Vision (digitalizada). Confira os números com o documento original.`)
  }
  if (lidasGemini.length) {
    avisos.push(`Texto ${listar(lidasGemini)} foi reconhecido pela segunda via (Gemini), porque o OCR principal não leu. Confira os números com o documento original.`)
  }

  const naoLidas = semTexto.filter((n) => !lidas.includes(n) && !lidasVision.includes(n) && !lidasGemini.includes(n))
  if (naoLidas.length) {
    const motivos = [motivoAzure, motivoVision, motivoGemini].filter(Boolean).join(" ")
    avisos.push(
      motivos
        ? `Não foi possível ler ${listar(naoLidas)}. ${motivos} Confira no documento original.`
        : `Não foi possível reconhecer o texto ${listar(naoLidas)}. Confira no documento original.`,
    )
  }

  return {
    texto: textos.join("\n"),
    itens,
    paginasOcr: [...lidas, ...lidasVision, ...lidasGemini],
    avisos,
  }
}
