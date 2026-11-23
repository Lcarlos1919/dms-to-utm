import "server-only"

import type { ItemTexto } from "@/lib/topocad/tipos"
import { reconstruirLinhas } from "@/lib/topocad/texto"
import { analisarPaginasComOcr, ErroOcr, ocrConfigurado } from "@/lib/ocr/azure-document-intelligence"

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
  /** Páginas (1-based) que vieram do OCR com texto. */
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
 * Lê o PDF usando o texto nativo; só manda para o OCR as páginas sem texto.
 * Nunca derruba a leitura por causa do OCR: na falha, mantém o que o PDF já tinha e avisa.
 */
export async function lerPaginasComOcr(bytes: Uint8Array, opcoes: { maxPaginas: number }): Promise<LeituraPaginas> {
  const { getDocumentProxy, extractText, extractTextItems } = await import("unpdf")
  let pdf: Awaited<ReturnType<typeof getDocumentProxy>>
  try {
    pdf = await getDocumentProxy(bytes)
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

  if (!ocrConfigurado()) {
    return {
      texto: textos.join("\n"),
      itens,
      paginasOcr: [],
      avisos: [`Não há texto ${listar(semTexto)} (digitalizada). O OCR não está configurado neste ambiente, então confira esta parte no documento original.`],
    }
  }

  try {
    const resultado = await analisarPaginasComOcr(bytes, semTexto)
    const avisos: string[] = []
    const lidas: number[] = []
    for (const numero of semTexto) {
      const itensOcr = resultado.get(numero) ?? []
      if (itensOcr.length) {
        itens[numero - 1] = itensOcr
        textos[numero - 1] = reconstruirLinhas(itensOcr, 4).join("\n")
        lidas.push(numero)
      }
    }
    const naoLidas = semTexto.filter((n) => !lidas.includes(n))
    if (lidas.length) {
      avisos.push(`Texto ${listar(lidas)} foi reconhecido por OCR (digitalizada). Confira os números com o documento original.`)
    }
    if (naoLidas.length) {
      avisos.push(`Não foi possível reconhecer o texto ${listar(naoLidas)}. Confira no documento original.`)
    }
    return { texto: textos.join("\n"), itens, paginasOcr: lidas, avisos }
  } catch (erro) {
    const motivo = erro instanceof ErroOcr ? erro.message : "Falha inesperada no OCR."
    return {
      texto: textos.join("\n"),
      itens,
      paginasOcr: [],
      avisos: [`Não foi possível ler por OCR ${listar(semTexto)}. ${motivo} Confira no documento original.`],
    }
  }
}
