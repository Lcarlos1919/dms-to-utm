// Segunda via de OCR com a API do Gemini, usada só nas páginas que o Azure não conseguiu ler.
// Sem dependências: usa fetch. A chave fica só em variável de ambiente do servidor (GEMINI_API_KEY).

const TEMPO_MS = 25_000
// Inline data do Gemini aceita até ~20 MB no pedido inteiro; acima disso nem tentamos.
const LIMITE_BYTES = 18 * 1024 * 1024
const MODELO_PADRAO = "gemini-flash-latest"

export class ErroGemini extends Error {
  constructor(mensagem: string) {
    super(mensagem)
  }
}

export function geminiConfigurado(): boolean {
  return Boolean(process.env.GEMINI_API_KEY?.trim())
}

function modelo(): string {
  return process.env.GEMINI_OCR_MODEL?.trim() || MODELO_PADRAO
}

/**
 * Separa a resposta do modelo por página. O prompt pede marcadores "=== PÁGINA N ===".
 * Devolve só as páginas pedidas e com texto.
 */
export function separarPaginasGemini(resposta: string, pedidas: number[]): Map<number, string> {
  const mapa = new Map<number, string>()
  const partes = resposta.split(/^=== PÁGINA (\d+) ===\s*$/m)
  // split com grupo de captura: [antes, n1, texto1, n2, texto2, ...]
  for (let i = 1; i + 1 < partes.length; i += 2) {
    const numero = Number(partes[i])
    if (!pedidas.includes(numero)) continue
    const texto = partes[i + 1].trim()
    if (texto) mapa.set(numero, texto)
  }
  return mapa
}

/** Transcreve as páginas indicadas (1-based). Devolve o texto de cada uma que o modelo conseguiu ler. */
export async function transcreverPaginasComGemini(bytes: Uint8Array, paginas: number[]): Promise<Map<number, string>> {
  const chave = process.env.GEMINI_API_KEY?.trim()
  if (!chave) throw new ErroGemini("A segunda via (Gemini) não está configurada.")
  if (bytes.byteLength > LIMITE_BYTES) throw new ErroGemini("O PDF é grande demais para a segunda via.")

  const lista = [...new Set(paginas)].sort((a, b) => a - b)
  const prompt =
    `Transcreva literalmente o texto das páginas ${lista.join(", ")} deste PDF de memorial descritivo. ` +
    "Preserve números, coordenadas, unidades, pontuação, nomes de lotes e confrontações exatamente como aparecem. " +
    "Não resuma, não corrija e não interprete. " +
    "Antes do texto de cada página, escreva uma linha exatamente assim: === PÁGINA N === (N é o número da página). " +
    "Não inclua comentários fora do texto transcrito."

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${modelo()}:generateContent`
  let resposta: Response
  try {
    resposta = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-goog-api-key": chave },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { inlineData: { mimeType: "application/pdf", data: Buffer.from(bytes).toString("base64") } },
              { text: prompt },
            ],
          },
        ],
        generationConfig: { temperature: 0, maxOutputTokens: 8192 },
      }),
      signal: AbortSignal.timeout(TEMPO_MS),
    })
  } catch {
    throw new ErroGemini("Não foi possível conectar à segunda via (Gemini).")
  }

  if (!resposta.ok) {
    let detalhe = ""
    try {
      const corpo = (await resposta.json()) as { error?: { message?: string; status?: string } }
      detalhe = (corpo.error?.message ?? corpo.error?.status ?? "").replace(/\s+/g, " ").slice(0, 160)
    } catch {
      // corpo não é JSON
    }
    throw new ErroGemini(`A segunda via (Gemini) respondeu com status ${resposta.status}${detalhe ? `: ${detalhe}` : ""}.`)
  }

  const corpo = (await resposta.json()) as { candidates?: { content?: { parts?: { text?: string }[] } }[] }
  const texto = (corpo.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join("")
  if (!texto.trim()) throw new ErroGemini("A segunda via (Gemini) não devolveu texto.")
  return separarPaginasGemini(texto, lista)
}
