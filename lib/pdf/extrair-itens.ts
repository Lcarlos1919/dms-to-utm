import "server-only"
import type { ItemTexto } from "@/lib/topocad"
import { ErroPdf, lerPaginasComOcr } from "@/lib/ocr/paginas"
import { MAX_PDF_SIZE } from "@/lib/pdf-validation"

const MAX_PAGINAS = 50
export class ErroApp extends Error { constructor(public codigo: string, mensagem: string) { super(mensagem) } }

/**
 * Itens de texto por página. Páginas com texto selecionável usam o texto do PDF;
 * páginas digitalizadas passam pelo OCR (Azure), quando configurado.
 */
export async function extrairItensComOcr(bytes: Uint8Array): Promise<{ paginas: ItemTexto[][]; avisos: string[] }> {
  if (bytes.byteLength > MAX_PDF_SIZE) throw new ErroApp("PDF_MUITO_GRANDE", "O PDF deve ter no máximo 50 MB.")
  let leitura: Awaited<ReturnType<typeof lerPaginasComOcr>>
  try {
    leitura = await lerPaginasComOcr(bytes, { maxPaginas: MAX_PAGINAS })
  } catch (e) {
    if (e instanceof ErroPdf) throw new ErroApp(e.codigo, e.message)
    throw e
  }
  if (leitura.itens.every((p) => p.length === 0)) {
    // Mostra o motivo (OCR desligado, falhou ou sem texto) em vez de uma mensagem genérica.
    const motivo = leitura.avisos.join(" ")
    throw new ErroApp("PDF_SEM_TEXTO", motivo ? `O PDF não contém texto selecionável. ${motivo}` : "O PDF não contém texto selecionável.")
  }
  return { paginas: leitura.itens, avisos: leitura.avisos }
}

export async function extrairItensDoPdf(bytes: Uint8Array): Promise<ItemTexto[][]> {
  return (await extrairItensComOcr(bytes)).paginas
}
