// Cliente REST do Azure AI Document Intelligence (modelo prebuilt-read) para páginas sem texto.
// Sem dependências: usa fetch. A chave fica só em variável de ambiente do servidor.
import type { ItemTexto } from "@/lib/topocad/tipos"

const API_VERSION = "2024-11-30"
const MODELO = "prebuilt-read"
// Rotas da Vercel têm maxDuration de 60 s e o OCR pode rodar duas vezes numa mesma requisição
// (memorial e planta): o limite por documento precisa caber nisso.
const TEMPO_TOTAL_MS = 25_000
const TEMPO_POR_CHAMADA_MS = 12_000

export class ErroOcr extends Error {
  readonly codigo: "OCR_NAO_CONFIGURADO" | "OCR_FALHOU" | "OCR_TIMEOUT"

  constructor(codigo: "OCR_NAO_CONFIGURADO" | "OCR_FALHOU" | "OCR_TIMEOUT", mensagem: string) {
    super(mensagem)
    this.codigo = codigo
  }
}

interface PalavraAzure {
  content?: string
  polygon?: number[]
}

export interface PaginaAzure {
  pageNumber: number
  width?: number
  height?: number
  unit?: string
  words?: PalavraAzure[]
}

interface RespostaAzure {
  status?: string
  analyzeResult?: { pages?: PaginaAzure[] }
  error?: { code?: string; message?: string }
}

function lerConfiguracao(): { endpoint: string; chave: string } | null {
  const endpoint = process.env.AZURE_DOCINTEL_ENDPOINT?.trim().replace(/\/+$/, "")
  const chave = process.env.AZURE_DOCINTEL_KEY?.trim()
  if (!endpoint || !chave) return null
  return { endpoint, chave }
}

export function ocrConfigurado(): boolean {
  return lerConfiguracao() !== null
}

/**
 * Converte as palavras do Azure para o formato dos itens do pdf.js:
 * x em pontos a partir da esquerda, y em pontos a partir de baixo.
 * Assim o mesmo agrupamento por linha (reconstruirLinhas) vale para as duas fontes.
 */
export function converterPaginasAzure(paginas: PaginaAzure[]): Map<number, ItemTexto[]> {
  const mapa = new Map<number, ItemTexto[]>()
  for (const pagina of paginas) {
    const escala = pagina.unit === "inch" ? 72 : 1
    const altura = (pagina.height ?? 0) * escala
    const itens: ItemTexto[] = []
    for (const palavra of pagina.words ?? []) {
      const texto = palavra.content?.trim()
      const ponto = palavra.polygon
      if (!texto || !ponto || ponto.length < 2) continue
      itens.push({ texto, x: ponto[0] * escala, y: altura - ponto[1] * escala })
    }
    mapa.set(pagina.pageNumber, itens)
  }
  return mapa
}

async function mensagemDeErro(resposta: Response): Promise<string> {
  try {
    const corpo = (await resposta.json()) as RespostaAzure
    if (corpo.error?.code) return `Serviço de OCR respondeu com erro (${corpo.error.code}).`
  } catch {
    // corpo não é JSON: usa a mensagem genérica abaixo
  }
  return `Serviço de OCR respondeu com status ${resposta.status}.`
}

/**
 * Envia só as páginas pedidas (1-based) e espera o resultado.
 * Devolve os itens de cada página pedida (vazio se o Azure não achou texto).
 */
export async function analisarPaginasComOcr(bytes: Uint8Array, paginas: number[]): Promise<Map<number, ItemTexto[]>> {
  const configuracao = lerConfiguracao()
  if (!configuracao) throw new ErroOcr("OCR_NAO_CONFIGURADO", "O OCR não está configurado.")

  const inicio = Date.now()
  const lista = [...new Set(paginas)].sort((a, b) => a - b).join(",")
  const url = `${configuracao.endpoint}/documentintelligence/documentModels/${MODELO}:analyze?api-version=${API_VERSION}&pages=${lista}`

  let envio: Response
  try {
    envio = await fetch(url, {
      method: "POST",
      headers: { "Ocp-Apim-Subscription-Key": configuracao.chave, "Content-Type": "application/json" },
      body: JSON.stringify({ base64Source: Buffer.from(bytes).toString("base64") }),
      signal: AbortSignal.timeout(TEMPO_POR_CHAMADA_MS),
    })
  } catch {
    throw new ErroOcr("OCR_FALHOU", "Não foi possível conectar ao serviço de OCR.")
  }
  if (envio.status !== 202) throw new ErroOcr("OCR_FALHOU", await mensagemDeErro(envio))

  const operacao = envio.headers.get("Operation-Location")
  if (!operacao) throw new ErroOcr("OCR_FALHOU", "O serviço de OCR não informou onde está o resultado.")

  let espera = Math.min(Math.max(Number(envio.headers.get("Retry-After")) || 2, 1), 5)
  while (true) {
    if (Date.now() - inicio > TEMPO_TOTAL_MS) throw new ErroOcr("OCR_TIMEOUT", "O OCR demorou mais que o limite de tempo.")
    await new Promise((resolve) => setTimeout(resolve, espera * 1000))

    let resposta: Response
    try {
      resposta = await fetch(operacao, {
        headers: { "Ocp-Apim-Subscription-Key": configuracao.chave },
        signal: AbortSignal.timeout(TEMPO_POR_CHAMADA_MS),
      })
    } catch {
      throw new ErroOcr("OCR_FALHOU", "Não foi possível consultar o resultado do OCR.")
    }
    if (!resposta.ok) throw new ErroOcr("OCR_FALHOU", await mensagemDeErro(resposta))

    const corpo = (await resposta.json()) as RespostaAzure
    if (corpo.status === "succeeded") {
      const mapa = converterPaginasAzure(corpo.analyzeResult?.pages ?? [])
      for (const numero of paginas) if (!mapa.has(numero)) mapa.set(numero, [])
      return mapa
    }
    if (corpo.status === "failed") throw new ErroOcr("OCR_FALHOU", "O serviço de OCR não conseguiu processar o arquivo.")
    espera = 1
  }
}
