// OCR de PDF com a Cloud Vision API (files:annotate, DOCUMENT_TEXT_DETECTION).
// Sem dependências: usa fetch. A chave fica só em variável de ambiente do servidor (GOOGLE_VISION_API_KEY).
import type { ItemTexto } from "@/lib/topocad/tipos"

const ENDPOINT = "https://vision.googleapis.com/v1/files:annotate"
// A API aceita até 5 páginas de PDF por pedido síncrono.
const PAGINAS_POR_PEDIDO = 5
const TEMPO_MS = 40_000
// O PDF vai em base64 dentro do JSON (+33%); mantemos o pedido abaixo do limite da API.
const LIMITE_BYTES = 7 * 1024 * 1024

export class ErroVision extends Error {
  constructor(mensagem: string) {
    super(mensagem)
  }
}

export function visionConfigurado(): boolean {
  return Boolean(process.env.GOOGLE_VISION_API_KEY?.trim())
}

interface Vertice { x?: number; y?: number }
interface Palavra { symbols?: { text?: string }[]; boundingBox?: { vertices?: Vertice[] } }
interface RespostaPagina {
  fullTextAnnotation?: {
    pages?: { blocks?: { paragraphs?: { words?: Palavra[] }[] }[] }[]
  }
  error?: { message?: string }
}

/** Converte as palavras da página em itens com posição (y cresce para cima, como no pdf.js). */
function itensDaPagina(resposta: RespostaPagina): ItemTexto[] {
  const itens: ItemTexto[] = []
  for (const pagina of resposta.fullTextAnnotation?.pages ?? []) {
    for (const bloco of pagina.blocks ?? []) {
      for (const paragrafo of bloco.paragraphs ?? []) {
        for (const palavra of paragrafo.words ?? []) {
          const texto = (palavra.symbols ?? []).map((s) => s.text ?? "").join("").trim()
          const topo = palavra.boundingBox?.vertices?.[0]
          if (!texto || topo?.x === undefined || topo?.y === undefined) continue
          itens.push({ texto, x: topo.x, y: -topo.y })
        }
      }
    }
  }
  return itens
}

/**
 * Lê as páginas indicadas (1-based) pela Cloud Vision.
 * Devolve os itens de cada página que foi reconhecida. Lança ErroVision se a chamada inteira falhar.
 */
export async function analisarPaginasComVision(bytes: Uint8Array, paginas: number[]): Promise<Map<number, ItemTexto[]>> {
  const chave = process.env.GOOGLE_VISION_API_KEY?.trim()
  if (!chave) throw new ErroVision("A Cloud Vision não está configurada.")
  if (bytes.byteLength > LIMITE_BYTES) throw new ErroVision("O PDF é grande demais para a Cloud Vision.")

  const lista = [...new Set(paginas)].sort((a, b) => a - b)
  const conteudo = Buffer.from(bytes).toString("base64")
  const resultado = new Map<number, ItemTexto[]>()

  for (let i = 0; i < lista.length; i += PAGINAS_POR_PEDIDO) {
    const lote = lista.slice(i, i + PAGINAS_POR_PEDIDO)
    let resposta: Response
    try {
      resposta = await fetch(`${ENDPOINT}?key=${encodeURIComponent(chave)}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          requests: [
            {
              inputConfig: { mimeType: "application/pdf", content: conteudo },
              features: [{ type: "DOCUMENT_TEXT_DETECTION" }],
              pages: lote,
            },
          ],
        }),
        signal: AbortSignal.timeout(TEMPO_MS),
      })
    } catch {
      throw new ErroVision("Não foi possível conectar à Cloud Vision.")
    }

    const corpo = (await resposta.json().catch(() => ({}))) as {
      responses?: { responses?: RespostaPagina[]; error?: { message?: string } }[]
      error?: { message?: string }
    }
    if (!resposta.ok || corpo.error) {
      throw new ErroVision(`Cloud Vision recusou o pedido: ${corpo.error?.message ?? resposta.status}.`)
    }
    const paginasLidas = corpo.responses?.[0]?.responses ?? []
    lote.forEach((numero, indice) => {
      const pagina = paginasLidas[indice]
      if (!pagina || pagina.error) return
      const itens = itensDaPagina(pagina)
      if (itens.length) resultado.set(numero, itens)
    })
  }
  return resultado
}
