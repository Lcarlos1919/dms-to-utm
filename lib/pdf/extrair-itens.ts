import type { ItemTexto } from "@/lib/topocad"

const MAX_PAGINAS = 50
export class ErroApp extends Error { constructor(public codigo: string, mensagem: string) { super(mensagem) } }
export async function extrairItensDoPdf(bytes: Uint8Array): Promise<ItemTexto[][]> { if (bytes.byteLength > 10 * 1024 * 1024) throw new ErroApp("PDF_MUITO_GRANDE", "O PDF deve ter no máximo 10 MB."); const pdfjs = await import("unpdf"); let pdf: any; try { pdf = await pdfjs.getDocumentProxy(bytes) } catch { throw new ErroApp("PDF_INVALIDO", "Não foi possível abrir o PDF.") } if (pdf.numPages > MAX_PAGINAS) throw new ErroApp("PDF_MUITO_GRANDE", `O PDF tem mais de ${MAX_PAGINAS} páginas.`); const extraido = await pdfjs.extractTextItems(pdf); const paginas = extraido.items.map((items) => items.map((i) => ({ texto: i.str, x: i.x, y: i.y }))); if (paginas.every((p) => p.length === 0)) throw new ErroApp("PDF_SEM_TEXTO", "O PDF não contém texto selecionável."); return paginas }
